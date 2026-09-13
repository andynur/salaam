import { createAttendanceRealtime, type ClassroomSocket } from "../src/core/attendance-realtime";
import { createSessionToken, hashToken } from "../src/core/auth/session";
import { learningTasks } from "../src/modules/learning/dashboard";
import type { Server } from "bun";
import { createAttendanceHandler } from "../src/core/attendance-http";
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
import type { AcademicResource } from "../src/shared/foundation";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 6 attendance (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let server: Server<ClassroomSocket>;
  let realtime: ReturnType<typeof createAttendanceRealtime>;
  let auth: ReturnType<typeof createAuthService>;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let termId: string;
  let classId: string;
  const people: Record<"teacher" | "otherTeacher" | "student" | "peer" | "outsider", { id: string; cookie: string }> = {} as never;
  const schema = `hsi_phase6_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin: config.baseUrl, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const course = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
  const post = (courseId: string, suffix: string, body: unknown, cookie = people.teacher.cookie) => request(course(courseId, suffix), cookie, body);
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

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    auth = createAuthService(db, config);
    realtime = createAttendanceRealtime(db, auth, config);
    handle = createHttpHandler(config, auth, async () => {}, {
      attendance: createAttendanceHandler(db, realtime.changed), foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"),
      projects: createProjectHandler(db), gamification: createGamificationHandler(db), dashboard: async () => ({}),
    });
    server = Bun.serve({ hostname: "127.0.0.1", port: 32000 + Math.floor(Math.random() * 20000), websocket: realtime.websocket,
      fetch: (request, current) => new URL(request.url).pathname === "/api/attendance/live" ? realtime.upgrade(request, current) : handle(request),
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
  afterAll(async () => { realtime?.stop(); await server?.stop(true); if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); } });

  const base = (id: string) => `/api/attendance/courses/${id}/sessions`;
  const input = () => ({ title: "Pertemuan", startsAt: "2026-09-12T07:00:00.000Z", endsAt: "2026-09-12T08:00:00.000Z", note: "Catatan guru", requestKey: crypto.randomUUID() });
  async function meeting() {
    const f = await workspace();
    const body = input();
    const created = await json<{ id: string }>(request(base(f.courseId), people.teacher.cookie, body), 201);
    return { ...f, id: created.id, path: `${base(f.courseId)}/${created.id}`, body };
  }
  const detail = (path: string, cookie = people.teacher.cookie) => json<any>(request(path, cookie));
  const action = (path: string, body: unknown, cookie = people.teacher.cookie) => request(path, cookie, body, "PATCH");

  test("creation snapshots roster and exact retries; notes and peer rows stay private", async () => {
    const f = await meeting();
    expect(await json<{ id: string }>(request(base(f.courseId), people.teacher.cookie, f.body), 201)).toEqual({ id: f.id });
    expect((await request(base(f.courseId), people.teacher.cookie, { ...f.body, title: "Different" })).status).toBe(409);
    const manager = await detail(f.path);
    expect(manager.roster.items).toHaveLength(2);
    expect(manager.counts.unrecorded).toBe(2);
    expect(manager.session.note).toBe("Catatan guru");
    const personal = await detail(f.path, people.student.cookie);
    expect(personal.roster.items).toHaveLength(1);
    expect(personal.roster.items[0].studentId).toBe(people.student.id);
    expect(personal.session.note).toBeNull();
    expect(personal.counts.total).toBe(1);
    await db`UPDATE users SET display_name = 'New name' WHERE id = ${people.student.id}`;
    expect((await detail(f.path)).roster.items.find((r: any) => r.studentId === people.student.id).studentName).toBe("student");
    await db`UPDATE users SET display_name = 'student' WHERE id = ${people.student.id}`;
    expect((await request(f.path, people.outsider.cookie)).status).toBe(404);
    expect((await request(f.path, people.otherTeacher.cookie)).status).toBe(404);
    expect((await request(base(f.courseId), people.student.cookie, input())).status).toBe(403);
    expect((await request(f.path, "")).status).toBe(401);
    expect((await handle(new Request(`${config.baseUrl}${f.path}`, { method: "PATCH", headers: { cookie: people.teacher.cookie, "Content-Type": "application/json" }, body: '{}' }))).status).toBe(403);
  });

  test("recurring series materializes bounded roster snapshots and opens configured QR", async () => {
    const f = await workspace();
    const body = { title: "Kajian mingguan", startsAt: "2026-09-12T07:00:00.000Z", endsAt: "2026-09-12T08:00:00.000Z", intervalDays: 7, occurrenceCount: 3, note: "Seri", qrRotateSeconds: 45, qrLateAfterMinutes: 15, requestKey: crypto.randomUUID() };
    const created = await json<{ id: string; created: number }>(request(`${base(f.courseId)}/series`, people.teacher.cookie, body), 201);
    expect(created.created).toBe(3);
    expect((await db`SELECT count(*)::int AS count FROM classroom_sessions WHERE series_id = ${created.id}`)[0].count).toBe(3);
    const sessions = await db<{ id: string }[]>`SELECT id FROM classroom_sessions WHERE series_id = ${created.id} ORDER BY occurrence_index`;
    expect((await db`SELECT count(*)::int AS count FROM classroom_roster WHERE session_id = ${sessions[0]!.id}`)[0].count).toBe(2);
    await json(action(`${base(f.courseId)}/${sessions[0]!.id}`, { action: "open", version: 1 }));
    expect((await db`SELECT rotate_seconds, late_after FROM attendance_checkin_windows WHERE session_id = ${sessions[0]!.id}`)[0]).toMatchObject({ rotate_seconds: 45 });
    expect((await detail(`${base(f.courseId)}/${sessions[0]!.id}`)).checkin.window.status).toBe("open");
    expect(await json<{ id: string; created: number }>(request(`${base(f.courseId)}/series`, people.teacher.cookie, body), 201)).toEqual({ id: created.id, created: 0 });
  });

  test("lifecycle, append-only corrections, exact retries and closed-session reports", async () => {
    const f = await meeting();
    const row = `${f.path}/attendance/${people.student.id}`;
    expect((await action(row, { status: "present", previousId: null })).status).toBe(409);
    await json(action(f.path, { action: "open", version: 1 }));
    await json(action(f.path, { action: "open", version: 1 }));
    expect((await action(f.path, { action: "close", version: 2 })).status).toBe(409);
    const first = await json<{ id: string }>(action(row, { status: "present", previousId: null, note: "Privat" }));
    expect(await json<{ id: string }>(action(row, { status: "present", previousId: null, note: "Privat" }))).toEqual(first);
    expect((await detail(f.path, people.student.cookie)).roster.items[0].note).toBeNull();
    await json(action(`${f.path}/attendance/${people.peer.id}`, { status: "sick", previousId: null }));
    expect((await action(f.path, { action: "close", version: 2 })).status).toBe(409);
    await json(action(f.path, { action: "close", version: 4 }));
    let report = await json<any>(request(`/api/attendance/courses/${f.courseId}/report`, people.student.cookie));
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({ rate: 100, closed: 1, attended: 1 });
    expect((await action(row, { status: "absent", previousId: first.id })).status).toBe(409);
    expect((await action(f.path, { action: "reopen", version: 5 })).status).toBe(400);
    await json(action(f.path, { action: "reopen", version: 5, reason: "Koreksi daftar" }));
    await json(action(row, { status: "absent", previousId: first.id }));
    await json(action(f.path, { action: "close", version: 7 }));
    report = await json<any>(request(`/api/attendance/courses/${f.courseId}/report`, people.student.cookie));
    expect(report.items[0]).toMatchObject({ rate: 0, absent: 1, attended: 0 });
    expect((await db`SELECT * FROM attendance_records WHERE session_id = ${f.id} AND student_id = ${people.student.id}`).length).toBe(2);
    expect((await db`SELECT reason FROM classroom_session_events WHERE session_id = ${f.id} AND action = 'reopen'`)[0].reason).toBe("Koreksi daftar");
    expect((await db`SELECT * FROM xp_entries WHERE student_id = ${people.student.id}`).length).toBe(0);
  });

  test("bulk attendance is atomic, retry-safe, audited, and manager-only history is scoped", async () => {
    const f = await meeting();
    await json(action(f.path, { action: "open", version: 1 }));
    const rows = (await detail(f.path)).roster.items;
    const body = { records: rows.map((row: any) => ({ studentId: row.studentId, status: "present", note: "", previousId: null })) };
    expect(await json<{ recorded: number }>(request(`${f.path}/bulk-attendance`, people.teacher.cookie, body))).toEqual({ recorded: 2 });
    expect(await json<{ recorded: number }>(request(`${f.path}/bulk-attendance`, people.teacher.cookie, body))).toEqual({ recorded: 0 });
    expect((await detail(f.path)).counts).toMatchObject({ present: 2, unrecorded: 0 });
    const history = await json<any>(request(`${f.path}/history`, people.teacher.cookie));
    expect(history.items.map((event: any) => event.action)).toEqual(["open"]);
    expect((await db`SELECT event FROM audit_logs WHERE actor_id = ${people.teacher.id} AND event = 'classroom.attendance.bulk_recorded'`).length).toBe(1);
    expect((await request(`${f.path}/history`, people.student.cookie)).status).toBe(403);
    expect((await request(`${f.path}/history`, people.otherTeacher.cookie)).status).toBe(404);
  });

  test("concurrent writers have one winner and failed audit rolls back", async () => {
    const f = await meeting();
    await json(action(f.path, { action: "open", version: 1 }));
    const row = `${f.path}/attendance/${people.student.id}`;
    const responses = await Promise.all(["present", "absent"].map(status => action(row, { status, previousId: null })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const old = await detail(f.path);
    await db.unsafe("ALTER TABLE audit_logs ADD CONSTRAINT reject_attendance_audit CHECK (event <> 'classroom.attendance.recorded') NOT VALID");
    try {
      expect((await action(`${f.path}/attendance/${people.peer.id}`, { status: "late", previousId: null })).status).toBe(400);
      expect((await detail(f.path)).session.version).toBe(old.session.version);
      expect((await db`SELECT * FROM attendance_records WHERE session_id = ${f.id} AND student_id = ${people.peer.id}`).length).toBe(0);
    } finally { await db.unsafe("ALTER TABLE audit_logs DROP CONSTRAINT reject_attendance_audit"); }
  });

  test("empty sessions, cancellation, notes, pagination, and revoked course access", async () => {
    const f = await meeting();
    await json(action(f.path, { action: "note", version: 1, note: "Rencana" }));
    expect((await detail(f.path)).session.note).toBe("Rencana");
    await json(action(f.path, { action: "cancel", version: 2, reason: "Libur" }));
    expect((await detail(f.path)).session.status).toBe("cancelled");
    expect((await action(f.path, { action: "open", version: 3 })).status).toBe(409);
    expect((await json<any>(request(`/api/attendance/courses/${f.courseId}/report`, people.teacher.cookie))).items).toHaveLength(0);
    expect((await detail(f.path + '?q=no-match')).roster.items).toHaveLength(0);
    expect((await request(f.path + '?offset=-1', people.teacher.cookie)).status).toBe(400);
    await db`UPDATE courses SET published = false WHERE id = ${f.courseId}`;
    expect((await request(f.path, people.student.cookie)).status).toBe(404);
    const emptyClass = await academic("classes", { yearId: (await db`SELECT academic_year_id FROM classes WHERE id = ${classId}`)[0].academic_year_id, name: "Empty" });
    const emptyCourse = await workspace(emptyClass);
    const created = await json<any>(request(base(emptyCourse.courseId), people.teacher.cookie, input()), 201);
    expect((await action(`${base(emptyCourse.courseId)}/${created.id}`, { action: "open", version: 1 })).status).toBe(409);
  });
  function socketUrl(f: { courseId: string; id: string }) { return `ws://127.0.0.1:${server.port}/api/attendance/live?courseId=${f.courseId}&sessionId=${f.id}`; }
  async function connect(f: { courseId: string; id: string }, cookie: string) {
    const NativeWebSocket = WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket };
    const ws = new NativeWebSocket(socketUrl(f), { headers: { cookie, origin: config.baseUrl } });
    const messages: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket initialization timeout")), 15000);
      ws.onmessage = event => { messages.push(String(event.data)); clearTimeout(timeout); resolve(); };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error("WebSocket failed")); };
    });
    return { ws, messages };
  }
  async function until(check: () => boolean) {
    const end = Date.now() + 15000;
    while (!check()) { if (Date.now() > end) throw new Error("Realtime condition timed out"); await Bun.sleep(25); }
  }
  test("WebSocket enforces origin, scope, limits, invalidation, reconnect, and revocation", async () => {
    const f = await meeting();
    const endpoint = socketUrl(f).replace("ws:", "http:");
    expect((await fetch(endpoint, { headers: { origin: "https://wrong.test", cookie: people.teacher.cookie } })).status).toBe(403);
    expect((await fetch(endpoint, { headers: { origin: config.baseUrl } })).status).toBe(401);
    expect((await fetch(endpoint, { headers: { origin: config.baseUrl, cookie: people.outsider.cookie } })).status).toBe(404);
    const connections = await Promise.all(Array.from({ length: 4 }, () => connect(f, people.student.cookie)));
    try {
      expect((await fetch(endpoint, { headers: { origin: config.baseUrl, cookie: people.student.cookie } })).status).toBe(429);
      await json(action(f.path, { action: "open", version: 1 }));
      await until(() => connections.every(c => c.messages.length >= 2));
      expect(connections.every(c => c.messages.every(message => message === '{"type":"changed"}'))).toBe(true);
      connections[0]!.ws.close();
      await until(() => connections[0]!.ws.readyState === WebSocket.CLOSED);
      await Bun.sleep(50);
      const recovered = await connect(f, people.student.cookie);
      recovered.ws.close();
      await db`UPDATE courses SET published = false WHERE id = ${f.courseId}`;
      await until(() => connections.slice(1).every(c => c.ws.readyState === WebSocket.CLOSED));
    } finally { for (const c of connections) c.ws.close(); }
    const manager = await connect(f, people.teacher.cookie);
    const actor = await auth.actor(new Request(config.baseUrl, { headers: { cookie: people.teacher.cookie } }));
    expect((await learningTasks(db, actor!)).some(task => task.id === f.id && task.type === "attendance")).toBe(true);
    manager.ws.send("unexpected");
    await until(() => manager.ws.readyState === WebSocket.CLOSED);
  }, 25000);

  test("125 students receive only invalidations and read their personal roster concurrently", async () => {
    const f = await workspace();
    const cookies: string[] = [];
    for (let i = 0; i < 125; i++) {
      const [student] = await db`INSERT INTO users (email, display_name, password_hash) SELECT ${`load-${i}@example.test`}, ${`Load ${i}`}, password_hash FROM users WHERE id = ${adminId} RETURNING id`;
      await db`INSERT INTO user_roles SELECT ${student.id}, id FROM roles WHERE key = 'student'`;
      await academic("enrollments", { classId, studentId: student.id });
      const token = createSessionToken();
      await db`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${student.id}, clock_timestamp() + interval '1 hour')`;
      cookies.push(`${people.student.cookie.split('=')[0]}=${token}`);
    }
    const created = await json<{ id: string }>(request(base(f.courseId), people.teacher.cookie, input()), 201);
    const target = { courseId: f.courseId, id: created.id };
    const path = `${base(f.courseId)}/${created.id}`;
    const started = performance.now();
    const connections = await Promise.all(cookies.map(cookie => connect(target, cookie)));
    try {
      const responses = await Promise.all(cookies.map(cookie => detail(path, cookie)));
      expect(responses.every(result => result.roster.items.length === 1 && result.counts.total === 1 && result.session.note === null)).toBe(true);
      await json(action(path, { action: "open", version: 1 }));
      await until(() => connections.every(c => c.messages.length >= 2));
      expect(connections.every(c => c.messages.every(message => message === '{"type":"changed"}'))).toBe(true);
      expect(performance.now() - started).toBeLessThan(15000);
      expect((await detail(path)).roster.nextOffset).toBe(50);
      expect((await detail(path + '?offset=100')).roster.items).toHaveLength(27);
      // Expire a session token: the open socket is closed by periodic authorization.
      const expired = cookies[0]!.split('=')[1]!;
      await db`DELETE FROM sessions WHERE token_hash = ${hashToken(expired)}`;
      await until(() => connections[0]!.ws.readyState === WebSocket.CLOSED);
    } finally { for (const c of connections) c.ws.close(); }
  }, 30000);

  test("database constraints and audit rollback protect complete session mutations", async () => {
    const f = await meeting();
    const invalidRecord = async () => { await db`INSERT INTO attendance_records (session_id, student_id, status, recorded_by) VALUES (${f.id}, ${people.outsider.id}, 'present', ${teacherId})`; };
    await expect(invalidRecord()).rejects.toThrow();
    const invalidDuration = async () => { await db`UPDATE classroom_sessions SET ends_at = starts_at WHERE id = ${f.id}`; };
    await expect(invalidDuration()).rejects.toThrow();
    await db.unsafe("ALTER TABLE audit_logs ADD CONSTRAINT reject_session_audit CHECK (event NOT IN ('classroom.session.created', 'classroom.session.opened')) NOT VALID");
    try {
      const body = input();
      expect((await request(base(f.courseId), people.teacher.cookie, body)).status).toBe(400);
      expect((await db`SELECT * FROM classroom_sessions WHERE request_key = ${body.requestKey}`).length).toBe(0);
      expect((await action(f.path, { action: 'open', version: 1 })).status).toBe(400);
      expect((await detail(f.path)).session).toMatchObject({ status: 'scheduled', version: 1 });
      expect((await db`SELECT * FROM classroom_session_events WHERE session_id = ${f.id}`).length).toBe(0);
    } finally { await db.unsafe("ALTER TABLE audit_logs DROP CONSTRAINT reject_session_audit"); }
    const actor = await auth.actor(new Request(config.baseUrl, { headers: { cookie: people.student.cookie } }));
    expect((await createAttendanceHandler(db)(new Request(config.baseUrl + f.path), { ...actor!, permissions: [] }, crypto.randomUUID()).catch((error: any) => error.status))).toBe(403);
  });

  test("roster limit is 500, concurrent creation retries agree, and later enrollment does not rewrite snapshots", async () => {
    const yearId = (await db`SELECT academic_year_id FROM classes WHERE id = ${classId}`)[0].academic_year_id;
    const largeClass = await academic("classes", { yearId, name: 'Large roster' });
    const f = await workspace(largeClass);
    await db`INSERT INTO users (email, display_name, password_hash) SELECT 'roster-' || n || '@example.test', 'Roster ' || n, u.password_hash FROM generate_series(1, 501) n CROSS JOIN users u WHERE u.id = ${adminId}`;
    await db`INSERT INTO class_members (class_id, academic_year_id, student_id) SELECT ${largeClass}, ${yearId}, id FROM users WHERE email LIKE 'roster-%@example.test'`;
    const body = input();
    expect((await request(base(f.courseId), people.teacher.cookie, body)).status).toBe(400);
    await db`UPDATE users SET is_active = false WHERE email = 'roster-501@example.test'`;
    const responses = await Promise.all([request(base(f.courseId), people.teacher.cookie, body), request(base(f.courseId), people.teacher.cookie, body)]);
    expect(responses.map(r => r.status)).toEqual([201, 201]);
    const [a, b] = await Promise.all(responses.map(r => r.json()));
    expect(a.id).toBe(b.id);
    expect((await detail(`${base(f.courseId)}/${a.id}`)).counts.total).toBe(500);
    await db`DELETE FROM class_members WHERE class_id = ${largeClass}`;
    expect((await detail(`${base(f.courseId)}/${a.id}`)).counts.total).toBe(500);
    const report = await json<any>(request(`/api/attendance/courses/${f.courseId}/report`, people.teacher.cookie));
    expect(report.items).toHaveLength(50);
    expect(report.nextOffset).toBe(50);
    expect(report.items.every((r: any) => r.unrecorded === 1 && r.rate === null)).toBe(true);
  });

  test("agenda lists today's and still-open sessions in scope with role-specific progress", async () => {
    const f = await workspace();
    // Noon in the school timezone keeps "today" stable whatever time the suite runs.
    const [{ noon }] = await db<[{ noon: Date }]>`SELECT (((clock_timestamp() AT TIME ZONE ${config.timezone})::date + time '12:00') AT TIME ZONE ${config.timezone}) AS noon`;
    const at = (days: number, hours = 0) => new Date(noon.getTime() + days * 86400000 + hours * 3600000).toISOString();
    const create = async (title: string, days: number) => (await json<{ id: string }>(request(base(f.courseId), people.teacher.cookie, { ...input(), title, startsAt: at(days), endsAt: at(days, 1) }), 201)).id;
    const today = await create("Hari ini", 0);
    const tomorrow = await create("Besok", 1);
    const earlier = await create("Lupa ditutup", -2);
    const cancelled = await create("Dibatalkan", 0);
    const agenda = (cookie: string) => json<any>(request("/api/attendance/agenda", cookie));
    const ids = (result: any) => result.sessions.filter((s: any) => s.courseId === f.courseId).map((s: any) => s.id);
    await json(action(`${base(f.courseId)}/${earlier}`, { action: "open", version: 1 }));
    await json(action(`${base(f.courseId)}/${cancelled}`, { action: "cancel", version: 1, reason: "Libur" }));
    await json(action(`${base(f.courseId)}/${earlier}/attendance/${people.student.id}`, { status: "late", previousId: null }));

    const manager = await agenda(people.teacher.cookie);
    expect(typeof manager.now).toBe("string");
    expect(ids(manager)[0]).toBe(earlier);
    expect(new Set(ids(manager))).toEqual(new Set([earlier, today, cancelled]));
    expect(manager.sessions.find((s: any) => s.id === earlier)).toMatchObject({ status: "open", canManage: true, recorded: 1, myStatus: null, checkinOpen: false });
    // Other tests enrol extra santri into the shared class, so compare with the snapshot itself.
    const [{ rostered }] = await db<[{ rostered: number }]>`SELECT count(*)::int AS rostered FROM classroom_roster WHERE session_id = ${earlier} AND removed_at IS NULL`;
    expect(manager.sessions.find((s: any) => s.id === earlier).total).toBe(rostered);
    expect(manager.courses.find((c: any) => c.courseId === f.courseId)).toMatchObject({ sessionId: earlier, status: "open" });

    const student = await agenda(people.student.cookie);
    expect(new Set(ids(student))).toEqual(new Set([earlier, today, cancelled]));
    expect(student.sessions.find((s: any) => s.id === earlier)).toMatchObject({ canManage: false, total: null, recorded: null, myStatus: "late" });
    expect((await agenda(people.peer.cookie)).sessions.find((s: any) => s.id === earlier).myStatus).toBeNull();
    expect(ids(await agenda(people.outsider.cookie))).toEqual([]);
    expect(ids(await agenda(people.otherTeacher.cookie))).toEqual([]);
    expect((await agenda(people.otherTeacher.cookie)).courses.some((c: any) => c.courseId === f.courseId)).toBe(false);

    await json(action(`${base(f.courseId)}/${earlier}`, { action: "cancel", version: 3, reason: "Tidak jadi" }));
    const closed = await agenda(people.teacher.cookie);
    expect(ids(closed)).not.toContain(earlier);
    expect(closed.courses.find((c: any) => c.courseId === f.courseId)).toMatchObject({ status: "scheduled" });
    expect([today, tomorrow]).toContain(closed.courses.find((c: any) => c.courseId === f.courseId).sessionId);

    await json(action(`${base(f.courseId)}/${today}/roster`, { studentId: people.peer.id, active: false, version: 1 }));
    expect(ids(await agenda(people.peer.cookie))).not.toContain(today);
    await db`UPDATE courses SET published = false WHERE id = ${f.courseId}`;
    expect(ids(await agenda(people.student.cookie))).toEqual([]);
    expect(ids(await agenda(people.teacher.cookie))).toContain(today);
    expect((await request("/api/attendance/agenda", people.teacher.cookie, {})).status).toBe(405);
    expect((await request("/api/attendance/agenda", "")).status).toBe(401);
  });

  test("managers can adjust a roster, preserve history, and apply changes to future series sessions", async () => {
    const yearId = (await db`SELECT academic_year_id FROM classes WHERE id = ${classId}`)[0].academic_year_id;
    const targetClass = await academic("classes", { yearId, name: `Roster adjustments ${crypto.randomUUID().slice(0, 6)}` });
    const [added] = await db<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash) SELECT ${`roster-added-${crypto.randomUUID()}@example.test`}, 'Roster added', password_hash FROM users WHERE id = ${adminId} RETURNING id`;
    await db`INSERT INTO user_roles SELECT ${added!.id}, id FROM roles WHERE key = 'student'`;
    await academic("enrollments", { classId: targetClass, studentId: added!.id });
    const f = await workspace(targetClass);
    const created = await json<{ id: string }>(request(base(f.courseId), people.teacher.cookie, input()), 201);
    const path = `${base(f.courseId)}/${created.id}`;
    const options = await json<any>(request(`${path}/roster-options`, people.teacher.cookie));
    expect(options).toHaveLength(0);
    const removed = await json<any>(action(`${path}/roster`, { studentId: added!.id, active: false, version: 1 }));
    expect(removed).toMatchObject({ active: false, affectedSessions: 1 });
    expect((await detail(path)).counts.total).toBe(0);
    expect((await db`SELECT removed_at FROM classroom_roster WHERE session_id = ${created.id} AND student_id = ${added!.id}`)[0].removed_at).not.toBeNull();
    const restored = await json<any>(action(`${path}/roster`, { studentId: added!.id, active: true, version: 2 }));
    expect(restored).toMatchObject({ active: true, affectedSessions: 1 });
    expect((await detail(path)).counts.total).toBe(1);
    expect((await db`SELECT count(*)::int AS count FROM classroom_session_events WHERE session_id = ${created.id} AND action = 'roster'`)[0].count).toBe(2);
    const series = await json<any>(request(`${base(f.courseId)}/series`, people.teacher.cookie, { title: "Roster future", startsAt: "2026-10-01T07:00:00.000Z", endsAt: "2026-10-01T08:00:00.000Z", intervalDays: 7, occurrenceCount: 2, note: "", qrRotateSeconds: 30, qrLateAfterMinutes: null, requestKey: crypto.randomUUID() }), 201);
    const sessions = await db<{ id: string }[]>`SELECT id FROM classroom_sessions WHERE series_id = ${series.id} ORDER BY occurrence_index`;
    await json<any>(action(`${base(f.courseId)}/${sessions[0]!.id}/roster`, { studentId: added!.id, active: false, version: 1, scope: "future_series" }));
    expect((await db`SELECT count(*)::int AS count FROM classroom_roster r JOIN classroom_sessions s ON s.id = r.session_id WHERE s.series_id = ${series.id} AND r.student_id = ${added!.id} AND r.removed_at IS NULL`)[0].count).toBe(0);
    expect((await action(`${path}/roster`, { studentId: added!.id, active: false, version: 2 })).status).toBe(409);
  });

});
