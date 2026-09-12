import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { createSessionToken, hashToken } from "../src/core/auth/session";
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
describe.skipIf(!url)("Phase 7 QR attendance (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let auth: ReturnType<typeof createAuthService>;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let termId: string;
  let classId: string;
  const people: Record<"teacher" | "otherTeacher" | "student" | "peer" | "outsider", { id: string; cookie: string }> = {} as never;
  const schema = `hsi_phase7_${crypto.randomUUID().replaceAll("-", "")}`;
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
    return { courseId };
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
      attendance: createAttendanceHandler(db), foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"),
      projects: createProjectHandler(db), gamification: createGamificationHandler(db), dashboard: async () => ({}),
    });
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

  const base = (id: string) => `/api/attendance/courses/${id}/sessions`;
  const input = () => ({ title: "Pertemuan", startsAt: "2026-09-12T07:00:00.000Z", endsAt: "2026-09-12T08:00:00.000Z", requestKey: crypto.randomUUID() });
  const detail = (path: string, cookie = people.teacher.cookie) => json<any>(request(path, cookie));
  const action = (path: string, body: unknown, cookie = people.teacher.cookie) => request(path, cookie, body, "PATCH");
  const window_ = (path: string, body: unknown, cookie = people.teacher.cookie) => action(`${path}/checkin`, body, cookie);
  const issue = (path: string, cookie = people.teacher.cookie) => request(`${path}/checkin/codes`, cookie, {});
  const checkin = (path: string, code: string, cookie: string) => request(`${path}/checkin`, cookie, { code });
  // A session opened for attendance, ready for a check-in window.
  async function openMeeting(targetClass = classId) {
    const { courseId } = await workspace(targetClass);
    const { id } = await json<{ id: string }>(request(base(courseId), people.teacher.cookie, input()), 201);
    const path = `${base(courseId)}/${id}`;
    await json(action(path, { action: "open", version: 1 }));
    return { courseId, id, path };
  }

  test("only a course manager opens a window, and only while the session is open", async () => {
    const { courseId } = await workspace();
    const { id } = await json<{ id: string }>(request(base(courseId), people.teacher.cookie, input()), 201);
    const path = `${base(courseId)}/${id}`;
    expect((await window_(path, { action: "start" })).status).toBe(409); // session still scheduled
    await json(action(path, { action: "open", version: 1 }));
    expect((await window_(path, { action: "start" }, people.student.cookie)).status).toBe(403);
    expect((await window_(path, { action: "start" }, people.otherTeacher.cookie)).status).toBe(404);
    expect((await issue(path, people.student.cookie)).status).toBe(403);
    expect((await window_(path, { action: "start", rotateSeconds: 5 })).status).toBe(400);
    expect((await window_(path, { action: "pause" })).status).toBe(400);
    // A non-GET request without the application Origin never reaches the service.
    expect((await request(`${path}/checkin`, people.teacher.cookie, { action: "start" }, "PATCH", null)).status).toBe(403);
    const started = await json<{ status: string }>(window_(path, { action: "start", rotateSeconds: 60 }));
    expect(started.status).toBe("open");
    // Repeating the identical operation is a retry, not a new window.
    expect(await json<{ sessionId: string; status: string }>(window_(path, { action: "start", rotateSeconds: 60 }))).toEqual({ sessionId: id, status: "open" });
    const manager = await detail(path);
    expect(manager.checkin.window).toEqual({ status: "open", rotateSeconds: 60, lateAfter: null, checkedIn: 0 });
    const personal = await detail(path, people.student.cookie);
    expect(personal.checkin.window.checkedIn).toBe(0);
    expect(personal.checkin.me).toBeNull();
    expect((await request(`${path}/checkin`, people.outsider.cookie, { code: "H7K2QM9XZ4" })).status).toBe(404);
    const audits = await db<{ event: string }[]>`SELECT event FROM audit_logs WHERE resource_id = ${id} AND event LIKE 'classroom.checkin%'`;
    expect(audits.map(row => row.event)).toEqual(["classroom.checkin.started"]);
  });

  test("codes rotate, only their digests are stored, and stopping retires every live code", async () => {
    const f = await openMeeting();
    await json(window_(f.path, { action: "start", rotateSeconds: 60 }));
    const first = await json<{ code: string; expiresAt: string; rotateSeconds: number }>(issue(f.path));
    expect(first.code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect(first.rotateSeconds).toBe(60);
    const second = await json<{ code: string }>(issue(f.path));
    expect(second.code).not.toBe(first.code);
    const stored = await db<{ code_hash: string }[]>`SELECT code_hash FROM attendance_checkin_codes WHERE session_id = ${f.id}`;
    expect(stored).toHaveLength(2);
    for (const row of stored) { expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/); expect(row.code_hash).not.toContain(first.code); }
    expect(stored.map(row => row.code_hash)).toContain(new Bun.CryptoHasher("sha256").update(first.code).digest("hex"));
    // The rotated-out code keeps a short grace so a scan in flight still lands.
    expect((await json<{ status: string }>(checkin(f.path, first.code, people.student.cookie), 201)).status).toBe("present");
    await json(window_(f.path, { action: "stop", rotateSeconds: 60 }));
    expect((await db`SELECT count(*)::int AS live FROM attendance_checkin_codes WHERE session_id = ${f.id} AND expires_at > clock_timestamp()`)[0]!.live).toBe(0);
    expect((await checkin(f.path, second.code, people.peer.cookie)).status).toBe(409);
    expect((await issue(f.path)).status).toBe(409);
    const audits = await db<{ event: string }[]>`SELECT event FROM audit_logs WHERE resource_id = ${f.id} AND event LIKE 'classroom.checkin%' ORDER BY created_at`;
    expect(audits.map(row => row.event)).toEqual(["classroom.checkin.started", "classroom.checkin.stopped"]);
  });

  test("a check-in writes one attendance record, is idempotent, and awards no XP", async () => {
    const f = await openMeeting();
    await json(window_(f.path, { action: "start" }));
    const { code } = await json<{ code: string }>(issue(f.path));
    expect((await checkin(f.path, "H7K2QM9XZ4", people.student.cookie)).status).toBe(409);
    expect((await checkin(f.path, "short", people.student.cookie)).status).toBe(400);
    const first = await json<{ status: string; createdAt: string }>(checkin(f.path, code, people.student.cookie), 201);
    expect(first.status).toBe("present");
    // Repeating with any code returns the same result instead of appending a record.
    const { code: later } = await json<{ code: string }>(issue(f.path));
    expect(await json<{ status: string; createdAt: string }>(checkin(f.path, later, people.student.cookie), 201)).toEqual(first);
    expect((await db`SELECT count(*)::int AS total FROM attendance_records WHERE session_id = ${f.id} AND student_id = ${people.student.id}`)[0]!.total).toBe(1);
    const record = (await db`SELECT recorded_by, previous_id, status FROM attendance_records WHERE session_id = ${f.id} AND student_id = ${people.student.id}`)[0]!;
    expect(record.recorded_by).toBe(people.student.id);
    expect(record.previous_id).toBeNull();
    const personal = await detail(f.path, people.student.cookie);
    expect(personal.checkin.me.status).toBe("present");
    expect(personal.counts.present).toBe(1);
    const manager = await detail(f.path);
    expect(manager.checkin.window.checkedIn).toBe(1);
    expect(manager.qrBreakdown).toEqual({ scanned: 1, present: 1, late: 0, unscanned: 1 });
    expect((await db`SELECT count(*)::int AS total FROM xp_entries`)[0]!.total).toBe(0);
    expect((await db`SELECT event FROM audit_logs a JOIN attendance_records r ON r.id = a.resource_id WHERE a.event = 'classroom.attendance.checked_in' AND r.session_id = ${f.id}`)).toHaveLength(1);
  });

  test("a late threshold uses the database clock", async () => {
    const f = await openMeeting();
    await json(window_(f.path, { action: "start", rotateSeconds: 60, lateAfter: "2020-01-01T00:00:00.000Z" }));
    const { code } = await json<{ code: string }>(issue(f.path));
    expect((await json<{ status: string }>(checkin(f.path, code, people.student.cookie), 201)).status).toBe("late");
    expect((await db`SELECT status FROM attendance_checkins WHERE session_id = ${f.id} AND student_id = ${people.student.id}`)[0]!.status).toBe("late");
  });

  test("teacher records win: an existing record blocks check-in, and corrections stay append-only", async () => {
    const f = await openMeeting();
    await json(window_(f.path, { action: "start" }));
    const { code } = await json<{ code: string }>(issue(f.path));
    await json(action(`${f.path}/attendance/${people.peer.id}`, { status: "absent", previousId: null }), 200);
    expect((await checkin(f.path, code, people.peer.cookie)).status).toBe(409);
    const mine = await json<{ status: string }>(checkin(f.path, code, people.student.cookie), 201);
    expect(mine.status).toBe("present");
    const original = (await db`SELECT id FROM attendance_records WHERE session_id = ${f.id} AND student_id = ${people.student.id}`)[0]!.id;
    await json(action(`${f.path}/attendance/${people.student.id}`, { status: "sick", note: "Izin sakit", previousId: original }));
    const chain = await db<{ status: string; previous_id: string | null }[]>`SELECT status, previous_id FROM attendance_records WHERE session_id = ${f.id} AND student_id = ${people.student.id} ORDER BY created_at`;
    expect(chain.map(row => row.status)).toEqual(["present", "sick"]);
    expect(chain[1]!.previous_id).toBe(original);
    // The check-in row still points at the record it created.
    expect((await db`SELECT record_id FROM attendance_checkins WHERE session_id = ${f.id} AND student_id = ${people.student.id}`)[0]!.record_id).toBe(original);
    expect((await detail(f.path, people.student.cookie)).checkin.me.status).toBe("present");
    // Check-ins count as recorded attendance, so the session can be closed.
    const version = (await detail(f.path)).session.version;
    await json(action(f.path, { action: "close", version }));
    expect((await checkin(f.path, code, people.peer.cookie)).status).toBe(409);
  });

  test("a cancelled session and an unstarted window both refuse check-ins", async () => {
    const f = await openMeeting();
    await json(window_(f.path, { action: "start" }));
    const { code } = await json<{ code: string }>(issue(f.path));
    expect((await window_(f.path, { action: "stop" }, people.student.cookie)).status).toBe(403);
    await json(action(f.path, { action: "cancel", version: (await detail(f.path)).session.version, reason: "Libur" }));
    expect((await checkin(f.path, code, people.student.cookie)).status).toBe(409);
    expect((await issue(f.path)).status).toBe(409);
    const other = await openMeeting();
    expect((await checkin(other.path, code, people.student.cookie)).status).toBe(409); // no window started
    expect((await detail(other.path)).checkin.window).toBeNull();
    expect((await window_(other.path, { action: "stop" })).status).toBe(404);
  });

  test("125 students check in concurrently against a rotating window", async () => {
    const yearId = (await db`SELECT id FROM academic_years LIMIT 1`)[0]!.id;
    const loadClass = await academic("classes", { yearId, name: `Load ${crypto.randomUUID().slice(0, 8)}` });
    const cookies: string[] = [];
    for (let i = 0; i < 125; i++) {
      const [student] = await db`INSERT INTO users (email, display_name, password_hash) SELECT ${`qr-${i}-${crypto.randomUUID().slice(0, 8)}@example.test`}, ${`Load ${i}`}, password_hash FROM users WHERE id = ${adminId} RETURNING id`;
      await db`INSERT INTO user_roles SELECT ${student!.id}, id FROM roles WHERE key = 'student'`;
      await academic("enrollments", { classId: loadClass, studentId: student!.id });
      const token = createSessionToken();
      await db`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${student!.id}, clock_timestamp() + interval '1 hour')`;
      cookies.push(`${people.student.cookie.split("=")[0]}=${token}`);
    }
    const f = await openMeeting(loadClass);
    await json(window_(f.path, { action: "start", rotateSeconds: 60 }));
    const { code } = await json<{ code: string }>(issue(f.path));
    const started = performance.now();
    const responses = await Promise.all(cookies.map(cookie => json<{ status: string }>(checkin(f.path, code, cookie), 201)));
    expect(responses.every(result => result.status === "present")).toBe(true);
    expect(performance.now() - started).toBeLessThan(15000);
    expect((await db`SELECT count(*)::int AS total FROM attendance_checkins WHERE session_id = ${f.id}`)[0]!.total).toBe(125);
    expect((await detail(f.path)).counts).toMatchObject({ total: 125, unrecorded: 0, present: 125 });
    expect((await detail(f.path)).qrBreakdown).toEqual({ scanned: 125, present: 125, late: 0, unscanned: 0 });
    // A duplicate burst from one santri still produces exactly one record.
    const again = await Promise.all(Array.from({ length: 5 }, () => checkin(f.path, code, cookies[0]!)));
    expect(again.every(response => [201, 409].includes(response.status))).toBe(true);
    expect((await db`SELECT count(*)::int AS total FROM attendance_records WHERE session_id = ${f.id}`)[0]!.total).toBe(125);
  }, 60000);
});
