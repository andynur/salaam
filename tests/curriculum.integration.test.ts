import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createCurriculumHandler } from "../src/core/curriculum-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import type { CurriculumDetail, CurriculumGradeSummary, CurriculumImportResult, CurriculumOverview, CurriculumWeek } from "../src/shared/curriculum";

const url = process.env.TEST_DATABASE_URL;
const header = "grade,semester,phase,week,title,objectives,content,practice,assessment,source";
const csv = (...rows: string[]) => [header, ...rows].join("\n");
const rows = [
  "X,1,Digital Fluency,1,Inside My Computer,Memahami perangkat,Hardware; software,Audit perangkat,Weekly Quest; evidence checklist,https://arc-d.lovable.app/",
  'X,1,Digital Fluency,2,Which OS Fits Me?,"Mengenali OS, fungsi, dan perbedaannya",Windows; macOS,Perbandingan OS,Weekly Quest,',
  "XI,2,Fullstack Integration,11,React Backend Integration,Menghubungkan React,Fetch; loading,Hubungkan dashboard,SKL 2,roadmap-kelas-xi.md",
];
const fields = (week: CurriculumWeek) => ({ version: week.version, phase: week.phase, title: week.title, objective: week.objective, content: week.content, practice: week.practice, assessment: week.assessment, source: week.source });

describe.skipIf(!url)("Curriculum map (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let admin: string;
  let teacher: string;
  let student: string;
  const schema = `hsi_curriculum_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: `.test-artifacts/${schema}`, NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST", origin = config.baseUrl) {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  function upload(text: string, cookie: string, origin = config.baseUrl) {
    const form = new FormData();
    form.set("file", new File([text], "curriculum.csv", { type: "text/csv" }));
    return handle(new Request(`${config.baseUrl}/api/curriculum/import`, { method: "POST", headers: { cookie, origin }, body: form }), crypto.randomUUID());
  }
  async function json<T>(response: Promise<Response>, status = 200): Promise<T> {
    const result = await response;
    expect(result.status).toBe(status);
    return await result.json() as T;
  }
  async function login(email: string) {
    const response = await request("/api/auth/login", "", { email, password });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0]!;
  }
  async function user(name: string, role: string) {
    await createUser(db, { name, role, email: `${name}@example.test`, identifier: name, password }, adminId, crypto.randomUUID());
    return login(`${name}@example.test`);
  }
  const count = async (event: string) => (await db`SELECT count(*)::int AS n FROM audit_logs WHERE event = ${event}`)[0].n as number;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, { foundation: createFoundationHandler(db), curriculum: createCurriculumHandler(db), dashboard: async () => ({}) });
    admin = await login("admin@example.test");
    teacher = await user("guru", "teacher");
    student = await user("santri", "student");
  });
  afterAll(async () => {
    if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
  });

  test("grades are seeded: X and XI published, XII coming soon, no weeks before an import", async () => {
    const overview = await json<CurriculumOverview>(request("/api/curriculum", student));
    expect(overview.canManage).toBe(false);
    expect(overview.grades.map(grade => [grade.grade, grade.published, grade.weeks])).toEqual([["X", true, 0], ["XI", true, 0], ["XII", false, 0]]);
    expect(overview.grades[1]!.semesters.map(item => [item.semester, item.theme])).toEqual([[1, "Modern Frontend Development"], [2, "Backend & Fullstack Development"]]);
    expect((await json<CurriculumOverview>(request("/api/curriculum", admin))).canManage).toBe(true);
    expect((await json<CurriculumOverview>(request("/api/curriculum", teacher))).canManage).toBe(false);
    expect((await request("/api/curriculum", "")).status).toBe(401);
    expect((await request("/api/curriculum/unknown", student)).status).toBe(404);
  });

  test("only academic.manage imports, from the same origin, and an invalid file writes nothing", async () => {
    expect((await upload(csv(...rows), teacher)).status).toBe(403);
    expect((await upload(csv(...rows), admin, "http://evil.test")).status).toBe(403);
    const invalid = await upload(csv(rows[0]!, "X,1,Fase,40,Judul,,,,,"), admin);
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { message: string } }).error.message).toContain("Baris 3");
    expect((await upload(csv(rows[0]!, rows[0]!), admin)).status).toBe(400);
    expect((await db`SELECT count(*)::int AS n FROM curriculum_weeks`)[0].n).toBe(0);
    expect(await count("curriculum.imported")).toBe(0);
  });

  test("import is idempotent and a revised file updates only the weeks that changed", async () => {
    expect(await json<CurriculumImportResult>(upload(csv(...rows), admin))).toEqual({ created: 3, updated: 0, unchanged: 0 });
    expect(await json<CurriculumImportResult>(upload(csv(...rows), admin))).toEqual({ created: 0, updated: 0, unchanged: 3 });
    const revised = rows[0]!.replace("Inside My Computer", "Inside My Laptop");
    expect(await json<CurriculumImportResult>(upload(csv(revised, rows[1]!), admin))).toEqual({ created: 0, updated: 1, unchanged: 1 });
    const detail = await json<CurriculumDetail>(request("/api/curriculum/grades/X", student));
    expect(detail.weeks.map(week => [week.semester, week.week, week.title, week.version])).toEqual([[1, 1, "Inside My Laptop", 2], [1, 2, "Which OS Fits Me?", 1]]);
    expect([detail.weeks[0]!.content, detail.weeks[1]!.objective, detail.weeks[1]!.source]).toEqual([["Hardware", "software"], "Mengenali OS, fungsi, dan perbedaannya", ""]);
    expect([detail.grade.weeks, detail.grade.phases, detail.grade.semesters.map(item => item.weeks)]).toEqual([2, 1, [2, 0]]);
    expect((await json<CurriculumDetail>(request("/api/curriculum/grades/XI", student))).weeks.map(week => week.title)).toEqual(["React Backend Integration"]);
    expect(await count("curriculum.imported")).toBe(2);
  });

  test("an unpublished grade is hidden from readers and visible to managers", async () => {
    await json(upload(csv("XII,1,Capstone,1,Draft Week,,,,,"), admin));
    expect((await request("/api/curriculum/grades/XII", student)).status).toBe(404);
    expect((await request("/api/curriculum/grades/XII", teacher)).status).toBe(404);
    expect((await request("/api/curriculum/grades/XIII", admin)).status).toBe(404);
    expect((await json<CurriculumDetail>(request("/api/curriculum/grades/XII", admin))).weeks).toHaveLength(1);
  });

  test("week revisions are versioned: identical retries return the row and stale edits get 409", async () => {
    const [week] = (await json<CurriculumDetail>(request("/api/curriculum/grades/X", admin))).weeks;
    const path = `/api/curriculum/weeks/${week!.id}`;
    const body = { ...fields(week!), title: "Inside My Device", content: ["Hardware", "Software", "Cloud"] };
    expect((await request(path, teacher, body, "PATCH")).status).toBe(403);
    expect((await request(path, admin, body, "PATCH", "http://evil.test")).status).toBe(403);
    const updated = await json<CurriculumWeek>(request(path, admin, body, "PATCH"));
    expect([updated.title, updated.version, updated.content]).toEqual(["Inside My Device", week!.version + 1, ["Hardware", "Software", "Cloud"]]);
    expect((await json<CurriculumWeek>(request(path, admin, body, "PATCH"))).version).toBe(updated.version);
    expect((await request(path, admin, { ...body, title: "Another title" }, "PATCH")).status).toBe(409);
    expect((await request(path, admin, { ...body, title: " " }, "PATCH")).status).toBe(400);
    expect((await request(`/api/curriculum/weeks/${crypto.randomUUID()}`, admin, body, "PATCH")).status).toBe(404);
    expect((await request("/api/curriculum/weeks/not-a-uuid", admin, body, "PATCH")).status).toBe(400);
    expect(await count("curriculum.week.updated")).toBe(1);
  });

  test("concurrent week edits from the same version: one wins, the other gets 409", async () => {
    const [, week] = (await json<CurriculumDetail>(request("/api/curriculum/grades/X", admin))).weeks;
    const path = `/api/curriculum/weeks/${week!.id}`;
    const statuses = (await Promise.all(["Pilihan A", "Pilihan B"].map(title => request(path, admin, { ...fields(week!), title }, "PATCH")))).map(response => response.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  test("publishing a grade revises its program and themes and opens it to readers", async () => {
    const xii = (await json<CurriculumOverview>(request("/api/curriculum", admin))).grades.find(grade => grade.grade === "XII")!;
    const body = { version: xii.version, program: "Software Engineering Capstone", goal: "Target kelas XII", themes: ["Capstone", "Industri"], published: true };
    expect((await request("/api/curriculum/grades/XII", teacher, body, "PATCH")).status).toBe(403);
    expect((await request("/api/curriculum/grades/XII", admin, { ...body, themes: ["Capstone"] }, "PATCH")).status).toBe(400);
    const saved = await json<CurriculumGradeSummary>(request("/api/curriculum/grades/XII", admin, body, "PATCH"));
    expect([saved.published, saved.program, saved.version, saved.semesters.map(item => item.theme)]).toEqual([true, "Software Engineering Capstone", xii.version + 1, ["Capstone", "Industri"]]);
    expect((await json<CurriculumGradeSummary>(request("/api/curriculum/grades/XII", admin, body, "PATCH"))).version).toBe(saved.version);
    expect((await request("/api/curriculum/grades/XII", admin, { ...body, published: false }, "PATCH")).status).toBe(409);
    expect((await json<CurriculumDetail>(request("/api/curriculum/grades/XII", student))).weeks).toHaveLength(1);
    expect(await count("curriculum.grade.published")).toBe(1);
  });

  test("concurrent imports of the same file create each week once", async () => {
    const file = csv("XI,2,Database Fundamental,7,Database Concept,,,,,", "XI,2,Database Fundamental,8,SQL Dasar,,,,,");
    const results = await Promise.all(Array.from({ length: 4 }, () => json<CurriculumImportResult>(upload(file, admin))));
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(2);
    expect(results.reduce((sum, result) => sum + result.unchanged, 0)).toBe(6);
  });

  test("an audit failure rolls back imports and revisions", async () => {
    await db.unsafe(`CREATE FUNCTION reject_curriculum_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event LIKE 'curriculum.%' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`);
    await db.unsafe(`CREATE TRIGGER reject_curriculum_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_curriculum_audit()`);
    try {
      expect((await upload(csv("XI,1,Programming Foundation,1,Software Engineering Mindset,,,,,"), admin)).status).toBe(500);
      expect((await db`SELECT count(*)::int AS n FROM curriculum_weeks WHERE grade = 'XI' AND semester = 1`)[0].n).toBe(0);
      const [week] = (await json<CurriculumDetail>(request("/api/curriculum/grades/X", admin))).weeks;
      expect((await request(`/api/curriculum/weeks/${week!.id}`, admin, { ...fields(week!), title: "Rolled back" }, "PATCH")).status).toBe(500);
      expect((await db`SELECT title, version FROM curriculum_weeks WHERE id = ${week!.id}`)[0]).toEqual({ title: week!.title, version: week!.version });
    } finally {
      await db.unsafe(`DROP TRIGGER reject_curriculum_audit ON audit_logs`);
      await db.unsafe(`DROP FUNCTION reject_curriculum_audit()`);
    }
  });
});
