import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { storedFilePath } from "../src/core/storage/files";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import { academicSummary } from "../src/modules/academic/summary";
import { learningTasks } from "../src/modules/learning/dashboard";
import { submitActivity } from "../src/modules/activities/service";
import type { AcademicResource } from "../src/shared/foundation";
import type { CourseDetail, Grade, Page, Progress, Submission, LearningCourse } from "../src/shared/learning";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 2 learning core (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let assistantId: string;
  let studentId: string;
  let peerId: string;
  let yearId: string;
  let classId: string;
  let termId: string;
  let admin: string;
  let teacher: string;
  let assistant: string;
  let student: string;
  let peer: string;
  let outsider: string;
  let otherTeacher: string;
  const schema = `hsi_phase2_${crypto.randomUUID().replaceAll("-", "")}`;
  const storage = `.test-artifacts/${schema}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST", origin = config.baseUrl) {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  function send(path: string, cookie: string, form: FormData, method = "POST") {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin: config.baseUrl }, body: form }), crypto.randomUUID());
  }
  function form(fields: Record<string, string>, file?: File) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    if (file) data.append("file", file);
    return data;
  }
  const pdf = (label: string) => new TextEncoder().encode(`%PDF-1.7\n${label}`);
  const path = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
  const post = (courseId: string, suffix: string, body: unknown, cookie = teacher) => request(path(courseId, suffix), cookie, body);
  const publish = (courseId: string, suffix: string, published = true) => post(courseId, `${suffix ? `${suffix}/` : ""}publish`, { published });
  async function created(response: Promise<Response>) {
    const result = await response;
    expect(result.status).toBe(201);
    return (await result.json() as { id: string }).id;
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
  async function fixture(visible = true, targetClass = classId) {
    const subjectId = await academic("subjects", { name: "Informatika", code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name: `Web ${crypto.randomUUID().slice(0, 8)}`, classId: targetClass, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const moduleId = await created(post(courseId, "modules", { title: "Modul awal", position: 1 }));
    const lessonId = await created(post(courseId, "lessons", { moduleId, title: "Lesson HTML", content: "Belajar <script>literal</script>", position: 1 }));
    const materialId = await created(post(courseId, "materials", { lessonId, title: "Panduan", kind: "link", content: "https://example.org/html" }));
    const activityId = await created(post(courseId, "activities", { lessonId, kind: "assignment", title: "Buat halaman", instructions: "Kirim deskripsi dan tautan karya.", dueAt: null }));
    if (visible) for (const suffix of ["", `modules/${moduleId}`, `lessons/${lessonId}`, `activities/${activityId}`]) expect((await publish(courseId, suffix)).status).toBe(200);
    return { courseId, moduleId, lessonId, materialId, activityId };
  }
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, { foundation: createFoundationHandler(db), learning: createLearningHandler(db, storage), dashboard: async () => ({}) });
    admin = (await request("/api/auth/login", "", { email: "admin@example.test", password })).headers.get("set-cookie")!.split(";")[0]!;
    ({ id: teacherId, cookie: teacher } = await user("teacher", "teacher"));
    ({ id: assistantId, cookie: assistant } = await user("assistant", "asmen"));
    ({ id: studentId, cookie: student } = await user("student", "student"));
    ({ id: peerId, cookie: peer } = await user("peer", "student"));
    ({ cookie: outsider } = await user("outsider", "student"));
    ({ cookie: otherTeacher } = await user("otherteacher", "teacher"));
    yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    classId = await academic("classes", { yearId, name: "X A" });
    await academic("enrollments", { classId, studentId });
    await academic("enrollments", { classId, studentId: peerId });
  });
  afterAll(async () => {
    if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
    await rm(storage, { recursive: true, force: true });
  });

  test("certification scopes students and staff, locks incomplete work, and rechecks revisions on generation", async () => {
    const { courseId, lessonId, activityId } = await fixture();
    await academic("teaching-assignments", { courseId, teacherId: assistantId });
    const detail = path(courseId, `certifications/${studentId}`);
    const generate = `${detail}/generate`;
    expect((await request(detail, outsider)).status).toBe(404);
    expect((await request(detail, otherTeacher)).status).toBe(404);
    expect((await request(path(courseId, `certifications/${peerId}`), student)).status).toBe(404);
    expect((await request(path(courseId, "certifications/no-id"), teacher)).status).toBe(400);
    const list = await (await request(path(courseId, "certifications"), student)).json() as Page<Progress>;
    expect(list.items.map(row => row.studentId)).toEqual([studentId]);
    expect((await request(generate, student, {})).status).toBe(409);
    expect((await post(courseId, `lessons/${lessonId}/complete`, {}, student)).status).toBe(200);
    expect((await (await request(detail, student)).json() as { percent: number }).percent).toBe(50);
    expect((await post(courseId, `activities/${activityId}/submit`, { content: "Completed" }, student)).status).toBe(200);
    for (const cookie of [student, admin, teacher, assistant]) {
      const result = await request(generate, cookie, {});
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ eligible: true, percent: 100, teachers: ["teacher"] });
    }
    const [{ count }] = await db`SELECT count(*)::int AS count FROM audit_logs WHERE event = 'learning.certification.generated' AND resource_id = ${studentId}`;
    expect(count).toBe(4);
    await db.unsafe("CREATE FUNCTION reject_certificate_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event = 'learning.certification.generated' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$");
    await db.unsafe("CREATE TRIGGER reject_certificate_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_certificate_audit()");
    try { expect((await request(generate, student, {})).status).toBe(500); }
    finally { await db.unsafe("DROP TRIGGER reject_certificate_audit ON audit_logs"); await db.unsafe("DROP FUNCTION reject_certificate_audit()"); }
    const [submission] = await db`SELECT id FROM submissions WHERE activity_id = ${activityId} AND student_id = ${studentId}`;
    expect((await post(courseId, `submissions/${submission.id}/return`, { reason: "Please revise" })).status).toBe(200);
    expect((await request(generate, assistant, {})).status).toBe(409);
    expect((await (await request(detail, student)).json() as { percent: number }).percent).toBe(50);
    expect((await publish(courseId, "", false)).status).toBe(200);
    expect((await request(generate, teacher, {})).status).toBe(409);
    expect((await request(generate, student, {})).status).toBe(404);
    expect((await request(detail, "")).status).toBe(401);
  });

  test("draft visibility cascades from course through module, lesson, materials and activities", async () => {
    const f = await fixture(false);
    const detail = () => request(path(f.courseId), student);
    expect((await detail()).status).toBe(404);
    expect((await request(path(f.courseId), teacher)).status).toBe(200);
    const listed = await (await request("/api/learning/courses", student)).json() as Page<LearningCourse>;
    expect(listed.items.some(course => course.id === f.courseId)).toBe(false);
    expect((await post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student)).status).toBe(404);
    const studentActor = { id: studentId, displayName: "student", roles: ["student"], permissions: ["dashboard:view"] };
    const draftCount = (await academicSummary(db, studentActor, config.timezone)).courses;
    await publish(f.courseId, "");
    expect((await academicSummary(db, studentActor, config.timezone)).courses).toBe(draftCount + 1);
    expect(await (await detail()).json()).toMatchObject({ modules: [], lessons: [], materials: [], activities: [] });
    await publish(f.courseId, `modules/${f.moduleId}`);
    expect((await (await detail()).json() as CourseDetail).modules).toHaveLength(1);
    expect((await (await detail()).json() as CourseDetail).lessons).toHaveLength(0);
    await publish(f.courseId, `lessons/${f.lessonId}`);
    const lessonView = await (await detail()).json() as CourseDetail;
    expect(lessonView.lessons).toHaveLength(1);
    expect(lessonView.materials).toHaveLength(1);
    expect(lessonView.activities).toHaveLength(0);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Hidden" }, student)).status).toBe(404);
    await publish(f.courseId, `activities/${f.activityId}`);
    expect((await (await detail()).json() as CourseDetail).activities).toHaveLength(1);
    await publish(f.courseId, `modules/${f.moduleId}`, false);
    expect(await (await detail()).json()).toMatchObject({ modules: [], lessons: [], materials: [], activities: [] });
    expect((await request(path(f.courseId, `activities/${f.activityId}/submissions`), student)).status).toBe(404);
  });

  test("complete learning workflow, private submissions, grade corrections and visible progress", async () => {
    const f = await fixture();
    const completed = await Promise.all([post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student), post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student)]);
    expect(completed.map(response => response.status)).toEqual([200, 200]);
    expect((await db`SELECT * FROM lesson_completions WHERE lesson_id = ${f.lessonId}`).length).toBe(1);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'learning.lesson.completed' AND resource_id = ${f.lessonId}`).length).toBe(1);
    const submitted = await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Karya santri", studentId: peerId }, student);
    expect(submitted.status).toBe(200);
    const submissionId = (await submitted.json() as { id: string }).id;
    await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Karya teman" }, peer);
    const own = await (await request(path(f.courseId, `activities/${f.activityId}/submissions`), student)).json() as Page<Submission>;
    expect(own.items).toHaveLength(1);
    expect(own.items[0]?.studentId).toBe(studentId);
    expect(own.items[0]?.content).toBe("Karya santri");
    const all = await (await request(path(f.courseId, `activities/${f.activityId}/submissions`), teacher)).json() as Page<Submission>;
    expect(all.items).toHaveLength(2);
    expect((await request(path(f.courseId, `submissions/${submissionId}/grades`), peer)).status).toBe(404);
    const grade = await post(f.courseId, `submissions/${submissionId}/grade`, { score: 85.5, feedback: "Struktur sudah baik.", previousGradeId: null });
    expect(grade.status).toBe(200);
    const firstGradeId = (await grade.json() as { id: string }).id;
    expect((await post(f.courseId, `submissions/${submissionId}/grade`, { score: 90, feedback: "Koreksi nilai.", previousGradeId: firstGradeId })).status).toBe(200);
    const history = await (await request(path(f.courseId, `submissions/${submissionId}/grades`), student)).json() as Page<Grade>;
    expect(history.items.map(item => item.score)).toEqual([90, 85.5]);
    const detail = await (await request(path(f.courseId), student)).json() as CourseDetail;
    expect(detail.activities[0]?.submission?.grade?.score).toBe(90);
    expect(detail.progress).toMatchObject({ lessons: 1, completed: 1, activities: 1, submitted: 1, graded: 1 });
    expect(JSON.stringify(detail)).not.toContain("Karya teman");
    const progress = await (await request(path(f.courseId, "progress"), teacher)).json() as Page<Progress>;
    expect(progress.items).toHaveLength(2);
    expect((await (await request(path(f.courseId, "progress"), student)).json() as Page<Progress>).items).toHaveLength(1);
    await publish(f.courseId, `modules/${f.moduleId}`, false);
    expect((await (await request(path(f.courseId), student)).json() as CourseDetail).progress).toMatchObject({ lessons: 0, completed: 0, activities: 0, submitted: 0, graded: 0 });
    expect((await request(path(f.courseId, `submissions/${submissionId}/grades`), student)).status).toBe(404);
    await publish(f.courseId, `modules/${f.moduleId}`);
    expect((await (await request(path(f.courseId), student)).json() as CourseDetail).progress?.completed).toBe(1);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'activity.graded' AND resource_id = ${submissionId}`).length).toBe(2);
  });

  test("teachers return work, students resubmit with revision history, and deadline exceptions use the effective deadline", async () => {
    const f = await fixture();
    const submitted = await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Versi pertama" }, student);
    const submissionId = (await submitted.json() as { id: string }).id;
    expect((await post(f.courseId, `submissions/${submissionId}/return`, { reason: "Tambahkan sumber." })).status).toBe(200);
    expect((await post(f.courseId, `submissions/${submissionId}/return`, { reason: "Alasan berbeda." })).status).toBe(200);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Versi kedua" }, student)).status).toBe(200);
    const current = await (await request(path(f.courseId, `activities/${f.activityId}/submissions`), teacher)).json() as Page<Submission>;
    expect(current.items[0]).toMatchObject({ revision: 2, status: "submitted", content: "Versi kedua" });
    expect((await db`SELECT revision, reason FROM submission_returns WHERE submission_id = ${submissionId}`).length).toBe(1);
    expect((await db`SELECT event FROM audit_logs WHERE event IN ('activity.returned', 'activity.resubmitted') AND resource_id = ${submissionId}`).length).toBe(2);
    await db`UPDATE activities SET due_at = clock_timestamp() - interval '1 second' WHERE id = ${f.activityId}`;
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Tidak boleh" }, peer)).status).toBe(409);
    expect((await post(f.courseId, `activities/${f.activityId}/deadline-exception`, { studentId: peerId, dueAt: new Date(Date.now() + 3600000).toISOString(), reason: "Sakit." })).status).toBe(200);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Dengan dispensasi" }, peer)).status).toBe(200);
  });

  test("every course boundary, mutation capability, authentication and origin is enforced", async () => {
    const f = await fixture();
    expect((await request("/api/learning/courses", "")).status).toBe(401);
    for (const cookie of [outsider, otherTeacher]) {
      expect((await request(path(f.courseId), cookie)).status).toBe(404);
      expect((await request(path(f.courseId, "progress"), cookie)).status).toBe(404);
      expect((await request(path(f.courseId, `activities/${f.activityId}/submissions`), cookie)).status).toBe(404);
    }
    expect((await post(f.courseId, "modules", { title: "Wrong course", position: 1 }, otherTeacher)).status).toBe(404);
    expect((await post(f.courseId, "modules", { title: "Forbidden", position: 1 }, student)).status).toBe(403);
    expect((await post(f.courseId, "publish", { published: false }, student)).status).toBe(403);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Impersonate", studentId }, teacher)).status).toBe(403);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Outsider" }, outsider)).status).toBe(404);
    expect((await request(path(f.courseId, "publish"), teacher, { published: false }, "POST", "https://evil.example")).status).toBe(403);
    expect((await request(path(f.courseId, `lessons/${f.lessonId}`), teacher, {}, "PATCH", "")).status).toBe(403);
    expect((await request(path(f.courseId), admin)).status).toBe(200);
    await db`DELETE FROM role_permissions USING roles, permissions WHERE role_permissions.role_id = roles.id AND role_permissions.permission_id = permissions.id AND roles.key = 'teacher' AND permissions.key = 'learning.manage'`;
    try {
      expect((await post(f.courseId, "publish", { published: false })).status).toBe(403);
      expect((await request(path(f.courseId), teacher)).status).toBe(404);
    } finally { await db`INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'teacher' AND p.key = 'learning.manage'`; }
  });

  test("an Asisten Mentor receives the dashboard and assigned course read scope without authoring access", async () => {
    const f = await fixture();
    await academic("teaching-assignments", { courseId: f.courseId, teacherId: assistantId });
    expect((await request("/api/dashboard", assistant)).status).toBe(200);
    const courses = await (await request("/api/learning/courses", assistant)).json() as Page<LearningCourse>;
    expect(courses.items.find(course => course.id === f.courseId)).toMatchObject({ canManage: false, canAssist: true });
    expect((await request(path(f.courseId), assistant)).status).toBe(200);
    expect((await post(f.courseId, "modules", { title: "Tidak boleh", position: 2 }, assistant)).status).toBe(403);
  });

  test("cross-course parent references and resource IDs cannot escape the target course", async () => {
    const f = await fixture();
    const other = await fixture();
    expect((await post(f.courseId, "lessons", { moduleId: other.moduleId, title: "Wrong", content: "Bad", position: 1 })).status).toBe(404);
    expect((await post(f.courseId, "materials", { lessonId: other.lessonId, title: "Wrong", kind: "text", content: "Bad" })).status).toBe(404);
    expect((await post(f.courseId, "activities", { lessonId: other.lessonId, title: "Wrong", kind: "assignment", instructions: "Bad" })).status).toBe(404);
    expect((await publish(f.courseId, `modules/${other.moduleId}`)).status).toBe(404);
    expect((await post(f.courseId, `modules/${other.moduleId}/archive`, { archived: true })).status).toBe(404);
    expect((await post(f.courseId, `lessons/${other.lessonId}/complete`, {}, student)).status).toBe(404);
    expect((await post(f.courseId, `activities/${other.activityId}/submit`, { content: "Bad" }, student)).status).toBe(404);
    const submission = await (await post(other.courseId, `activities/${other.activityId}/submit`, { content: "Answer" }, student)).json() as { id: string };
    expect((await post(f.courseId, `submissions/${submission.id}/grade`, { score: 90, feedback: "Bad", previousGradeId: null })).status).toBe(404);
    expect((await post(other.courseId, `submissions/${submission.id}/grade`, { score: 90, feedback: "Bad", previousGradeId: null }, student)).status).toBe(403);
    expect((await request(path(f.courseId, `submissions/${submission.id}/grades`), teacher)).status).toBe(404);
    await expect((async () => { await db`INSERT INTO lessons (course_id, module_id, title, content, position) VALUES (${f.courseId}, ${other.moduleId}, 'Bad', 'Bad', 1)`; })()).rejects.toThrow();
  });

  test("simultaneous final submissions are idempotent and immutable, even after deadline", async () => {
    const f = await fixture();
    const body = { content: "Satu jawaban" };
    const responses = await Promise.all([post(f.courseId, `activities/${f.activityId}/submit`, body, student), post(f.courseId, `activities/${f.activityId}/submit`, body, student)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(await responses[0]!.json()).toEqual(await responses[1]!.json());
    expect((await db`SELECT * FROM submissions WHERE activity_id = ${f.activityId}`).length).toBe(1);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'activity.submitted' AND resource_id IN (SELECT id FROM submissions WHERE activity_id = ${f.activityId})`).length).toBe(1);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Changed" }, student)).status).toBe(409);
    expect((await request(path(f.courseId, `activities/${f.activityId}`), teacher, { kind: "assignment", title: "Changed", instructions: "Changed" }, "PATCH")).status).toBe(409);
    await db`UPDATE activities SET due_at = clock_timestamp() - interval '1 second' WHERE id = ${f.activityId}`;
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, body, student)).status).toBe(200);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, body, peer)).status).toBe(409);
  });

  test("submission rechecks visibility and server deadline after waiting for publishing lock", async () => {
    const f = await fixture();
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const mutation = db.begin(async tx => {
      await tx`SELECT id FROM courses WHERE id = ${f.courseId} FOR UPDATE`;
      await tx`UPDATE activities SET due_at = clock_timestamp() + interval '50 milliseconds' WHERE id = ${f.activityId}`;
      locked(); await gate;
      await tx`SELECT pg_sleep(0.08)`;
    });
    await held;
    const submission = post(f.courseId, `activities/${f.activityId}/submit`, { content: "Too late", submittedAt: "2000-01-01" }, student);
    release(); await mutation;
    expect((await submission).status).toBe(409);
    expect((await db`SELECT * FROM submissions WHERE activity_id = ${f.activityId}`).length).toBe(0);
    await publish(f.courseId, "", false);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Hidden" }, student)).status).toBe(404);
  });

  test("concurrent grading has one winner, stale corrections fail, retries do not duplicate grades", async () => {
    const f = await fixture();
    const submission = await (await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Answer" }, student)).json() as { id: string };
    const responses = await Promise.all([post(f.courseId, `submissions/${submission.id}/grade`, { score: 80, feedback: "A", previousGradeId: null }), post(f.courseId, `submissions/${submission.id}/grade`, { score: 90, feedback: "B", previousGradeId: null }, admin)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const latest = (await (await request(path(f.courseId, `submissions/${submission.id}/grades`), teacher)).json() as Page<Grade>).items[0]!;
    expect((await post(f.courseId, `submissions/${submission.id}/grade`, { score: latest.score, feedback: latest.feedback, previousGradeId: null })).status).toBe(200);
    expect((await db`SELECT * FROM submission_grades WHERE submission_id = ${submission.id}`).length).toBe(1);
    expect((await post(f.courseId, `submissions/${submission.id}/grade`, { score: 95, feedback: "Stale", previousGradeId: null })).status).toBe(409);
  });

  test("failed audit rolls back authoring, submission and grading writes", async () => {
    const f = await fixture();
    await db`ALTER TABLE audit_logs ADD CONSTRAINT reject_learning_qa CHECK (event NOT IN ('learning.modules.created', 'activity.submitted', 'activity.graded')) NOT VALID`;
    try {
      expect((await post(f.courseId, "modules", { title: "Rollback", position: 3 })).status).toBe(400);
      expect((await db`SELECT * FROM course_modules WHERE course_id = ${f.courseId} AND title = 'Rollback'`).length).toBe(0);
      expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Rollback" }, student)).status).toBe(400);
      expect((await db`SELECT * FROM submissions WHERE activity_id = ${f.activityId}`).length).toBe(0);
      const submission = (await db<{ id: string }[]>`INSERT INTO submissions (activity_id, student_id, content) VALUES (${f.activityId}, ${studentId}, 'Fixture') RETURNING id`)[0]!;
      expect((await post(f.courseId, `submissions/${submission.id}/grade`, { score: 70, feedback: "Rollback", previousGradeId: null })).status).toBe(400);
      expect((await db`SELECT * FROM submission_grades WHERE submission_id = ${submission.id}`).length).toBe(0);
    } finally { await db`ALTER TABLE audit_logs DROP CONSTRAINT reject_learning_qa`; }
  });

  test("authoring updates, validation and bounded search/pagination", async () => {
    const f = await fixture(false);
    for (const [resource, id, body] of [
      ["modules", f.moduleId, { title: "Updated", position: 2 }],
      ["lessons", f.lessonId, { title: "Updated lesson", content: "New text", position: 2 }],
      ["materials", f.materialId, { title: "Updated material", kind: "text", content: "New text" }],
      ["activities", f.activityId, { kind: "assignment", title: "Updated task", instructions: "New instructions", dueAt: "2099-01-01T00:00:00Z" }],
    ] as const) expect((await request(path(f.courseId, `${resource}/${id}`), teacher, body, "PATCH")).status).toBe(200);
    const detail = await (await request(path(f.courseId), teacher)).json() as CourseDetail;
    expect(detail.modules[0]?.title).toBe("Updated");
    expect(detail.lessons[0]?.moduleId).toBe(f.moduleId);
    expect(detail.materials[0]?.kind).toBe("text");
    expect(detail.activities[0]?.instructions).toBe("New instructions");
    expect((await post(f.courseId, "materials", { lessonId: f.lessonId, title: "Unsafe", kind: "link", content: "javascript:alert(1)" })).status).toBe(400);
    expect((await post(f.courseId, "modules", { title: "Invalid", position: -1 })).status).toBe(400);
    expect((await post(f.courseId, "publish", { published: "false" })).status).toBe(400);
    expect((await post(f.courseId, "activities", { lessonId: f.lessonId, title: "Exam", kind: "exam", instructions: "Not Phase 2" })).status).toBe(400);
    expect((await request("/api/learning/courses?offset=-1", teacher)).status).toBe(400);
    expect((await request("/api/learning/courses/not-uuid", teacher)).status).toBe(400);
    expect((await request(path(f.courseId, "modules/extra/extra/extra"), teacher)).status).toBe(404);
    const empty = await (await request("/api/learning/courses?q=%25", teacher)).json() as Page<LearningCourse>;
    expect(empty.items).toEqual([]);
    await db`INSERT INTO subjects (code, name) SELECT 'PAGE-' || n, 'Page subject ' || n FROM generate_series(1, 55) n`;
    await db`INSERT INTO courses (name, academic_year_id, term_id, class_id, subject_id)
      SELECT 'Pagination ' || s.code, c.academic_year_id, ${termId}, c.id, s.id FROM subjects s CROSS JOIN classes c WHERE s.code LIKE 'PAGE-%' AND c.id = ${classId}`;
    const first = await (await request("/api/learning/courses?q=Pagination", admin)).json() as Page<LearningCourse>;
    const second = await (await request("/api/learning/courses?q=Pagination&offset=50", admin)).json() as Page<LearningCourse>;
    expect(first.items).toHaveLength(50); expect(first.nextOffset).toBe(50);
    expect(second.items).toHaveLength(5); expect(second.nextOffset).toBeNull();
    expect(second.items.some(row => first.items.some(item => item.id === row.id))).toBe(false);
  });

  test("archiving hides content from students and progress, blocks new work, and restores cleanly", async () => {
    const f = await fixture();
    const archive = (suffix: string, archived = true, cookie = teacher) => post(f.courseId, `${suffix}/archive`, { archived }, cookie);
    const detail = async (cookie = student) => await (await request(path(f.courseId), cookie)).json() as CourseDetail;
    expect((await archive(`activities/${f.activityId}`)).status).toBe(200);
    expect((await archive(`activities/${f.activityId}`)).status).toBe(200);
    expect((await detail()).activities).toHaveLength(0);
    expect((await detail()).progress).toMatchObject({ activities: 0 });
    expect((await detail(teacher)).activities[0]).toMatchObject({ id: f.activityId, archived: true });
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Archived" }, student)).status).toBe(404);
    expect((await request(path(f.courseId, `activities/${f.activityId}`), teacher, { kind: "assignment", title: "Edit", instructions: "Edit" }, "PATCH")).status).toBe(404);
    expect((await archive(`materials/${f.materialId}`)).status).toBe(200);
    expect((await detail()).materials).toHaveLength(0);
    expect((await archive(`lessons/${f.lessonId}`)).status).toBe(200);
    expect((await detail()).lessons).toHaveLength(0);
    expect((await archive(`lessons/${f.lessonId}`, false)).status).toBe(200);
    expect((await archive(`modules/${f.moduleId}`)).status).toBe(200);
    expect(await detail()).toMatchObject({ modules: [], lessons: [], materials: [], activities: [] });
    expect((await detail()).progress).toMatchObject({ lessons: 0 });
    expect((await post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student)).status).toBe(404);
    expect((await post(f.courseId, "lessons", { moduleId: f.moduleId, title: "Under archive", content: "No", position: 2 })).status).toBe(404);
    expect((await post(f.courseId, "materials", { lessonId: f.lessonId, title: "Under archive", kind: "text", content: "No" })).status).toBe(404);
    expect((await request(path(f.courseId, `modules/${f.moduleId}`), teacher, { title: "Edit archived", position: 1 }, "PATCH")).status).toBe(404);
    expect((await archive(`modules/${f.moduleId}`, true, student)).status).toBe(403);
    expect((await post(f.courseId, `modules/${f.moduleId}/archive`, { archived: "no" })).status).toBe(400);
    for (const suffix of [`modules/${f.moduleId}`, `materials/${f.materialId}`, `activities/${f.activityId}`]) expect((await archive(suffix, false)).status).toBe(200);
    expect(await detail()).toMatchObject({ modules: [{ id: f.moduleId, archived: false }], lessons: [{ id: f.lessonId }], materials: [{ id: f.materialId }], activities: [{ id: f.activityId }] });
    expect((await post(f.courseId, `lessons/${f.lessonId}/complete`, {}, student)).status).toBe(200);
    const events = await db<{ event: string }[]>`SELECT event FROM audit_logs WHERE resource_id = ${f.moduleId} ORDER BY created_at, id`;
    expect(events.map(row => row.event)).toEqual(["learning.modules.created", "learning.modules.published", "learning.modules.archived", "learning.modules.restored"]);
  });

  test("lessons move only to active modules in the same course", async () => {
    const f = await fixture(false);
    const other = await fixture(false);
    const second = await created(post(f.courseId, "modules", { title: "Modul kedua", position: 2 }));
    const move = (moduleId: string) => request(path(f.courseId, `lessons/${f.lessonId}`), teacher, { moduleId, title: "Lesson HTML", content: "Belajar", position: 1 }, "PATCH");
    const lessonModule = async () => (await (await request(path(f.courseId), teacher)).json() as CourseDetail).lessons.find(lesson => lesson.id === f.lessonId)?.moduleId;
    expect((await move(second)).status).toBe(200);
    expect(await lessonModule()).toBe(second);
    expect((await move(other.moduleId)).status).toBe(404);
    expect((await post(f.courseId, `modules/${f.moduleId}/archive`, { archived: true })).status).toBe(200);
    expect((await move(f.moduleId)).status).toBe(404);
    expect(await lessonModule()).toBe(second);
  });

  test("file materials and submission attachments are validated, private and served as attachments", async () => {
    const f = await fixture();
    const other = await fixture();
    const totalFiles = async () => (await db<{ count: number }[]>`SELECT count(*)::int AS count FROM stored_files`)[0]!.count;
    const filesOnDisk = async () => (await readdir(join(storage, "learning-files"), { recursive: true })).filter(name => /[0-9a-f-]{36}$/.test(String(name))).length;
    const bytes = pdf("materi");
    const materialId = await created(send(path(f.courseId, "materials"), teacher, form({ lessonId: f.lessonId, title: "Modul PDF", kind: "file", content: "Baca bab 1." }, new File([bytes], "../Modul HTML.pdf"))));
    const material = (await (await request(path(f.courseId), student)).json() as CourseDetail).materials.find(item => item.id === materialId)!;
    expect(material).toMatchObject({ kind: "file", content: "Baca bab 1.", file: { name: "Modul HTML.pdf", mediaType: "application/pdf", sizeBytes: bytes.byteLength } });
    const firstFileId = material.file!.id;
    expect(await Bun.file(storedFilePath(storage, firstFileId)).bytes()).toEqual(bytes);
    const download = await request(path(f.courseId, `materials/${materialId}/file`), student);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(download.headers.get("content-disposition")).toStartWith("attachment;");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    expect((await request(path(f.courseId, `materials/${materialId}/file`), outsider)).status).toBe(404);
    expect((await request(path(other.courseId, `materials/${materialId}/file`), teacher)).status).toBe(404);
    await publish(f.courseId, `lessons/${f.lessonId}`, false);
    expect((await request(path(f.courseId, `materials/${materialId}/file`), student)).status).toBe(404);
    expect((await request(path(f.courseId, `materials/${materialId}/file`), teacher)).status).toBe(200);
    await publish(f.courseId, `lessons/${f.lessonId}`);

    const before = await totalFiles();
    for (const file of [new File(["<script>alert(1)</script>"], "materi.html"), new File(["<html></html>"], "palsu.pdf")]) {
      expect((await send(path(f.courseId, "materials"), teacher, form({ lessonId: f.lessonId, title: "Bad", kind: "file" }, file))).status).toBe(400);
    }
    expect((await send(path(f.courseId, "materials"), teacher, form({ lessonId: f.lessonId, title: "No file", kind: "file" }))).status).toBe(400);
    expect((await send(path(f.courseId, "materials"), student, form({ lessonId: f.lessonId, title: "Student", kind: "file" }, new File([pdf("x")], "x.pdf")))).status).toBe(403);
    expect((await send(path(f.courseId, "modules"), teacher, form({ title: "Multipart", position: "1" }))).status).toBe(415);
    expect((await request(path(f.courseId, `materials/${f.materialId}`), teacher, { title: "Needs file", kind: "file" }, "PATCH")).status).toBe(400);
    expect(await totalFiles()).toBe(before);

    expect((await send(path(f.courseId, `materials/${materialId}`), teacher, form({ title: "Modul PDF v2", kind: "file", content: "" }, new File([pdf("v2")], "Modul v2.pdf")), "PATCH")).status).toBe(200);
    const replaced = (await (await request(path(f.courseId), student)).json() as CourseDetail).materials.find(item => item.id === materialId)!;
    expect(replaced.file?.name).toBe("Modul v2.pdf");
    expect(await Bun.file(storedFilePath(storage, firstFileId)).exists()).toBe(true);
    await expect((async () => { await db`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content, file_id) VALUES (${other.courseId}, ${other.lessonId}, 'Bad', 'file', '', ${firstFileId})`; })()).rejects.toThrow();
    await expect((async () => { await db`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content) VALUES (${f.courseId}, ${f.lessonId}, 'Bad', 'file', '')`; })()).rejects.toThrow();

    const answer = () => form({ content: "" }, new File([pdf("jawaban")], "jawaban.pdf"));
    const submitted = await Promise.all([send(path(f.courseId, `activities/${f.activityId}/submit`), student, answer()), send(path(f.courseId, `activities/${f.activityId}/submit`), student, answer())]);
    expect(submitted.map(response => response.status)).toEqual([200, 200]);
    const submissionId = (await submitted[0]!.json() as { id: string }).id;
    expect((await submitted[1]!.json() as { id: string }).id).toBe(submissionId);
    expect((await db`SELECT * FROM stored_files WHERE course_id = ${f.courseId}`).length).toBe(3);
    expect((await send(path(f.courseId, `activities/${f.activityId}/submit`), student, form({ content: "" }, new File([pdf("lain")], "jawaban.pdf")))).status).toBe(409);
    expect((await send(path(f.courseId, `activities/${f.activityId}/submit`), peer, form({ content: " " }))).status).toBe(400);
    const own = await (await request(path(f.courseId, `activities/${f.activityId}/submissions`), student)).json() as Page<Submission>;
    expect(own.items[0]).toMatchObject({ content: "", file: { name: "jawaban.pdf", mediaType: "application/pdf" } });
    expect((await request(path(f.courseId, `submissions/${submissionId}/file`), student)).status).toBe(200);
    expect((await request(path(f.courseId, `submissions/${submissionId}/file`), peer)).status).toBe(404);
    expect((await request(path(f.courseId, `submissions/${submissionId}/file`), otherTeacher)).status).toBe(404);
    expect((await request(path(f.courseId, `submissions/${submissionId}/file`), teacher)).status).toBe(200);

    await db`ALTER TABLE audit_logs ADD CONSTRAINT reject_upload_qa CHECK (event <> 'activity.submitted') NOT VALID`;
    try {
      const count = await totalFiles();
      expect((await send(path(f.courseId, `activities/${f.activityId}/submit`), peer, form({ content: "" }, new File([pdf("peer")], "peer.pdf")))).status).toBe(400);
      expect(await totalFiles()).toBe(count);
    } finally { await db`ALTER TABLE audit_logs DROP CONSTRAINT reject_upload_qa`; }
    // Every committed row has bytes on disk and no failed request left an orphan file.
    expect(await filesOnDisk()).toBe(await totalFiles());
  });

  test("dashboard tasks list open assignments, the next lesson and pending grading for the actor", async () => {
    const f = await fixture();
    const dashStudent = await user("dashstudent", "student");
    await academic("enrollments", { classId, studentId: dashStudent.id });
    const dashTeacher = await user("dashteacher", "teacher");
    await academic("teaching-assignments", { courseId: f.courseId, teacherId: dashTeacher.id });
    const studentActor = { id: dashStudent.id, displayName: "dashstudent", roles: ["student"], permissions: ["learning.view", "learning.participate"] };
    const teacherActor = { id: dashTeacher.id, displayName: "dashteacher", roles: ["teacher"], permissions: ["learning.view", "learning.manage"] };
    const nextLesson = await created(post(f.courseId, "lessons", { moduleId: f.moduleId, title: "Lesson CSS", content: "Lanjutan", position: 2 }));
    await publish(f.courseId, `lessons/${nextLesson}`);
    const dueAt = new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, "Z");
    expect((await request(path(f.courseId, `activities/${f.activityId}`), teacher, { kind: "assignment", title: "Buat halaman", instructions: "Kirim", dueAt }, "PATCH")).status).toBe(200);
    expect((await post(f.courseId, `lessons/${f.lessonId}/complete`, {}, dashStudent.cookie)).status).toBe(200);
    const tasks = await learningTasks(db, studentActor);
    expect(tasks[0]).toMatchObject({ type: "assignment", id: f.activityId, courseId: f.courseId, lessonId: f.lessonId });
    expect(tasks.find(task => task.type === "lesson")).toMatchObject({ id: nextLesson, courseId: f.courseId });
    expect(await learningTasks(db, teacherActor)).toEqual([]);
    expect((await post(f.courseId, `activities/${f.activityId}/submit`, { content: "Selesai" }, dashStudent.cookie)).status).toBe(200);
    expect((await learningTasks(db, studentActor)).some(task => task.id === f.activityId)).toBe(false);
    expect(await learningTasks(db, teacherActor)).toEqual([expect.objectContaining({ type: "grading", id: f.activityId, courseId: f.courseId, pending: 1 })]);
    const submissionId = (await db<{ id: string }[]>`SELECT id FROM submissions WHERE activity_id = ${f.activityId}`)[0]!.id;
    expect((await post(f.courseId, `submissions/${submissionId}/grade`, { score: 90, feedback: "Baik", previousGradeId: null }, dashTeacher.cookie)).status).toBe(200);
    expect(await learningTasks(db, teacherActor)).toEqual([]);
    await post(f.courseId, `modules/${f.moduleId}/archive`, { archived: true });
    expect((await learningTasks(db, studentActor)).some(task => task.courseId === f.courseId)).toBe(false);
  });

  test("125 students submitting at once to one course each get exactly one submission", async () => {
    const loadClass = await academic("classes", { yearId, name: `Load ${crypto.randomUUID().slice(0, 8)}` });
    const f = await fixture(true, loadClass);
    const students = await db<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
      SELECT 'load-' || n || '-' || ${f.courseId} || '@example.test', 'Load ' || n, '$argon2id$load-fixture' FROM generate_series(1, 125) n RETURNING id`;
    await db`INSERT INTO class_members (class_id, academic_year_id, student_id) SELECT ${loadClass}, ${yearId}, id FROM users WHERE email LIKE ${`load-%-${f.courseId}@example.test`}`;
    const started = performance.now();
    const results = await Promise.all(students.map((row, index) => submitActivity(db, storage, { id: row.id, displayName: `Load ${index}`, roles: ["student"], permissions: ["learning.view", "learning.participate"] }, f.courseId, f.activityId, { content: `Jawaban ${index}` }, null, crypto.randomUUID())));
    const elapsed = performance.now() - started;
    expect(new Set(results.map(result => result.id)).size).toBe(125);
    expect((await db`SELECT * FROM submissions WHERE activity_id = ${f.activityId}`).length).toBe(125);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'activity.submitted' AND resource_id IN (SELECT id FROM submissions WHERE activity_id = ${f.activityId})`).length).toBe(125);
    // Submissions serialize on the course row; the capacity target must finish far inside a request timeout.
    expect(elapsed).toBeLessThan(10000);
  });
});
