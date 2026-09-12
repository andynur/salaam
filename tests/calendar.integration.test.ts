import { createCalendarHandler } from "../src/core/calendar-http";
import { notificationTick } from "../src/modules/calendar/worker";
import { awardXp } from "../src/modules/gamification/awards";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { cookieName, createSessionToken, hashToken } from "../src/core/auth/session";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createAttendanceHandler } from "../src/core/attendance-http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { createProjectHandler } from "../src/core/project-http";
import { createGamificationHandler } from "../src/core/gamification-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import type { AcademicResource } from "../src/shared/foundation";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 8 calendar and notifications (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let adminCookie: string;
  let auth: ReturnType<typeof createAuthService>;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let termId: string;
  let classId: string;
  const people: Record<"teacher" | "otherTeacher" | "student" | "peer" | "outsider", { id: string; cookie: string }> = {} as never;
  const schema = `hsi_phase8_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST", origin: string | null = config.baseUrl) {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, ...(origin ? { origin } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const course = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
  const post = (courseId: string, suffix: string, body: unknown, cookie = people.teacher.cookie) => request(course(courseId, suffix), cookie, body);
  async function json<T = Record<string, unknown>>(response: Promise<Response>, status = 200): Promise<T> {
    const result = await response;
    const text = await result.text();
    if (result.status !== status) throw new Error(`Expected ${status}, received ${result.status}: ${text}`);
    return JSON.parse(text) as T;
  }
  const academic = async (resource: AcademicResource, body: Record<string, unknown>) => (await createAcademic(db, resource, body, adminId, crypto.randomUUID())).id;
  async function user(name: string, role: string) {
    const { id } = await createUser(db, { name, role, email: `${name}@example.test`, identifier: name, password }, adminId, crypto.randomUUID());
    const login = await request("/api/auth/login", "", { email: `${name}@example.test`, password });
    expect(login.status).toBe(200);
    return { id, cookie: login.headers.get("set-cookie")!.split(";")[0]! };
  }
  async function workspace(targetClass = classId) {
    const subjectId = await academic("subjects", { name: "Pertumbuhan", code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name: `QR ${crypto.randomUUID().slice(0, 8)}`, classId: targetClass, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const moduleId = (await json<{ id: string }>(post(courseId, "modules", { title: "Modul", position: 1 }), 201)).id;
    const lessonId = (await json<{ id: string }>(post(courseId, "lessons", { moduleId, title: "Lesson", content: "Isi", position: 1 }), 201)).id;
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`]) await json(post(courseId, suffix, { published: true }));
    return { courseId, moduleId, lessonId };
  }

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 8, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    auth = createAuthService(db, config);
    handle = createHttpHandler(config, auth, async () => {}, {
      calendar: createCalendarHandler(db), attendance: createAttendanceHandler(db), foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"),
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

  const eventBody = (courseId: string | null = null) => ({ title: "Agenda uji", description: "Keterangan", courseId,
    startsAt: new Date(Date.now() + 2 * 3600000).toISOString(), endsAt: new Date(Date.now() + 3 * 3600000).toISOString(), requestKey: crypto.randomUUID() });
  const agenda = (cookie = people.student.cookie) => json<any>(request(`/api/calendar?${new URLSearchParams({ from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 2 * 86400000).toISOString() })}`, cookie));
  const events = "/api/calendar/events";
  const notifications = (cookie = people.student.cookie) => json<any>(request("/api/notifications", cookie));
  const prefs = (cookie: string, reminders: boolean, levelUp = true, checkin = true) => json(request("/api/notifications/preferences", cookie, { reminders, levelUp, checkin }, "PATCH"));
  test("event creation validates capabilities, course scope, Origin and retry keys", async () => {
    const { courseId } = await workspace();
    const body = eventBody(courseId);
    expect((await request(events, people.student.cookie, body)).status).toBe(403);
    expect((await request(events, people.otherTeacher.cookie, body)).status).toBe(404);
    expect((await request(events, people.teacher.cookie, eventBody())).status).toBe(403);
    expect((await request(events, people.teacher.cookie, body, "POST", null)).status).toBe(403);
    expect((await request(events, people.teacher.cookie, { ...body, endsAt: body.startsAt })).status).toBe(400);
    const copies = await Promise.all(Array.from({ length: 6 }, () => json<any>(request(events, people.teacher.cookie, body), 201)));
    expect(new Set(copies.map(row => row.id)).size).toBe(1);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'calendar.event.created' AND resource_id = ${copies[0].id}`).length).toBe(1);
    expect((await request(events, people.teacher.cookie, { ...body, title: "Khác" })).status).toBe(409);
    expect((await agenda()).items.some((e: any) => e.id === copies[0].id)).toBe(true);
    expect((await request(`${events}/${copies[0].id}`, people.outsider.cookie)).status).toBe(404);
    await db`UPDATE courses SET published = false WHERE id = ${courseId}`;
    expect((await request(`${events}/${copies[0].id}`, people.student.cookie)).status).toBe(404);
    expect((await request(`${events}/${copies[0].id}`, people.teacher.cookie)).status).toBe(200);
  });
  test("school events are visible to all dashboard users and updates/archives are versioned and idempotent", async () => {
    const body = eventBody();
    const { id } = await json<any>(request(events, adminCookie, body), 201);
    expect((await agenda(people.outsider.cookie)).items.some((e: any) => e.id === id)).toBe(true);
    const update = { ...body, title: "Agenda baru", version: 1 };
    const outcomes = await Promise.all([request(`${events}/${id}`, adminCookie, update, "PATCH"), request(`${events}/${id}`, adminCookie, { ...update, title: "Saingan" }, "PATCH")]);
    expect(outcomes.map(r => r.status).sort()).toEqual([200, 409]);
    const current = await json<any>(request(`${events}/${id}`, adminCookie));
    expect(current.version).toBe(2);
    const archive = { action: "archive", version: 2 };
    expect((await request(`${events}/${id}`, people.teacher.cookie, archive, "PATCH")).status).toBe(403);
    expect((await request(`${events}/${id}`, adminCookie, archive, "PATCH")).status).toBe(200);
    expect((await request(`${events}/${id}`, adminCookie, archive, "PATCH")).status).toBe(200);
    expect((await request(`${events}/${id}`, adminCookie)).status).toBe(404);
  });
  test("calendar references live deadlines and assessment windows with the full publication cascade", async () => {
    const { courseId, lessonId, moduleId } = await workspace();
    const dueAt = new Date(Date.now() + 3600000).toISOString();
    const { id } = await json<any>(post(courseId, "activities", { lessonId, kind: "assignment", title: "Tugas kalender", instructions: "Kerjakan", dueAt }), 201);
    await json(post(courseId, `activities/${id}/publish`, { published: true }));
    expect((await agenda()).items.find((e: any) => e.id === id).startsAt).toContain(dueAt.slice(0, 10));
    const nextDue = new Date(Date.now() + 4 * 3600000).toISOString();
    await db`UPDATE activities SET due_at = ${nextDue} WHERE id = ${id}`;
    expect(Date.parse((await agenda()).items.find((e: any) => e.id === id).startsAt)).toBe(Date.parse(nextDue));
    await db`UPDATE course_modules SET published = false WHERE id = ${moduleId}`;
    expect((await agenda()).items.some((e: any) => e.id === id)).toBe(false);
    expect((await agenda(people.teacher.cookie)).items.some((e: any) => e.id === id)).toBe(true);
    await db`UPDATE course_modules SET published = true WHERE id = ${moduleId}`;
    await db`UPDATE activities SET archived_at = clock_timestamp() WHERE id = ${id}`;
    expect((await agenda(people.teacher.cookie)).items.some((e: any) => e.id === id)).toBe(false);
  });
  test("reminder delivery is bounded and concurrent ticks, read receipts and preferences are idempotent", async () => {
    const { id } = await json<any>(request(events, adminCookie, eventBody()), 201);
    await prefs(people.peer.cookie, false);
    await Promise.all(Array.from({ length: 5 }, () => notificationTick(db)));
    const delivered = (await notifications()).items.find((n: any) => n.href === `/calendar?event=${id}`);
    expect(delivered.status).toBe("delivered");
    expect((await notifications(people.peer.cookie)).items.find((n: any) => n.href === `/calendar?event=${id}`).status).toBe("suppressed");
    expect((await request(`/api/notifications/${delivered.id}/read`, people.peer.cookie, {})).status).toBe(404);
    const first = await json<any>(request(`/api/notifications/${delivered.id}/read`, people.student.cookie, {}));
    const repeat = await json<any>(request(`/api/notifications/${delivered.id}/read`, people.student.cookie, {}));
    expect(repeat).toEqual(first);
    expect((await json<any>(request("/api/notifications?unread=true", people.student.cookie))).items.some((n: any) => n.id === delivered.id)).toBe(false);
    await prefs(people.peer.cookie, true);
    await notificationTick(db);
    expect((await db`SELECT * FROM notifications WHERE user_id = ${people.student.id} AND source_id = ${id}`).length).toBe(1);
    expect((await db`SELECT status FROM notifications WHERE user_id = ${people.peer.id} AND source_id = ${id}`)[0].status).toBe("suppressed");
  });
  test("rescheduling and revoking access cannot expose stale notifications", async () => {
    const { courseId } = await workspace();
    const body = eventBody(courseId);
    const { id } = await json<any>(request(events, people.teacher.cookie, body), 201);
    await notificationTick(db);
    const old = (await notifications()).items.find((n: any) => n.href === `/calendar?event=${id}`);
    expect(old).toBeDefined();
    await json(request(`${events}/${id}`, people.teacher.cookie, { ...body, startsAt: new Date(Date.now() + 5 * 3600000).toISOString(), endsAt: new Date(Date.now() + 6 * 3600000).toISOString(), version: 1 }, "PATCH"));
    expect((await notifications()).items.some((n: any) => n.id === old.id)).toBe(false);
    expect((await request(`/api/notifications/${old.id}/read`, people.student.cookie, {})).status).toBe(404);
    await notificationTick(db);
    expect((await notifications()).items.some((n: any) => n.href === `/calendar?event=${id}`)).toBe(true);
    await db`DELETE FROM class_members WHERE class_id = ${classId} AND student_id = ${people.student.id}`;
    expect((await notifications()).items.some((n: any) => n.href === `/calendar?event=${id}`)).toBe(false);
    await academic("enrollments", { classId, studentId: people.student.id });
  });
  test("worker restart suppresses expired pending reminders and never backfills expired events", async () => {
    const body = eventBody();
    const { id } = await json<any>(request(events, adminCookie, body), 201);
    await db`INSERT INTO notifications (user_id, kind, source_kind, source_id, source_at, dedupe_key, scheduled_at)
      VALUES (${people.student.id}, 'reminder', 'event', ${id}, ${body.startsAt}, ${`expired:${id}`}, clock_timestamp() - interval '1 day')`;
    await db`UPDATE academic_events SET starts_at = clock_timestamp() - interval '2 hours', ends_at = clock_timestamp() - interval '1 hour' WHERE id = ${id}`;
    await notificationTick(db);
    expect((await db`SELECT status FROM notifications WHERE source_id = ${id}`)[0].status).toBe("suppressed");
    expect((await db`SELECT * FROM notifications WHERE source_id = ${id}`).length).toBe(1);
  });
  test("XP crossing is serialized across concurrent source awards and does not notify historical levels", async () => {
    await db`UPDATE reward_rules SET points = 60 WHERE key = 'lesson.completed'`;
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    await Promise.all(ids.map(id => db.begin(async tx => awardXp(tx, people.student.id, "lesson.completed", "lessons", id, null, crypto.randomUUID()))));
    await db.begin(async tx => awardXp(tx, people.student.id, "lesson.completed", "lessons", ids[0]!, null, crypto.randomUUID()));
    expect((await db`SELECT level FROM notifications WHERE user_id = ${people.student.id} AND kind = 'level_up'`).map((r: { level: number }) => r.level)).toEqual([2]);
    await notificationTick(db);
    expect((await notifications()).items.some((n: any) => n.title === "Level 2 tercapai" && n.status === "delivered")).toBe(true);
  });
  test("QR opening queues one notification per roster member and stopping hides it without disclosing codes", async () => {
    const { courseId } = await workspace();
    const base = `/api/attendance/courses/${courseId}/sessions`;
    const { id } = await json<any>(request(base, people.teacher.cookie, { ...eventBody(), title: "Sesi QR" }), 201);
    await json(request(`${base}/${id}`, people.teacher.cookie, { action: "open", version: 1 }, "PATCH"));
    for (let i = 0; i < 2; i++) await json(request(`${base}/${id}/checkin`, people.teacher.cookie, { action: "start" }, "PATCH"));
    await notificationTick(db);
    const row = (await notifications()).items.find((n: any) => n.kind === "checkin" && n.href.endsWith(id));
    expect(row.status).toBe("delivered");
    expect(JSON.stringify(row)).not.toContain("code");
    expect((await db`SELECT * FROM notifications WHERE source_id = ${id} AND user_id = ${people.student.id} AND kind = 'checkin'`).length).toBe(1);
    expect((await notifications(people.outsider.cookie)).items.some((n: any) => n.href.endsWith(id))).toBe(false);
    await json(request(`${base}/${id}/checkin`, people.teacher.cookie, { action: "stop" }, "PATCH"));
    expect((await notifications()).items.some((n: any) => n.id === row.id)).toBe(false);
  });
  test("audit failure rolls back event and preference mutations", async () => {
    await db.unsafe(`CREATE FUNCTION reject_calendar_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event LIKE 'calendar.%' OR NEW.event = 'notification.preferences.updated' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`);
    await db.unsafe(`CREATE TRIGGER reject_calendar_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_calendar_audit()`);
    try {
      const body = eventBody();
      expect((await request(events, adminCookie, body)).status).toBe(500);
      expect((await db`SELECT * FROM academic_events WHERE request_key = ${body.requestKey}`).length).toBe(0);
      expect((await request("/api/notifications/preferences", people.outsider.cookie, { reminders: false, levelUp: false, checkin: false }, "PATCH")).status).toBe(500);
      expect((await db`SELECT * FROM notification_preferences WHERE user_id = ${people.outsider.id}`).length).toBe(0);
    } finally { await db.unsafe(`DROP TRIGGER reject_calendar_audit ON audit_logs`); await db.unsafe(`DROP FUNCTION reject_calendar_audit()`); }
  });
  test("assessment opening and closing reference settings; completed work does not receive a reminder", async () => {
    const { courseId, lessonId } = await workspace();
    const question = await json<any>(post(courseId, "questions", { type: "true_false", prompt: "Benar?", correct: ["a"] }), 201);
    const opensAt = new Date(Date.now() - 3600000).toISOString(), closesAt = new Date(Date.now() + 3600000).toISOString();
    const assessment = await json<any>(post(courseId, "assessments", { kind: "quiz", title: "Quiz kalender", lessonId, instructions: "Kerjakan", opensAt, closesAt }), 201);
    await json(post(courseId, `assessments/${assessment.id}/items`, { items: [{ questionId: question.id, points: 1 }] }));
    await json(post(courseId, `activities/${assessment.id}/publish`, { published: true }));
    const entries = (await agenda()).items.filter((e: any) => e.id === assessment.id);
    expect(entries.map((e: any) => e.kind).sort()).toEqual(["assessment_close", "assessment_open"]);
    expect(Date.parse(entries.find((e: any) => e.kind === "assessment_close").startsAt)).toBe(Date.parse(closesAt));
    const attempt = await json<any>(post(courseId, `assessments/${assessment.id}/attempts`, {}, people.student.cookie), 201);
    await json(post(courseId, `attempts/${attempt.id}/submit`, {}, people.student.cookie));
    await notificationTick(db);
    expect((await db`SELECT * FROM notifications WHERE user_id = ${people.student.id} AND source_id = ${assessment.id}`).length).toBe(0);
    expect((await db`SELECT * FROM notifications WHERE user_id = ${people.peer.id} AND source_id = ${assessment.id}`).length).toBe(1);
    expect((await db`SELECT * FROM notifications WHERE source_kind = 'assessment_open'`).length).toBe(0);
  });
  test("event constraints, bounded pagination, literal search and capability revocation", async () => {
    const body = eventBody();
    await db`INSERT INTO academic_events (title, starts_at, ends_at, created_by, request_key, last_operation)
      SELECT 'Paging ' || n, ${body.startsAt}, ${body.endsAt}, ${adminId}, gen_random_uuid(), '{}'::jsonb FROM generate_series(1, 51) n`;
    const range = new URLSearchParams({ from: new Date().toISOString(), to: new Date(Date.now() + 86400000).toISOString(), q: "Paging" });
    const page = await json<any>(request(`/api/calendar?${range}`, people.student.cookie));
    expect(page.items.length).toBe(50); expect(page.nextOffset).toBe(50);
    const next = await json<any>(request(`/api/calendar?${range}&offset=50`, people.student.cookie));
    expect(next.items.length).toBe(1); expect(next.nextOffset).toBeNull();
    range.set("q", "%"); expect((await json<any>(request(`/api/calendar?${range}`, people.student.cookie))).items.length).toBe(0);
    await expect((async () => await db`INSERT INTO academic_events (title, starts_at, ends_at, created_by, request_key, last_operation)
      VALUES ('Invalid', ${body.startsAt}, ${body.startsAt}, ${adminId}, gen_random_uuid(), '{}'::jsonb)`)()).rejects.toThrow();
    await expect((async () => await db`INSERT INTO notifications (user_id, kind, source_kind, source_id, dedupe_key, status)
      VALUES (${people.student.id}, 'reminder', 'event', gen_random_uuid(), 'invalid', 'delivered')`)()).rejects.toThrow();
    await db`DELETE FROM user_roles WHERE user_id = ${people.outsider.id}`;
    expect((await request(`/api/calendar?${range}`, people.outsider.cookie)).status).toBe(403);
    expect((await request('/api/notifications', people.outsider.cookie)).status).toBe(403);
    await db`INSERT INTO user_roles SELECT ${people.outsider.id}, id FROM roles WHERE key = 'student'`;
  });
  test("failure after an XP or QR trigger rolls back its notifications and retry recovers", async () => {
    const source = crypto.randomUUID();
    const before = (await db`SELECT * FROM notifications`).length;
    await expect(db.begin(async tx => {
      await awardXp(tx, people.peer.id, "lesson.completed", "lessons", source, null, crypto.randomUUID());
      await awardXp(tx, people.peer.id, "lesson.completed", "lessons", crypto.randomUUID(), null, crypto.randomUUID());
      throw new Error("rollback transaction");
    })).rejects.toThrow();
    expect((await db`SELECT * FROM notifications`).length).toBe(before);
    expect((await db`SELECT * FROM xp_entries WHERE source_id = ${source}`).length).toBe(0);
    const { courseId } = await workspace();
    const base = `/api/attendance/courses/${courseId}/sessions`;
    const { id } = await json<any>(request(base, people.teacher.cookie, eventBody()), 201);
    await json(request(`${base}/${id}`, people.teacher.cookie, { action: "open", version: 1 }, "PATCH"));
    await db.unsafe(`CREATE FUNCTION reject_qr_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = 'classroom.checkin.started' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END $$`);
    await db.unsafe(`CREATE TRIGGER reject_qr_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_qr_audit()`);
    try {
      expect((await request(`${base}/${id}/checkin`, people.teacher.cookie, { action: "start" }, "PATCH")).status).toBe(500);
      expect((await db`SELECT * FROM notifications WHERE source_id = ${id}`).length).toBe(0);
      expect((await db`SELECT * FROM attendance_checkin_windows WHERE session_id = ${id}`).length).toBe(0);
    } finally { await db.unsafe(`DROP TRIGGER reject_qr_audit ON audit_logs`); await db.unsafe(`DROP FUNCTION reject_qr_audit()`); }
    await json(request(`${base}/${id}/checkin`, people.teacher.cookie, { action: "start" }, "PATCH"));
    expect((await db`SELECT * FROM notifications WHERE source_id = ${id} AND kind = 'checkin'`).length).toBe(2);
  });
  test("125 concurrent student inbox reads and receipts remain private and idempotent", async () => {
    await db`UPDATE academic_events SET archived_at = clock_timestamp() WHERE title LIKE 'Paging %'`;
    const [{ password_hash: loadHash }] = await db`SELECT password_hash FROM users WHERE id = ${adminId}`;
    const cohort: { id: string; cookie: string }[] = [];
    for (let i = 0; i < 125; i++) {
      const id = crypto.randomUUID(), token = createSessionToken();
      await db`INSERT INTO users (id, email, display_name, password_hash) VALUES (${id}, ${`load-${i}@example.test`}, ${`Santri ${i}`}, ${loadHash})`;
      await db`INSERT INTO user_roles SELECT ${id}, id FROM roles WHERE key = 'student'`;
      await db`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (${id}, ${hashToken(token)}, clock_timestamp() + interval '1 hour')`;
      cohort.push({ id, cookie: `${cookieName(config)}=${token}` });
    }
    const { id } = await json<any>(request(events, adminCookie, eventBody()), 201);
    for (let i = 0; i < 10; i++) await notificationTick(db);
    const results = await Promise.all(cohort.map(async user => {
      const response = await notifications(user.cookie);
      const item = response.items.find((n: any) => n.href === `/calendar?event=${id}`);
      expect(item.status).toBe("delivered");
      const reads = await Promise.all([json<any>(request(`/api/notifications/${item.id}/read`, user.cookie, {})), json<any>(request(`/api/notifications/${item.id}/read`, user.cookie, {}))]);
      expect(reads[0]).toEqual(reads[1]);
      expect((await db`SELECT user_id FROM notifications WHERE id = ${item.id}`)[0].user_id).toBe(user.id);
      return item.id;
    }));
    expect(new Set(results).size).toBe(125);
  });
});
