import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { createAttendanceHandler } from "../src/core/attendance-http";
import { createReportingHandler } from "../src/core/reporting-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import type { AcademicResource } from "../src/shared/foundation";
import type { Page } from "../src/shared/learning";
import type { AttendanceSummaryRow, AuditReportRow, CourseReportRow, OverviewSummary, ProgressReportRow, ReportFilterOptions } from "../src/shared/reporting";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 9 reporting (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let adminCookie: string;
  let yearId: string;
  let termId: string;
  let classId: string;
  let otherClassId: string;
  let taught: string;
  let untaught: string;
  const people: Record<"teacher" | "otherTeacher" | "student" | "peer" | "outsider", { id: string; cookie: string }> = {} as never;
  const schema = `hsi_phase9_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin: config.baseUrl, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  async function json<T = Record<string, unknown>>(response: Promise<Response>, status = 200): Promise<T> {
    const result = await response;
    const text = await result.text();
    if (result.status !== status) throw new Error(`Expected ${status}, received ${result.status}: ${text}`);
    return JSON.parse(text) as T;
  }
  const post = (courseId: string, suffix: string, body: unknown, cookie = people.teacher.cookie) => request(`/api/learning/courses/${courseId}/${suffix}`, cookie, body);
  const report = <T>(path: string, cookie: string) => json<T>(request(`/api/reports/${path}`, cookie));
  async function academic(resource: AcademicResource, body: Record<string, unknown>) {
    return (await createAcademic(db, resource, body, adminId, crypto.randomUUID())).id;
  }
  async function user(name: string, role: string) {
    const { id } = await createUser(db, { name, role, email: `${name}@example.test`, identifier: name.toUpperCase(), password }, adminId, crypto.randomUUID());
    const login = await request("/api/auth/login", "", { email: `${name}@example.test`, password });
    expect(login.status).toBe(200);
    return { id, cookie: login.headers.get("set-cookie")!.split(";")[0]! };
  }
  // A published course with one published lesson and one published assignment.
  async function workspace(name: string, targetClass: string, teacherId: string) {
    const subjectId = await academic("subjects", { name: `Mapel ${name}`, code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name, classId: targetClass, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const cookie = teacherId === people.teacher.id ? people.teacher.cookie : people.otherTeacher.cookie;
    const moduleId = (await json<{ id: string }>(post(courseId, "modules", { title: "Modul", position: 1 }, cookie), 201)).id;
    const lessonId = (await json<{ id: string }>(post(courseId, "lessons", { moduleId, title: "Lesson", content: "Isi", position: 1 }, cookie), 201)).id;
    const activityId = (await json<{ id: string }>(post(courseId, "activities", { lessonId, kind: "assignment", title: "Tugas", instructions: "Kerjakan." }, cookie), 201)).id;
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`, `activities/${activityId}/publish`]) {
      await json(post(courseId, suffix, { published: true }, cookie));
    }
    return { courseId, lessonId, activityId };
  }
  // One closed meeting: the santri is present, their peer is absent.
  async function meeting(courseId: string) {
    const starts = new Date(Date.now() - 3600000).toISOString();
    const sessionId = (await json<{ id: string }>(request(`/api/attendance/courses/${courseId}/sessions`, people.teacher.cookie,
      { title: "Pertemuan 1", startsAt: starts, endsAt: new Date(Date.now() - 1800000).toISOString(), requestKey: crypto.randomUUID() }), 201)).id;
    const patch = (body: unknown, suffix = "") => json(request(`/api/attendance/courses/${courseId}/sessions/${sessionId}${suffix}`, people.teacher.cookie, body, "PATCH"));
    await patch({ action: "open", version: 1 });
    await patch({ status: "present", previousId: null }, `/attendance/${people.student.id}`);
    await patch({ status: "absent", previousId: null }, `/attendance/${people.peer.id}`);
    const [row] = await db<{ version: number }[]>`SELECT version FROM classroom_sessions WHERE id = ${sessionId}`;
    await patch({ action: "close", version: row!.version });
    return sessionId;
  }

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, {
      foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"),
      attendance: createAttendanceHandler(db), reports: createReportingHandler(db, config.timezone), dashboard: async () => ({}),
    });
    adminCookie = (await request("/api/auth/login", "", { email: "admin@example.test", password })).headers.get("set-cookie")!.split(";")[0]!;
    people.teacher = await user("teacher", "teacher");
    people.otherTeacher = await user("otherteacher", "teacher");
    for (const name of ["student", "peer", "outsider"] as const) people[name] = await user(name, "student");
    yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    classId = await academic("classes", { yearId, name: "X A" });
    otherClassId = await academic("classes", { yearId, name: "X B" });
    for (const name of ["student", "peer"] as const) await academic("enrollments", { classId, studentId: people[name].id });
    await academic("enrollments", { classId: otherClassId, studentId: people.outsider.id });
    const mine = await workspace("Course Guru", classId, people.teacher.id);
    taught = mine.courseId;
    untaught = (await workspace("Course Lain", otherClassId, people.otherTeacher.id)).courseId;
    await json(post(taught, `lessons/${mine.lessonId}/complete`, {}, people.student.cookie));
    await json(post(taught, `activities/${mine.activityId}/submit`, { content: "Jawaban saya." }, people.student.cookie));
    const submissions = await json<Page<{ id: string }>>(request(`/api/learning/courses/${taught}/activities/${mine.activityId}/submissions`, people.teacher.cookie));
    await json(post(taught, `submissions/${submissions.items[0]!.id}/grade`, { score: 80, feedback: "Bagus.", previousGradeId: null }));
    await meeting(taught);
  });
  afterAll(async () => {
    if (!db) return;
    try { await db.unsafe(`DROP SCHEMA ${schema} CASCADE`); } finally { await db.close(); }
  });

  test("reports need reports.view; santri and anonymous callers are refused", async () => {
    for (const path of ["filters", "overview", "courses", "attendance", "progress", "courses.csv"]) {
      expect((await request(`/api/reports/${path}`, people.student.cookie)).status).toBe(403);
    }
    expect((await request("/api/reports/overview", "")).status).toBe(401);
    expect((await request("/api/reports/unknown", adminCookie)).status).toBe(404);
    expect((await request("/api/reports/overview", adminCookie, {}, "POST")).status).toBe(405);
  });

  test("filter options list only the academic records inside the actor's scope", async () => {
    const mine = await report<ReportFilterOptions>("filters", people.teacher.cookie);
    expect(mine.courses.map(course => course.id)).toEqual([taught]);
    expect(mine.classes.map(item => item.id)).toEqual([classId]);
    expect(mine.terms.map(term => term.id)).toEqual([termId]);
    expect(mine.years.map(year => year.id)).toEqual([yearId]);
    expect(mine.canViewAudit).toBe(false);
    expect(mine.events).toEqual([]);
    const all = await report<ReportFilterOptions>("filters", adminCookie);
    expect(all.courses.map(course => course.id).sort()).toEqual([taught, untaught].sort());
    expect(all.classes).toHaveLength(2);
    expect(all.canViewAudit).toBe(true);
    expect(all.events).toContain("learning.courses.published");
  });

  test("the overview aggregates the whole school for an admin and one course for its teacher", async () => {
    const all = await report<OverviewSummary>("overview", adminCookie);
    expect(all).toMatchObject({ courses: 2, publishedCourses: 2, students: 3, sessions: 1, closedSessions: 1, submissions: 1, pendingGrading: 0 });
    expect(all.attendanceRate).toBe(50);
    expect(all.averageScore).toBe(80);
    expect(all.xpAwarded).toBeGreaterThan(0);
    const mine = await report<OverviewSummary>("overview", people.teacher.cookie);
    expect(mine).toMatchObject({ courses: 1, students: 2, sessions: 1, submissions: 1 });
    expect(mine.lessonCompletionRate).toBe(50);
    const filtered = await report<OverviewSummary>(`overview?classId=${otherClassId}`, adminCookie);
    expect(filtered).toMatchObject({ courses: 1, students: 1, sessions: 0, submissions: 0 });
    expect(filtered.attendanceRate).toBeNull();
  });

  test("the course report pages, searches, and never leaves the actor's scope", async () => {
    const all = await report<Page<CourseReportRow>>("courses", adminCookie);
    expect(all.nextOffset).toBeNull();
    expect(all.items).toHaveLength(2);
    const mine = await report<Page<CourseReportRow>>("courses", people.teacher.cookie);
    expect(mine.items.map(row => row.courseId)).toEqual([taught]);
    expect(mine.items[0]).toMatchObject({ students: 2, lessons: 1, activities: 1, sessions: 1, attendanceRate: 50, submissions: 1, pendingGrading: 0, averageScore: 80, published: true });
    // A course outside the teacher's assignments filters to nothing rather than leaking a row.
    expect((await report<Page<CourseReportRow>>(`courses?courseId=${untaught}`, people.teacher.cookie)).items).toEqual([]);
    expect((await report<Page<CourseReportRow>>("courses?q=Course%20Lain", adminCookie)).items.map(row => row.courseId)).toEqual([untaught]);
  });

  test("the attendance summary counts every noncancelled session across courses", async () => {
    const rows = (await report<Page<AttendanceSummaryRow>>("attendance", people.teacher.cookie)).items;
    expect(rows.map(row => row.studentName)).toEqual(["peer", "student"]);
    expect(rows[0]).toMatchObject({ className: "X A", courses: 1, total: 1, closed: 1, absent: 1, attended: 0, rate: 0 });
    expect(rows[1]).toMatchObject({ identifier: "STUDENT", present: 1, unrecorded: 0, attended: 1, rate: 100 });
    expect((await report<Page<AttendanceSummaryRow>>("attendance?q=peer", adminCookie)).items.map(row => row.studentName)).toEqual(["peer"]);
    expect((await report<Page<AttendanceSummaryRow>>(`attendance?classId=${otherClassId}`, adminCookie)).items).toEqual([]);
  });

  test("the progress report combines lessons, assignments, assessments and XP per santri", async () => {
    const rows = (await report<Page<ProgressReportRow>>("progress", people.teacher.cookie)).items;
    expect(rows.map(row => row.studentName)).toEqual(["peer", "student"]);
    expect(rows[1]).toMatchObject({ className: "X A", courses: 1, lessons: 1, completed: 1, lessonRate: 100, activities: 1, submitted: 1, graded: 1, averageScore: 80, attempts: 0 });
    expect(rows[1]!.xp).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ completed: 0, lessonRate: 0, submitted: 0, graded: 0, averageScore: null, xp: 0 });
    const outsider = (await report<Page<ProgressReportRow>>(`progress?classId=${otherClassId}`, adminCookie)).items;
    expect(outsider.map(row => row.studentName)).toEqual(["outsider"]);
  });

  test("the audit report keeps audit.view and filters by event, actor and date", async () => {
    expect((await request("/api/reports/audit", people.teacher.cookie)).status).toBe(403);
    const all = await report<Page<AuditReportRow>>("audit", adminCookie);
    expect(all.items.length).toBeGreaterThan(0);
    expect(all.items[0]!.createdAt >= all.items[all.items.length - 1]!.createdAt).toBe(true);
    // ISO UTC, so the browser can parse it: PostgreSQL's own text form cannot be.
    expect(all.items[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isFinite(Date.parse(all.items[0]!.createdAt))).toBe(true);
    const filtered = await report<Page<AuditReportRow>>("audit?event=learning.courses.published", adminCookie);
    expect(filtered.items.every(row => row.event === "learning.courses.published")).toBe(true);
    expect(filtered.items).toHaveLength(2);
    expect((await report<Page<AuditReportRow>>(`audit?actorId=${people.otherTeacher.id}&event=learning.courses.published`, adminCookie)).items).toHaveLength(1);
    expect((await report<Page<AuditReportRow>>("audit?from=2000-01-01&to=2000-01-02", adminCookie)).items).toEqual([]);
    expect((await request("/api/reports/audit?from=2026-13-01", adminCookie)).status).toBe(400);
    expect((await request("/api/reports/audit?event=Bukan%20Event", adminCookie)).status).toBe(400);
  });

  test("exports return a scoped CSV attachment and record one audit row", async () => {
    const response = await request(`/api/reports/attendance.csv?classId=${classId}`, people.teacher.cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="laporan-attendance-\d{4}-\d{2}-\d{2}\.csv"$/);
    const body = await response.text();
    expect(body.startsWith("﻿")).toBe(true);
    const lines = body.slice(1).trimEnd().split("\r\n");
    expect(lines[0]!.startsWith("Santri,NIS,Kelas")).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("student,STUDENT,X A");
    const [audit] = await db<{ event: string; resourceId: string | null }[]>`SELECT event, resource_id::text AS "resourceId" FROM audit_logs
      WHERE event = 'report.attendance.exported' AND actor_id = ${people.teacher.id}`;
    expect(audit).toMatchObject({ event: "report.attendance.exported", resourceId: classId });
    // Every kind exports, and an unscoped export audits without a resource.
    for (const kind of ["courses", "progress"]) expect((await request(`/api/reports/${kind}.csv`, people.teacher.cookie)).status).toBe(200);
    expect((await db`SELECT 1 FROM audit_logs WHERE event = 'report.courses.exported' AND resource_id IS NULL`).length).toBe(1);
    expect((await request("/api/reports/audit.csv", people.teacher.cookie)).status).toBe(403);
    expect((await request("/api/reports/audit.csv", adminCookie)).status).toBe(200);
  });

  test("malformed filters fail closed with 400 before any query runs", async () => {
    for (const search of ["?courseId=1", "?classId=%20abc", "?termId=" + "a".repeat(40), "?offset=-1", `?q=${"x".repeat(101)}`]) {
      expect((await request(`/api/reports/courses${search}`, adminCookie)).status).toBe(400);
    }
  });
});
