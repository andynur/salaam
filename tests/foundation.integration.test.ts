import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../src/core/database/migrations";
import { createAuthService } from "../src/core/auth/service";
import { bootstrapAdmin } from "../src/modules/users/service";
import { loadConfig } from "../src/core/config";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { academicSummary } from "../src/modules/academic/summary";
import type { RecordPage } from "../src/shared/foundation";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 1 foundation (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminCookie: string;
  let adminId: string;
  const schema = `hsi_phase1_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie = adminCookie, body?: unknown, origin = config.baseUrl) {
    return handle(new Request(`${config.baseUrl}${path}`, { method: body === undefined ? "GET" : "POST", headers: { cookie, origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const post = (resource: string, body: unknown, cookie = adminCookie) => request(`/api/admin/${resource}`, cookie, body);
  async function create(resource: string, body: unknown) {
    const response = await post(resource, body);
    expect(response.status).toBe(201);
    return (await response.json() as { id: string }).id;
  }
  async function login(email: string) {
    const response = await request("/api/auth/login", "", { email, password });
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0]!;
  }
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    const admin = await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "A-001", password });
    adminId = admin.id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, { foundation: createFoundationHandler(db), dashboard: actor => academicSummary(db, actor, config.timezone) });
    adminCookie = await login("admin@example.test");
  });
  afterAll(async () => {
    if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
  });
  test("first-admin bootstrap refuses a second admin without changing existing accounts", async () => {
    await expect(bootstrapAdmin(db, { email: "bootstrap2@example.test", name: "Admin", identifier: "A-BOOT2", password })).rejects.toThrow("Admin sudah tersedia");
    expect((await db`SELECT * FROM users WHERE email = 'bootstrap2@example.test'`).length).toBe(0);
    const rows = await db`SELECT * FROM audit_logs WHERE event = 'user.bootstrap_admin'`;
    expect(rows.length).toBe(1);
    expect(rows[0].actor_id).toBe(adminId);
  });
  test("complete admin workflow, relational validation, role-scoped dashboard and secret-free audit", async () => {
    const studentId = await create("users", { name: "Santri", email: " STUDENT@example.test ", role: "student", identifier: "NIS-001", password });
    const teacherId = await create("users", { name: "Guru", email: "teacher@example.test", role: "teacher", identifier: "G-001", password });
    const secondAdmin = await create("users", { name: "Admin 2", email: "admin2@example.test", role: "admin", identifier: "A-002", password });
    expect((await db`SELECT * FROM user_profiles WHERE user_id = ${secondAdmin}`).length).toBe(1);
    const stored = (await db`SELECT password_hash FROM users WHERE id = ${studentId}`)[0];
    expect(stored.password_hash).toStartWith("$argon2id$");
    expect(await Bun.password.verify(password, stored.password_hash)).toBe(true);
    const yearId = await create("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    const nextYearId = await create("years", { name: "2027/2028", startsOn: "2027-07-01", endsOn: "2028-06-30" });
    expect((await post("terms", { yearId, name: "Outside", startsOn: "2026-06-30", endsOn: "2026-12-31" })).status).toBe(400);
    const termId = await create("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    const classId = await create("classes", { name: "X A", yearId });
    const otherClass = await create("classes", { name: "X B", yearId });
    const nextClass = await create("classes", { name: "XI A", yearId: nextYearId });
    await create("enrollments", { classId, studentId });
    expect((await post("enrollments", { classId: otherClass, studentId })).status).toBe(409);
    expect((await post("enrollments", { classId, studentId: teacherId })).status).toBe(400);
    await create("enrollments", { classId: nextClass, studentId });
    const subjectId = await create("subjects", { name: "Informatika", code: "it" });
    expect((await post("subjects", { name: "Duplicate", code: "IT" })).status).toBe(409);
    expect((await post("courses", { name: "Invalid year", termId, classId: nextClass, subjectId })).status).toBe(400);
    const courseId = await create("courses", { name: "Dasar Web", termId, classId, subjectId });
    const otherCourse = await create("courses", { name: "Web B", termId, classId: otherClass, subjectId });
    expect((await post("courses", { name: "Duplicate", termId, classId, subjectId })).status).toBe(409);
    expect((await post("teaching-assignments", { courseId, teacherId: studentId })).status).toBe(400);
    const assignmentId = await create("teaching-assignments", { courseId, teacherId });
    expect((await post("teaching-assignments", { courseId, teacherId })).status).toBe(409);
    await db`UPDATE users SET is_active = false WHERE id = ${teacherId}`;
    expect((await post("teaching-assignments", { courseId: otherCourse, teacherId })).status).toBe(400);
    await db`UPDATE users SET is_active = true WHERE id = ${teacherId}`;
    const resources = ["users", "years", "terms", "classes", "enrollments", "subjects", "courses", "teaching-assignments", "audit"];
    for (const resource of resources) {
      const response = await request(`/api/admin/${resource}`);
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content).not.toContain(password);
      expect(content).not.toContain("password_hash");
      expect(content).not.toContain("token_hash");
    }
    const audit = await db`SELECT * FROM audit_logs WHERE resource_id = ${assignmentId}`;
    expect(audit.length).toBe(1);
    expect(audit[0].actor_id).toBe(adminId);
    expect(audit[0].request_id).toBeTruthy();
    expect(audit[0].metadata).toEqual({});
    // Student dashboards count published courses only; teachers also count assigned drafts.
    await db`UPDATE courses SET published = true WHERE id = ${courseId}`;
    for (const email of ["student@example.test", "teacher@example.test"]) {
      const cookie = await login(email);
      for (const resource of resources) {
        expect((await request(`/api/admin/${resource}`, cookie)).status).toBe(403);
        expect((await post(resource, {}, cookie)).status).toBe(403);
      }
      expect(await (await request("/api/dashboard", cookie)).json()).toMatchObject({ courses: 1 });
      expect((await request("/api/auth/logout", cookie, {})).status).toBe(204);
      expect((await request("/api/auth/me", cookie)).status).toBe(401);
    }
    expect(await (await request("/api/dashboard")).json()).toMatchObject({ courses: 2, classes: 3 });
  });
  test("server permissions and CSRF are required for every administration endpoint", async () => {
    expect((await request("/api/admin/users", "")).status).toBe(401);
    expect((await post("years", {}, "")).status).toBe(401);
    expect((await request("/api/admin/years", adminCookie, {}, "https://evil.example")).status).toBe(403);
    expect((await request("/api/admin/years", adminCookie, {}, "")).status).toBe(403);
    expect((await post("audit", {})).status).toBe(405);
    expect((await post("missing", {})).status).toBe(404);
    await db`DELETE FROM role_permissions USING roles, permissions WHERE role_permissions.role_id = roles.id AND role_permissions.permission_id = permissions.id AND roles.key = 'admin' AND permissions.key = 'admin.users.manage'`;
    expect((await request("/api/admin/users")).status).toBe(403);
    expect((await post("users", {})).status).toBe(403);
    await db`INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'admin' AND p.key = 'admin.users.manage'`;
  });
  test("administrator recovery resets the password, revokes every session and is audited", async () => {
    const recoveredId = await create("users", { name: "Lupa Sandi", email: "recovery@example.test", role: "student", identifier: "NIS-R", password });
    const cookie = await login("recovery@example.test");
    expect((await request("/api/auth/me", cookie)).status).toBe(200);
    const next = `${password}-baru`;
    const path = `/api/admin/users/${recoveredId}/password`;
    expect((await request(path, cookie, { password: next })).status).toBe(403);
    expect((await request(path, adminCookie, { password: next }, "https://evil.example")).status).toBe(403);
    expect((await request(path, adminCookie, { password: "short" })).status).toBe(400);
    expect((await request(`/api/admin/users/not-uuid/password`, adminCookie, { password: next })).status).toBe(400);
    expect((await request(`/api/admin/users/${crypto.randomUUID()}/password`, adminCookie, { password: next })).status).toBe(404);
    expect((await request(path)).status).toBe(405);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'user.password_reset'`).length).toBe(0);
    const response = await request(path, adminCookie, { password: next });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: recoveredId, sessionsRevoked: 1 });
    expect((await request("/api/auth/me", cookie)).status).toBe(401);
    expect((await request("/api/auth/login", "", { email: "recovery@example.test", password })).status).toBe(401);
    const restored = await request("/api/auth/login", "", { email: "recovery@example.test", password: next });
    expect(restored.status).toBe(200);
    const recoveredCookie = restored.headers.get("set-cookie")!.split(";")[0]!;
    expect((await request("/api/auth/logout", recoveredCookie, {})).status).toBe(204);
    expect(await (await request(path, adminCookie, { password: next })).json()).toEqual({ id: recoveredId, sessionsRevoked: 0 });
    const audit = await db`SELECT * FROM audit_logs WHERE event = 'user.password_reset' ORDER BY created_at`;
    expect(audit.length).toBe(2);
    expect(audit[0].actor_id).toBe(adminId);
    expect(audit[0].resource_type).toBe("user");
    expect(audit[0].resource_id).toBe(recoveredId);
    const stored = (await db`SELECT password_hash FROM users WHERE id = ${recoveredId}`)[0];
    expect(stored.password_hash).toStartWith("$argon2id$");
    expect(await Bun.password.verify(next, stored.password_hash)).toBe(true);
  });
  test("student import previews row errors and commits accounts plus enrollment atomically", async () => {
    const classId = (await db`SELECT id FROM classes WHERE name = 'X A' LIMIT 1`)[0].id as string;
    const rows = [{ name: "Import One", email: "import-one@example.test", identifier: "NIS-IMPORT-1", password }, { name: "Bad", email: "not-email", identifier: "", password: "short" }];
    const preview = await request("/api/admin/imports/students", adminCookie, { mode: "preview", classId, rows });
    expect(preview.status).toBe(200);
    expect((await preview.json()).rows[1].errors.length).toBeGreaterThan(0);
    expect((await post("imports/students", { mode: "commit", classId, rows })).status).toBe(400);
    expect((await db`SELECT * FROM users WHERE email = 'import-one@example.test'`).length).toBe(0);
    const valid = [{ name: "Import One", email: "import-one@example.test", identifier: "NIS-IMPORT-1", password }];
    expect((await post("imports/students", { mode: "commit", classId, rows: valid })).status).toBe(200);
    expect(await (await post("imports/students", { mode: "commit", classId, rows: valid })).json()).toMatchObject({ created: 0, skipped: 1 });
    expect((await db`SELECT count(*)::int AS count FROM class_members m JOIN users u ON u.id = m.student_id WHERE u.email = 'import-one@example.test'`)[0].count).toBe(1);
  });
  test("duplicate profiles roll back user, role and audit; concurrent enrollment has a single winner", async () => {
    const base = { name: "Concurrent Student", email: "concurrent@example.test", role: "student", identifier: "NIS-C", password };
    const studentId = await create("users", base);
    const auditBefore = (await db`SELECT count(*)::int AS count FROM audit_logs`)[0].count;
    expect((await post("users", { ...base, email: "duplicate-profile@example.test" })).status).toBe(409);
    expect((await db`SELECT * FROM users WHERE email = 'duplicate-profile@example.test'`).length).toBe(0);
    expect((await db`SELECT count(*)::int AS count FROM audit_logs`)[0].count).toBe(auditBefore);
    const classId = (await db`SELECT id FROM classes WHERE name = 'X A'`)[0].id;
    const responses = await Promise.all([post("enrollments", { classId, studentId }), post("enrollments", { classId, studentId })]);
    expect(responses.map(result => result.status).sort()).toEqual([201, 409]);
    expect((await db`SELECT * FROM class_members WHERE student_id = ${studentId}`).length).toBe(1);
    expect((await db`SELECT * FROM audit_logs WHERE resource_id IN (SELECT id FROM class_members WHERE student_id = ${studentId})`).length).toBe(1);
  });
  test("audit failure rolls back the academic mutation", async () => {
    await db`ALTER TABLE audit_logs ADD CONSTRAINT reject_qa_year_event CHECK (event <> 'academic.years.created') NOT VALID`;
    try {
      const response = await post("years", { name: "Must roll back", startsOn: "2030-07-01", endsOn: "2031-06-30" });
      expect(response.status).toBe(400);
      expect((await db`SELECT * FROM academic_years WHERE name = 'Must roll back'`).length).toBe(0);
    } finally { await db`ALTER TABLE audit_logs DROP CONSTRAINT reject_qa_year_event`; }
  });
  test("bounded pagination, literal search and invalid input", async () => {
    await db`INSERT INTO subjects (code, name) SELECT 'SUB-' || n, 'Subject ' || n FROM generate_series(1, 55) n`;
    const first = await (await request("/api/admin/subjects")).json() as RecordPage;
    expect(first.items.length).toBe(50);
    expect(first.nextOffset).toBe(50);
    const second = await (await request("/api/admin/subjects?offset=50")).json() as RecordPage;
    expect(second.items.length).toBe(6);
    expect(second.nextOffset).toBeNull();
    expect(second.items.some(row => first.items.some(other => other.id === row.id))).toBe(false);
    expect((await (await request("/api/admin/subjects?q=%25")).json() as RecordPage).items).toEqual([]);
    for (const body of [{}, { name: "Bad", yearId: "not-uuid" }]) expect((await post("classes", body)).status).toBe(400);
    expect((await post("classes", { name: "Missing", yearId: crypto.randomUUID() })).status).toBe(400);
    expect((await post("users", { name: "Bad", role: "superadmin", email: "bad@example.test", identifier: "BAD", password })).status).toBe(400);
    expect((await post("users", { name: "Bad", role: "student", email: "bad@example.test", identifier: "BAD", password: "short" })).status).toBe(400);
  });
});
