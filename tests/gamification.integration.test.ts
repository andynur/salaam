import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { createProjectHandler } from "../src/core/project-http";
import { createGamificationHandler } from "../src/core/gamification-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import { awardXp } from "../src/modules/gamification/awards";
import { studentGrowthCard } from "../src/modules/gamification/service";
import type { AcademicResource } from "../src/shared/foundation";
import type { Page } from "../src/shared/learning";
import type { Badge, GrowthSummary, LeaderboardRow, RewardRule } from "../src/shared/gamification";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 5 gamification (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let adminCookie: string;
  let teacherId: string;
  let termId: string;
  let classId: string;
  const people: Record<"teacher" | "otherTeacher" | "student" | "peer" | "outsider", { id: string; cookie: string }> = {} as never;
  const schema = `hsi_phase5_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin: config.baseUrl, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const course = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
  const post = (courseId: string, suffix: string, body: unknown, cookie = people.teacher.cookie) => request(course(courseId, suffix), cookie, body);
  const growth = (cookie: string, suffix = "me") => json<GrowthSummary>(request(`/api/gamification/${suffix}`, cookie));
  async function json<T = Record<string, unknown>>(response: Promise<Response>, status = 200): Promise<T> {
    const result = await response;
    const text = await result.text();
    if (result.status !== status) throw new Error(`Expected ${status}, received ${result.status}: ${text}`);
    return JSON.parse(text) as T;
  }
  async function academic(resource: AcademicResource, body: Record<string, unknown>) {
    return (await createAcademic(db, resource, body, adminId, crypto.randomUUID())).id;
  }
  async function user(name: string, role: string) {
    const { id } = await createUser(db, { name, role, email: `${name}@example.test`, identifier: name, password }, adminId, crypto.randomUUID());
    const login = await request("/api/auth/login", "", { email: `${name}@example.test`, password });
    expect(login.status).toBe(200);
    return { id, cookie: login.headers.get("set-cookie")!.split(";")[0]! };
  }
  // A published course with one published lesson, taught by `teacher` for class `classId`.
  async function workspace(targetClass = classId) {
    const subjectId = await academic("subjects", { name: "Pertumbuhan", code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name: `XP ${crypto.randomUUID().slice(0, 8)}`, classId: targetClass, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const moduleId = (await json<{ id: string }>(post(courseId, "modules", { title: "Modul", position: 1 }), 201)).id;
    const lessonId = (await json<{ id: string }>(post(courseId, "lessons", { moduleId, title: "Lesson", content: "Isi", position: 1 }), 201)).id;
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`]) await json(post(courseId, suffix, { published: true }));
    return { courseId, moduleId, lessonId };
  }
  const entriesOf = (summary: GrowthSummary, key: string) => summary.entries.filter(entry => entry.ruleKey === key);
  const earned = (summary: GrowthSummary) => summary.badges.filter(badge => badge.earnedAt).map(badge => badge.key);
  const xpRows = async (studentId: string) => db<{ ruleKey: string }[]>`SELECT rule_key AS "ruleKey" FROM xp_entries WHERE student_id = ${studentId}`;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, {
      foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"),
      projects: createProjectHandler(db), gamification: createGamificationHandler(db), dashboard: async () => ({}),
    });
    const adminLogin = await request("/api/auth/login", "", { email: "admin@example.test", password });
    adminCookie = adminLogin.headers.get("set-cookie")!.split(";")[0]!;
    people.teacher = await user("teacher", "teacher");
    teacherId = people.teacher.id;
    people.otherTeacher = await user("otherteacher", "teacher");
    for (const name of ["student", "peer", "outsider"] as const) people[name] = await user(name, "student");
    const yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    classId = await academic("classes", { yearId, name: "X A" });
    const otherClass = await academic("classes", { yearId, name: "X B" });
    for (const name of ["student", "peer"] as const) await academic("enrollments", { classId, studentId: people[name].id });
    await academic("enrollments", { classId: otherClass, studentId: people.outsider.id });
  });
  afterAll(async () => { if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); } });

  test("completing a lesson awards XP once and opens the first badge", async () => {
    const f = await workspace();
    const { student } = people;
    const before = await growth(student.cookie);
    expect(before.level).toMatchObject({ level: 1, total: 0, nextAt: 100 });
    expect(earned(before)).toEqual([]);
    expect(before.badges.find(badge => badge.key === "langkah-pertama")).toMatchObject({ progress: 0, threshold: 1, earnedAt: null });

    await json(post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student.cookie));
    const after = await growth(student.cookie);
    expect(after.level).toMatchObject({ level: 1, total: 10, levelAt: 0, nextAt: 100 });
    expect(after.counters.lessonsCompleted).toBe(1);
    expect(entriesOf(after, "lesson.completed")).toHaveLength(1);
    expect(after.entries[0]).toMatchObject({ ruleKey: "lesson.completed", points: 10, sourceType: "lessons", sourceId: f.lessonId, courseName: expect.any(String) });
    expect(earned(after)).toContain("langkah-pertama");
    const badgeId = after.badges.find(badge => badge.key === "langkah-pertama")!.id;
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'gamification.badge.awarded' AND resource_id = ${badgeId}`).length).toBe(1);

    // A repeated completion is a no-op, so neither XP nor a second badge audit appears.
    await json(post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student.cookie));
    const repeated = await growth(student.cookie);
    expect(repeated.level.total).toBe(10);
    expect(repeated.entries).toHaveLength(1);
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'gamification.badge.awarded' AND resource_id = ${badgeId}`).length).toBe(1);
  });

  test("grading an assignment rewards the student once; corrections add nothing", async () => {
    const f = await workspace();
    const { student, teacher } = people;
    const activityId = (await json<{ id: string }>(post(f.courseId, "activities", { lessonId: f.lessonId, kind: "assignment", title: "Tugas", instructions: "Kerjakan." }), 201)).id;
    await json(post(f.courseId, `activities/${activityId}/publish`, { published: true }));
    await json(post(f.courseId, `activities/${activityId}/submit`, { content: "Jawaban saya." }, student.cookie));
    const submissions = await json<Page<{ id: string }>>(request(course(f.courseId, `activities/${activityId}/submissions`), teacher.cookie));
    const submissionId = submissions.items[0]!.id;

    const before = (await growth(student.cookie)).level.total;
    const grade = await json<{ id: string }>(post(f.courseId, `submissions/${submissionId}/grade`, { score: 90, feedback: "Bagus.", previousGradeId: null }));
    const graded = await growth(student.cookie);
    expect(graded.level.total).toBe(before + 25);
    expect(entriesOf(graded, "assignment.graded")).toHaveLength(1);
    expect(graded.counters.assignmentsGraded).toBe(1);
    expect(earned(graded)).toContain("tugas-perdana");

    // A correction appends a grade row but the submission was already rewarded.
    await json(post(f.courseId, `submissions/${submissionId}/grade`, { score: 95, feedback: "Revisi nilai.", previousGradeId: grade.id }));
    const corrected = await growth(student.cookie);
    expect(corrected.level.total).toBe(before + 25);
    expect(entriesOf(corrected, "assignment.graded")).toHaveLength(1);
  });

  test("finishing an assessment rewards the first submitted attempt only", async () => {
    const f = await workspace();
    const { student } = people;
    const questionId = (await json<{ id: string }>(post(f.courseId, "questions", { type: "single_choice", prompt: "Tag paragraf?", options: ["<div>", "<p>"], correct: ["b"] }), 201)).id;
    const quizId = (await json<{ id: string }>(post(f.courseId, "assessments", { lessonId: f.lessonId, kind: "quiz", title: "Quiz", instructions: "Kerjakan.", maxAttempts: 2 }), 201)).id;
    await json(post(f.courseId, `assessments/${quizId}/items`, { items: [{ questionId, points: 2 }] }));
    await json(post(f.courseId, `activities/${quizId}/publish`, { published: true }));

    const before = (await growth(student.cookie)).level.total;
    const first = await json<{ id: string }>(post(f.courseId, `assessments/${quizId}/attempts`, {}, student.cookie), 201);
    await json(post(f.courseId, `attempts/${first.id}/submit`, {}, student.cookie));
    const once = await growth(student.cookie);
    expect(once.level.total).toBe(before + 30);
    expect(entriesOf(once, "assessment.completed")).toHaveLength(1);
    expect(once.entries[0]).toMatchObject({ sourceType: "activities", sourceId: quizId });
    expect(earned(once)).toContain("siap-uji");

    // The assessment is the source, so a second allowed attempt earns nothing more.
    const second = await json<{ id: string }>(post(f.courseId, `assessments/${quizId}/attempts`, {}, student.cookie), 201);
    await json(post(f.courseId, `attempts/${second.id}/submit`, {}, student.cookie));
    const twice = await growth(student.cookie);
    expect(twice.level.total).toBe(before + 30);
    expect(entriesOf(twice, "assessment.completed")).toHaveLength(1);
  });

  test("an approved project rewards every team member exactly once", async () => {
    const f = await workspace();
    const { student, peer, teacher } = people;
    const challengeId = (await json<{ id: string }>(post(f.courseId, "challenges", { lessonId: f.lessonId, title: "Proyek", instructions: "Bangun.", teamMode: "team", maxTeamSize: 2 }), 201)).id;
    await json(post(f.courseId, `activities/${challengeId}/publish`, { published: true }));
    const projectId = (await json<{ id: string }>(post(f.courseId, `challenges/${challengeId}/projects`, { title: "Tim", memberIds: [student.id, peer.id] }), 201)).id;
    await json(request(`/api/projects/${projectId}`, student.cookie, { title: "Tim", summary: "Hasil kerja tim.", deliverableUrl: null }, "PATCH"));
    await json(request(`/api/projects/${projectId}/submit`, student.cookie, {}));

    const before = { student: (await growth(student.cookie)).level.total, peer: (await growth(peer.cookie)).level.total };
    await json(request(`/api/projects/${projectId}/reviews`, teacher.cookie, { decision: "approved", score: 90, feedback: "Bagus." }));
    for (const [name, person] of [["student", student], ["peer", peer]] as const) {
      const summary = await growth(person.cookie);
      expect(summary.level.total).toBe(before[name] + 75);
      expect(entriesOf(summary, "project.approved")).toHaveLength(1);
      expect(summary.counters.projectsApproved).toBe(1);
      expect(earned(summary)).toContain("pembangun");
    }
    // Approval is final: a second review is refused and rewards nothing further.
    expect((await request(`/api/projects/${projectId}/reviews`, teacher.cookie, { decision: "approved", score: 100, feedback: "Lagi." })).status).toBe(409);
    expect((await xpRows(student.id)).filter(row => row.ruleKey === "project.approved")).toHaveLength(1);
  });

  test("growth is private to the student, their teachers, and administrators", async () => {
    const { student, peer, teacher, otherTeacher } = people;
    expect((await request(`/api/gamification/students/${peer.id}`, student.cookie)).status).toBe(404);
    expect((await request(`/api/gamification/students/${student.id}`, otherTeacher.cookie)).status).toBe(404);
    expect((await request(`/api/gamification/students/${crypto.randomUUID()}`, teacher.cookie)).status).toBe(404);
    expect((await request("/api/gamification/students/not-a-uuid", teacher.cookie)).status).toBe(400);
    expect((await growth(teacher.cookie, `students/${student.id}`)).student.id).toBe(student.id);
    expect((await growth(adminCookie, `students/${student.id}`)).student.id).toBe(student.id);
    // A teacher has no XP of their own but may still open the page.
    expect((await growth(teacher.cookie)).level.total).toBe(0);
    expect((await request("/api/gamification/me", "")).status).toBe(401);
  });

  test("the leaderboard is scoped for managers and students", async () => {
    const { student, teacher, otherTeacher } = people;
    const studentBoard = await json<Page<LeaderboardRow>>(request("/api/gamification/leaderboard", student.cookie));
    expect(studentBoard.items.map(row => row.studentId).sort()).toEqual([student.id, people.peer.id].sort());
    expect((await json<Page<LeaderboardRow>>(request(`/api/gamification/leaderboard?classId=${crypto.randomUUID()}`, student.cookie))).items).toHaveLength(2);
    const board = await json<Page<LeaderboardRow>>(request("/api/gamification/leaderboard", teacher.cookie));
    expect(board.items.map(row => row.studentId)).toEqual(expect.arrayContaining([student.id, people.peer.id]));
    expect(board.items[0]!.total).toBeGreaterThanOrEqual(board.items[1]!.total);
    expect(board.items.filter(row => [student.id, people.peer.id].includes(row.studentId)).every(row => row.className === "X A")).toBe(true);
    expect((await json<Page<LeaderboardRow>>(request("/api/gamification/leaderboard", otherTeacher.cookie))).items).toEqual([]);
    expect((await json<Page<LeaderboardRow>>(request(`/api/gamification/leaderboard?q=${people.peer.id === student.id ? "" : "peer"}`, teacher.cookie))).items.every(row => row.studentName.includes("peer"))).toBe(true);
    expect((await json<Page<LeaderboardRow>>(request(`/api/gamification/leaderboard?classId=${crypto.randomUUID()}`, teacher.cookie))).items).toEqual([]);
    expect((await request("/api/gamification/leaderboard?classId=abc", teacher.cookie)).status).toBe(400);
  });

  test("reward rules are administered, audited, and apply only to later awards", async () => {
    const { teacher, student } = people;
    expect((await request("/api/gamification/rules", teacher.cookie)).status).toBe(403);
    expect((await request("/api/gamification/rules/lesson.completed", teacher.cookie, { points: 50 }, "PATCH")).status).toBe(403);
    const rules = await json<RewardRule[]>(request("/api/gamification/rules", adminCookie));
    expect(rules.map(rule => rule.key).sort()).toEqual(["assessment.completed", "assignment.graded", "lesson.completed", "project.approved"]);
    expect(rules.find(rule => rule.key === "lesson.completed")!.points).toBe(10);
    for (const points of [-1, 1001, 2.5, "10"]) expect((await request("/api/gamification/rules/lesson.completed", adminCookie, { points }, "PATCH")).status).toBe(400);
    expect((await request("/api/gamification/rules/lesson.started", adminCookie, { points: 5 }, "PATCH")).status).toBe(400);

    await json(request("/api/gamification/rules/lesson.completed", adminCookie, { points: 40 }, "PATCH"));
    expect((await db`SELECT 1 FROM audit_logs a JOIN reward_rules r ON r.id = a.resource_id WHERE a.event = 'gamification.rule.updated' AND r.key = 'lesson.completed'`).length).toBe(1);
    const f = await workspace();
    const before = await growth(student.cookie);
    await json(post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student.cookie));
    const after = await growth(student.cookie);
    expect(after.level.total).toBe(before.level.total + 40);
    // The earlier award keeps the points it was granted with.
    expect(after.entries.filter(entry => entry.ruleKey === "lesson.completed" && entry.points === 10).length).toBeGreaterThan(0);
    await json(request("/api/gamification/rules/lesson.completed", adminCookie, { points: 10 }, "PATCH"));
  });

  test("the badge catalogue is validated, unique, and evaluated on the next award", async () => {
    const { student, teacher } = people;
    expect((await request("/api/gamification/badges", teacher.cookie)).status).toBe(403);
    const body = { key: "rajin-belajar", name: "Rajin Belajar", description: "Menyelesaikan dua pelajaran.", icon: "book", criterion: "lessons_completed", threshold: 2 };
    expect((await request("/api/gamification/badges", adminCookie, { ...body, icon: "trophy" })).status).toBe(400);
    expect((await request("/api/gamification/badges", adminCookie, { ...body, threshold: 0 })).status).toBe(400);
    const created = await json<{ id: string }>(request("/api/gamification/badges", adminCookie, body), 201);
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'gamification.badge.created' AND resource_id = ${created.id}`).length).toBe(1);
    // The key is unique, so a duplicate is a conflict rather than a second badge.
    expect((await request("/api/gamification/badges", adminCookie, body)).status).toBe(409);

    const catalogue = await json<Page<Badge>>(request("/api/gamification/badges?q=rajin-belajar", adminCookie));
    expect(catalogue.items.map(item => item.key)).toEqual(["rajin-belajar"]);
    const f = await workspace();
    await json(post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student.cookie));
    expect(earned(await growth(student.cookie))).toContain("rajin-belajar");

    // A deactivated badge stays with the students who already earned it.
    await json(request(`/api/gamification/badges/${created.id}`, adminCookie, { ...body, active: false }, "PATCH"));
    expect(earned(await growth(student.cookie))).toContain("rajin-belajar");
    expect((await growth(people.peer.cookie)).badges.some(badge => badge.key === "rajin-belajar")).toBe(false);
  });

  test("a failed audit write rolls back the XP award with the event", async () => {
    const f = await workspace();
    const { student } = people;
    const before = await growth(student.cookie);
    await db`ALTER TABLE audit_logs ADD CONSTRAINT block_lesson_audit CHECK (event <> 'learning.lesson.completed') NOT VALID`;
    try {
      // The rejected audit row is a constraint violation, which the router maps to 400.
      expect((await post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student.cookie)).status).toBe(400);
    } finally { await db`ALTER TABLE audit_logs DROP CONSTRAINT block_lesson_audit`; }
    const after = await growth(student.cookie);
    expect(after.level.total).toBe(before.level.total);
    expect(after.entries.some(entry => entry.sourceId === f.lessonId)).toBe(false);
    expect((await db`SELECT 1 FROM lesson_completions WHERE lesson_id = ${f.lessonId} AND student_id = ${student.id}`).length).toBe(0);
  });

  test("125 students earning at once each get exactly one ledger row and their badge", async () => {
    const ids = Array.from({ length: 125 }, () => crypto.randomUUID());
    const lessonId = (await db<{ id: string }[]>`SELECT id FROM lessons LIMIT 1`)[0]!.id;
    const courseId = (await db<{ courseId: string }[]>`SELECT course_id AS "courseId" FROM lessons WHERE id = ${lessonId}`)[0]!.courseId;
    // Direct inserts keep the load test about award concurrency, not password hashing.
    await db`INSERT INTO users (id, email, display_name, password_hash, is_active)
      SELECT id, 'load-' || id || '@example.test', 'Load ' || id, (SELECT password_hash FROM users LIMIT 1), true
      FROM unnest(string_to_array(${ids.join(",")}, ',')::uuid[]) AS id`;
    const results = await Promise.all(ids.map(id => db.begin(tx => awardXp(tx, id, "lesson.completed", "lessons", lessonId, courseId, crypto.randomUUID()))));
    expect(results.every(result => result.awarded)).toBe(true);
    const rows = await db<{ count: number }[]>`SELECT count(*)::int AS count FROM xp_entries WHERE student_id = ANY(string_to_array(${ids.join(",")}, ',')::uuid[])`;
    expect(rows[0]!.count).toBe(125);
    const badges = await db<{ count: number }[]>`SELECT count(*)::int AS count FROM badge_awards ba JOIN badges b ON b.id = ba.badge_id
      WHERE b.key = 'langkah-pertama' AND ba.student_id = ANY(string_to_array(${ids.join(",")}, ',')::uuid[])`;
    expect(badges[0]!.count).toBe(125);

    // Concurrent retries for one student collapse onto the single ledger row.
    const retried = await Promise.all([0, 1, 2].map(() => db.begin(tx => awardXp(tx, ids[0]!, "lesson.completed", "lessons", lessonId, courseId, crypto.randomUUID()))));
    expect(retried.filter(result => result.awarded)).toHaveLength(0);
    expect((await xpRows(ids[0]!)).length).toBe(1);
  });

  test("the dashboard card summarizes a student's level and badges", async () => {
    const f = await workspace();
    const { student } = people;
    await json(post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student.cookie));
    const card = await studentGrowthCard(db, { id: student.id, displayName: "student", roles: ["student"], permissions: ["learning.participate"] });
    // The web progress bar does arithmetic on these, so they must arrive as numbers.
    const { level, total, levelAt, nextAt } = card!.level;
    for (const value of [level, total, levelAt, card!.badges]) expect(typeof value).toBe("number");
    expect(total).toBeGreaterThan(0);
    expect(level).toBeGreaterThanOrEqual(1);
    expect(card!.badges).toBeGreaterThan(0);
    expect(nextAt === null || typeof nextAt === "number").toBe(true);
    // Teachers collect no XP, so their dashboard shows no growth card.
    expect(await studentGrowthCard(db, { id: teacherId, displayName: "teacher", roles: ["teacher"], permissions: ["learning.manage"] })).toBeNull();
  });
});
