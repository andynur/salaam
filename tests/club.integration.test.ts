import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { rm } from "node:fs/promises";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { createProjectHandler } from "../src/core/project-http";
import { createAttendanceHandler } from "../src/core/attendance-http";
import { createClubHandler } from "../src/core/club-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import type { AcademicResource } from "../src/shared/foundation";
import type { Page } from "../src/shared/learning";
import type { ProjectRow } from "../src/shared/project";
import type { ClubChallengeRow, ClubCourseRow, ClubDetail, ClubMeetingRow, ClubPerson, ClubProgressRow, ClubSummary } from "../src/shared/club";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Club management (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let clubId: string;
  let courseId: string;
  let otherCourseId: string;
  let lessonId: string;
  let challengeId: string;
  let admin: string;
  const people: Record<string, { id: string; cookie: string }> = {};
  const schema = `hsi_club_${crypto.randomUUID().replaceAll("-", "")}`;
  const storage = `.test-artifacts/${schema}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: storage, NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST", origin = config.baseUrl) {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const club = (suffix = "") => `/api/clubs/${clubId}${suffix ? `/${suffix}` : ""}`;
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
    const { id } = await createUser(db, { name, role, email: `${name}@example.test`, identifier: name, password }, adminId, crypto.randomUUID());
    people[name] = { id, cookie: await login(`${name}@example.test`) };
    return people[name]!;
  }
  async function academic(resource: AcademicResource, body: Record<string, unknown>) {
    return (await createAcademic(db, resource, body, adminId, crypto.randomUUID())).id;
  }

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, {
      foundation: createFoundationHandler(db), learning: createLearningHandler(db, storage),
      projects: createProjectHandler(db, storage), attendance: createAttendanceHandler(db),
      clubs: createClubHandler(db), dashboard: async () => ({}),
    });
    admin = await login("admin@example.test");
    for (const [name, role] of [["mentor", "teacher"], ["otherteacher", "teacher"], ["santri", "student"], ["peer", "student"], ["outsider", "student"]] as const) await user(name, role);
    const yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    const termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    const classId = await academic("classes", { yearId, name: "X A" });
    const otherClassId = await academic("classes", { yearId, name: "X B" });
    for (const name of ["santri", "peer"]) await academic("enrollments", { classId, studentId: people[name]!.id });
    await academic("enrollments", { classId: otherClassId, studentId: people.outsider!.id });
    const subjectId = await academic("subjects", { name: "Informatika", code: "INF" });
    courseId = await academic("courses", { name: "Pemrograman Dasar", classId, termId, subjectId });
    otherCourseId = await academic("courses", { name: "Pemrograman Lanjut", classId: otherClassId, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId: people.mentor!.id });
    await academic("teaching-assignments", { courseId: otherCourseId, teacherId: people.otherteacher!.id });
    clubId = (await db<{ id: string }[]>`SELECT id FROM clubs WHERE slug = 'coders-club'`)[0]!.id;
  });
  afterAll(async () => {
    if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
    await rm(storage, { recursive: true, force: true });
  });

  test("the migration seeds Coders Club, and only managers see it before membership exists", async () => {
    const list = await json<Page<ClubSummary>>(request("/api/clubs", admin));
    // Migrations seed the school's three clubs, ordered by name.
    expect(list.items.map(item => item.slug)).toEqual(["builders-club", "coders-club", "multimedia-club"]);
    expect(list.items.every(item => item.published && !item.archived && item.canAdmin)).toBe(true);
    expect(list.items[1]).toMatchObject({ slug: "coders-club", name: "Coders Club", published: true, canManage: true, membership: null, mentors: 0, members: 0, courses: 0 });
    const detail = await json<ClubDetail>(request(club(), admin));
    expect(detail.goals.length).toBe(6);
    expect(detail.goals[0]).toMatchObject({ position: 1, title: "Dasar pemrograman" });
    expect(detail.purpose.length).toBeGreaterThan(0);
    expect(detail.stats).toEqual({ lessons: 0, challenges: 0, projects: 0, approvedProjects: 0, sessions: 0, xp: 0 });

    // A teacher who mentors nothing and a student without membership see no club at all.
    expect((await json<Page<ClubSummary>>(request("/api/clubs", people.mentor!.cookie))).items.length).toBe(0);
    expect((await json<Page<ClubSummary>>(request("/api/clubs", people.santri!.cookie))).items.length).toBe(0);
    expect((await request(club(), people.santri!.cookie)).status).toBe(404);
    expect((await request(club(), people.mentor!.cookie)).status).toBe(404);
    expect((await request(club("members"), people.santri!.cookie)).status).toBe(404);
  });

  test("membership reuses existing accounts and their capabilities", async () => {
    expect((await request(club("members"), admin, { userId: people.mentor!.id, role: "mentor" })).status).toBe(200);
    // A retry of the same membership change is idempotent.
    expect((await request(club("members"), admin, { userId: people.mentor!.id, role: "mentor" })).status).toBe(200);
    expect((await request(club("members"), admin, { userId: people.santri!.id, role: "member" })).status).toBe(200);
    expect((await request(club("members"), admin, { userId: people.outsider!.id, role: "member" })).status).toBe(200);

    // A club never grants a capability: a student cannot be a mentor, a teacher not a member.
    expect((await request(club("members"), admin, { userId: people.santri!.id, role: "mentor" })).status).toBe(400);
    expect((await request(club("members"), admin, { userId: people.otherteacher!.id, role: "member" })).status).toBe(400);
    expect((await request(club("members"), admin, { userId: crypto.randomUUID(), role: "member" })).status).toBe(400);
    expect((await request(club("members"), admin, { userId: people.santri!.id, role: "ketua" })).status).toBe(400);

    // Students hold club.view but not club.manage, so every mutation is refused.
    expect((await request(club("members"), people.santri!.cookie, { userId: people.peer!.id, role: "member" })).status).toBe(403);
    expect((await request(club(), people.santri!.cookie, { name: "Klub Saya" }, "PATCH")).status).toBe(403);
    // The mentor is a manager now; a teacher who mentors no club still gets 404.
    expect((await request(club(), people.otherteacher!.cookie, { name: "Klub Lain" }, "PATCH")).status).toBe(404);

    const members = await json<Page<ClubPerson>>(request(club("members"), people.mentor!.cookie));
    expect(members.items.map(row => row.role)).toEqual(["mentor", "member", "member"]);
    const summary = (await json<Page<ClubSummary>>(request("/api/clubs", people.mentor!.cookie))).items[0]!;
    expect(summary).toMatchObject({ canManage: true, membership: "mentor", mentors: 1, members: 2 });
    expect((await json<Page<ClubSummary>>(request("/api/clubs", people.santri!.cookie))).items[0]).toMatchObject({ canManage: false, membership: "member" });
    expect((await request(club(), people.peer!.cookie)).status).toBe(404);

    // The club always keeps a manager: the last active mentor cannot be removed.
    const last = await request(club("members"), admin, { userId: people.mentor!.id, role: "mentor", removed: true });
    expect(last.status).toBe(409);
    expect(await last.json()).toMatchObject({ error: { code: "LAST_MENTOR" } });
    expect((await request(club("members"), admin, { userId: people.outsider!.id, role: "member", removed: true })).status).toBe(200);
    expect((await request(club("members"), admin, { userId: people.outsider!.id, role: "member", removed: true })).status).toBe(200);
    expect((await request(club(), people.outsider!.cookie)).status).toBe(404);
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'club.member.added'`).length).toBeGreaterThanOrEqual(3);
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'club.member.removed'`).length).toBeGreaterThanOrEqual(1);
  });

  test("an unpublished club stays visible to mentors only", async () => {
    expect((await request(club("publish"), admin, { published: false })).status).toBe(200);
    expect((await request(club(), people.santri!.cookie)).status).toBe(404);
    expect((await request(club("courses"), people.santri!.cookie)).status).toBe(404);
    expect((await request(club(), people.mentor!.cookie)).status).toBe(200);
    expect((await request(club("publish"), people.santri!.cookie, { published: true })).status).toBe(403);
    expect((await request(club("publish"), admin, { published: "ya" })).status).toBe(400);
    expect((await request(club("publish"), admin, { published: true })).status).toBe(200);
    expect((await request(club(), people.santri!.cookie)).status).toBe(200);
  });

  test("linking a course follows the teaching assignment and never widens course access", async () => {
    expect((await request(club("courses"), people.mentor!.cookie, { courseId, linked: true })).status).toBe(200);
    // Retrying the same link is idempotent.
    expect((await request(club("courses"), people.mentor!.cookie, { courseId, linked: true })).status).toBe(200);
    // A course the mentor does not teach stays out of reach, exactly as in Pembelajaran.
    expect((await request(club("courses"), people.mentor!.cookie, { courseId: otherCourseId, linked: true })).status).toBe(404);
    expect((await request(club("courses"), people.santri!.cookie, { courseId, linked: true })).status).toBe(403);
    expect((await request(club("courses"), people.mentor!.cookie, { courseId, linked: "ya" })).status).toBe(400);
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'club.course.linked'`).length).toBeGreaterThanOrEqual(1);

    // The course is still a draft, so only its manager sees it inside the club.
    expect((await json<Page<ClubCourseRow>>(request(club("courses"), people.mentor!.cookie))).items.length).toBe(1);
    expect((await json<Page<ClubCourseRow>>(request(club("courses"), people.santri!.cookie))).items.length).toBe(0);
  });

  test("club tabs read the existing learning, challenge, project, meeting and XP rows", async () => {
    const teacher = people.mentor!.cookie;
    const path = (suffix: string) => `/api/learning/courses/${courseId}/${suffix}`;
    const moduleId = (await json<{ id: string }>(request(path("modules"), teacher, { title: "Modul 1", position: 1 }), 201)).id;
    lessonId = (await json<{ id: string }>(request(path("lessons"), teacher, { moduleId, title: "Variabel", content: "Isi", position: 1 }), 201)).id;
    challengeId = (await json<{ id: string }>(request(path("challenges"), teacher, { lessonId, title: "Kalkulator", instructions: "Buat kalkulator", teamMode: "individual", maxTeamSize: 1 }), 201)).id;
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`, `activities/${challengeId}/publish`]) {
      expect((await request(path(suffix), teacher, { published: true })).status).toBe(200);
    }
    const starts = new Date(Date.now() + 3600000).toISOString();
    const ends = new Date(Date.now() + 7200000).toISOString();
    expect((await request(`/api/attendance/courses/${courseId}/sessions`, teacher, { title: "Pertemuan 1", startsAt: starts, endsAt: ends, requestKey: crypto.randomUUID() })).status).toBe(201);
    const project = await json<{ id: string }>(request(path(`challenges/${challengeId}/projects`), people.santri!.cookie, { title: "Kalkulator saya" }), 201);

    const courses = await json<Page<ClubCourseRow>>(request(club("courses"), people.santri!.cookie));
    expect(courses.items.length).toBe(1);
    expect(courses.items[0]).toMatchObject({ id: courseId, name: "Pemrograman Dasar", className: "X A", canManage: false, lessons: 1, challenges: 1 });
    const challenges = await json<Page<ClubChallengeRow>>(request(club("challenges"), people.santri!.cookie));
    expect(challenges.items.length).toBe(1);
    expect(challenges.items[0]).toMatchObject({ id: challengeId, courseName: "Pemrograman Dasar", teamMode: "individual", myProjectId: project.id });
    expect((await json<Page<ClubChallengeRow>>(request(club("challenges"), teacher))).items[0]).toMatchObject({ projectCount: 1, myProjectId: null });
    const meetings = await json<Page<ClubMeetingRow>>(request(club("meetings"), people.santri!.cookie));
    expect(meetings.items.length).toBe(1);
    expect(meetings.items[0]).toMatchObject({ title: "Pertemuan 1", courseId, courseName: "Pemrograman Dasar", note: null });
    expect((await json<Page<ClubMeetingRow>>(request(club("meetings"), teacher))).items[0]).toMatchObject({ note: "" });

    // Projects reuse the project list: a student sees only their own, the mentor sees all.
    expect((await json<Page<ProjectRow>>(request(club("projects"), people.santri!.cookie))).items.map(row => row.id)).toEqual([project.id]);
    expect((await json<Page<ProjectRow>>(request(club("projects"), teacher))).items.length).toBe(1);
    // A classmate who is not a club member never reaches the club list at all.
    expect((await request(club("projects"), people.peer!.cookie)).status).toBe(404);

    // Completing a lesson awards XP through the gamification module; the club only reads it.
    expect((await request(path(`lessons/${lessonId}/complete`), people.santri!.cookie, {})).status).toBe(200);
    const progress = await json<Page<ClubProgressRow>>(request(club("progress"), teacher));
    expect(progress.items.length).toBe(1);
    expect(progress.items[0]).toMatchObject({ studentId: people.santri!.id, lessonsCompleted: 1, projectsApproved: 0 });
    expect(progress.items[0]!.xp).toBeGreaterThan(0);
    const detail = await json<ClubDetail>(request(club(), teacher));
    expect(detail.stats).toMatchObject({ lessons: 1, challenges: 1, projects: 1, approvedProjects: 0, sessions: 1 });
    expect(detail.stats.xp).toBeGreaterThan(0);
    expect(detail.mentorList.map(mentor => mentor.userId)).toEqual([people.mentor!.id]);

    // Candidates come from the linked courses, skip people who are already members, and
    // are listed only for a manager.
    const candidates = await json<Page<{ userId: string; name: string; role: string }>>(request(club("candidates"), teacher));
    expect(candidates.items).toEqual([{ userId: people.peer!.id, name: "peer", role: "member" }]);
    expect((await request(club("candidates"), people.santri!.cookie)).status).toBe(403);
  });

  test("the club never lets membership stand in for course enrolment", async () => {
    expect((await request(club("members"), admin, { userId: people.outsider!.id, role: "member" })).status).toBe(200);
    const outsider = people.outsider!.cookie;
    expect((await request(club(), outsider)).status).toBe(200);
    expect((await json<Page<ClubCourseRow>>(request(club("courses"), outsider))).items.length).toBe(0);
    expect((await json<Page<ClubChallengeRow>>(request(club("challenges"), outsider))).items.length).toBe(0);
    expect((await json<Page<ClubMeetingRow>>(request(club("meetings"), outsider))).items.length).toBe(0);
    expect((await json<Page<ProjectRow>>(request(club("projects"), outsider))).items.length).toBe(0);
    expect((await json<ClubDetail>(request(club(), outsider))).stats).toEqual({ lessons: 0, challenges: 0, projects: 0, approvedProjects: 0, sessions: 0, xp: 0 });
    expect((await request(club("members"), admin, { userId: people.outsider!.id, role: "member", removed: true })).status).toBe(200);
  });

  test("profile and goal edits validate, refuse cross-origin writes, and roll back with their audit", async () => {
    const teacher = people.mentor!.cookie;
    expect((await request(club(), teacher, { name: "Coders Club HSI", tagline: "Belajar koding", purpose: "Tujuan baru", direction: "Arah baru", program: "Program baru" }, "PATCH")).status).toBe(200);
    expect(await json<ClubDetail>(request(club(), teacher))).toMatchObject({ name: "Coders Club HSI", tagline: "Belajar koding", purpose: "Tujuan baru" });
    expect((await request(club(), teacher, { name: "   " }, "PATCH")).status).toBe(400);
    expect((await request(club(), teacher, { name: "a".repeat(101) }, "PATCH")).status).toBe(400);
    expect((await request(club(), teacher, { name: "Coders Club HSI" }, "PATCH", "https://evil.test")).status).toBe(403);
    expect((await request(club("unknown"), teacher, { name: "x" })).status).toBe(404);
    expect((await request(club(), teacher, undefined, "DELETE")).status).toBe(405);

    expect((await request(club("goals"), teacher, { goals: [{ title: "Dasar pemrograman", description: "Logika dan struktur data" }, { title: "Kompetisi IT" }] })).status).toBe(200);
    const goals = (await json<ClubDetail>(request(club(), teacher))).goals;
    expect(goals).toEqual([
      { position: 1, title: "Dasar pemrograman", description: "Logika dan struktur data" },
      { position: 2, title: "Kompetisi IT", description: "" },
    ]);
    expect((await request(club("goals"), teacher, { goals: Array.from({ length: 21 }, () => ({ title: "Tujuan" })) })).status).toBe(400);

    // A failed audit write rolls the whole mutation back.
    await db.unsafe("ALTER TABLE audit_logs ADD CONSTRAINT reject_club_audit CHECK (event <> 'club.updated') NOT VALID");
    try {
      expect((await request(club(), teacher, { name: "Nama gagal" }, "PATCH")).status).toBe(400);
      expect((await json<ClubDetail>(request(club(), teacher))).name).toBe("Coders Club HSI");
    } finally { await db.unsafe("ALTER TABLE audit_logs DROP CONSTRAINT reject_club_audit"); }
  });

  test("the club directory is administrator work: create, archive, and restore", async () => {
    const teacher = people.mentor!.cookie;
    const santri = people.santri!.cookie;
    // A mentor holds club.manage but not learning.manage.all, so the directory refuses them.
    expect((await request("/api/clubs", teacher, { name: "Klub Robotik" })).status).toBe(403);
    expect((await request("/api/clubs", santri, { name: "Klub Robotik" })).status).toBe(403);

    const created = await json<{ id: string; slug: string }>(request("/api/clubs", admin, { name: "Klub Robotik", tagline: "Ruang robotika" }), 201);
    expect(created.slug).toBe("klub-robotik");
    const path = (suffix = "") => `/api/clubs/${created.id}${suffix ? `/${suffix}` : ""}`;
    expect((await request("/api/clubs", admin, { name: "Klub Robotik" })).status).toBe(409);
    expect((await request("/api/clubs", admin, { name: "  " })).status).toBe(400);
    expect((await request("/api/clubs", admin, { name: "Klub Lain", slug: "Bukan Slug" })).status).toBe(400);
    expect((await request("/api/clubs", admin, { name: "Klub Lain" }, "PATCH")).status).toBe(405);
    expect(await json<ClubDetail>(request(path(), admin))).toMatchObject({ name: "Klub Robotik", published: false, archived: false, goals: [] });

    // A new club is a draft with no members; publishing and membership work as anywhere else.
    expect((await request(path("members"), admin, { userId: people.santri!.id, role: "member" })).status).toBe(200);
    expect((await request(path("publish"), admin, { published: true })).status).toBe(200);
    expect((await json<Page<ClubSummary>>(request("/api/clubs", santri))).items.map(item => item.slug)).toContain("klub-robotik");

    // Archiving needs the same administrator pair; a mentor of the club cannot do it.
    expect((await request(path("members"), admin, { userId: people.mentor!.id, role: "mentor" })).status).toBe(200);
    expect((await request(path("archive"), teacher, { archived: true })).status).toBe(403);
    expect((await request(path("archive"), admin, { archived: "ya" })).status).toBe(400);
    expect((await request(path("archive"), admin, { archived: true })).status).toBe(200);

    // An archived club leaves the directory and its members' reach, and refuses every edit.
    expect((await json<Page<ClubSummary>>(request("/api/clubs", admin))).items.map(item => item.slug)).not.toContain("klub-robotik");
    expect((await json<Page<ClubSummary>>(request("/api/clubs?archived=1", admin))).items.find(item => item.slug === "klub-robotik")).toMatchObject({ archived: true });
    expect((await json<Page<ClubSummary>>(request("/api/clubs?archived=1", santri))).items.map(item => item.slug)).not.toContain("klub-robotik");
    expect((await request(path(), santri)).status).toBe(404);
    const blocked = await request(path(), admin, { name: "Klub Robotik 2" }, "PATCH");
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: { code: "CLUB_ARCHIVED" } });
    expect((await request(path("members"), admin, { userId: people.peer!.id, role: "member" })).status).toBe(409);
    expect((await request(path("publish"), admin, { published: false })).status).toBe(409);

    // Restoring brings the club and its membership back untouched.
    expect((await request(path("archive"), admin, { archived: false })).status).toBe(200);
    expect((await request(path("archive"), admin, { archived: false })).status).toBe(200);
    expect(await json<ClubDetail>(request(path(), admin))).toMatchObject({ archived: false, published: true, members: 1, mentors: 1 });
    expect((await request(path(), santri)).status).toBe(200);
    expect((await request(path(), admin, { name: "Klub Robotik HSI" }, "PATCH")).status).toBe(200);

    const events = await db<{ event: string }[]>`SELECT event FROM audit_logs WHERE resource_id = ${created.id} ORDER BY created_at, id`;
    expect(events.map(row => row.event)).toEqual(["club.created", "club.published", "club.archived", "club.restored", "club.restored", "club.updated"]);
  });

  test("the club workspace is refused outright without the club.view capability", async () => {
    await db`DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE key = 'student')
      AND permission_id = (SELECT id FROM permissions WHERE key = 'club.view')`;
    try {
      const cookie = await login("santri@example.test");
      expect((await request("/api/clubs", cookie)).status).toBe(403);
      expect((await request(club(), cookie)).status).toBe(403);
      expect((await request(club("projects"), cookie)).status).toBe(403);
    } finally {
      await db`INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'student' AND p.key = 'club.view'`;
    }
    expect((await request("/api/clubs", "")).status).toBe(401);
  });
});
