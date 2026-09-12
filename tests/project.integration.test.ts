import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { createProjectHandler } from "../src/core/project-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import { learningTasks } from "../src/modules/learning/dashboard";
import { createTask, moveTask } from "../src/modules/projects/board";
import type { AcademicResource } from "../src/shared/foundation";
import type { CourseDetail, Page } from "../src/shared/learning";
import type { PortfolioEntry, ProjectDetail, ProjectRow, ShowcaseItem, TaskStatus } from "../src/shared/project";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 4 project learning (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let yearId: string;
  let termId: string;
  let classId: string;
  const people: Record<"teacher" | "student" | "peer" | "third" | "outsider" | "otherTeacher", { id: string; cookie: string }> = {} as never;
  const schema = `hsi_phase4_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  const studentPermissions = ["dashboard:view", "learning.view", "learning.participate"];
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin: config.baseUrl, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const course = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
  const project = (suffix = "") => `/api/projects${suffix ? `/${suffix}` : ""}`;
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
  async function workspace(targetClass = classId) {
    const subjectId = await academic("subjects", { name: "Proyek", code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name: `PjBL ${crypto.randomUUID().slice(0, 8)}`, classId: targetClass, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const t = people.teacher.cookie;
    const moduleId = (await json<{ id: string }>(request(course(courseId, "modules"), t, { title: "Modul", position: 1 }), 201)).id;
    const lessonId = (await json<{ id: string }>(request(course(courseId, "lessons"), t, { moduleId, title: "Lesson", content: "Isi", position: 1 }), 201)).id;
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`]) await json(request(course(courseId, suffix), t, { published: true }));
    return { courseId, lessonId };
  }
  async function challenge(courseId: string, lessonId: string, settings: Record<string, unknown> = { teamMode: "team", maxTeamSize: 3 }, publish = true) {
    const id = (await json<{ id: string }>(request(course(courseId, "challenges"), people.teacher.cookie, { lessonId, title: "Website sekolah", instructions: "Bangun situs.", ...settings }), 201)).id;
    if (publish) await json(request(course(courseId, `activities/${id}/publish`), people.teacher.cookie, { published: true }));
    return id;
  }
  const team = (courseId: string, challengeId: string, memberIds: string[], title = "Tim Elang") =>
    request(course(courseId, `challenges/${challengeId}/projects`), people.teacher.cookie, { title, memberIds });
  const detail = (id: string, cookie = people.student.cookie) => json<ProjectDetail>(request(project(id), cookie));
  const auditCount = async (event: string, resourceId: string) => (await db`SELECT 1 FROM audit_logs WHERE event = ${event} AND resource_id = ${resourceId}`).length;

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, {
      foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"), projects: createProjectHandler(db), dashboard: async () => ({}),
    });
    people.teacher = await user("teacher", "teacher");
    teacherId = people.teacher.id;
    people.otherTeacher = await user("otherteacher", "teacher");
    for (const name of ["student", "peer", "third", "outsider"] as const) people[name] = await user(name, "student");
    yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    classId = await academic("classes", { yearId, name: "X A" });
    const otherClass = await academic("classes", { yearId, name: "X B" });
    for (const name of ["student", "peer", "third"] as const) await academic("enrollments", { classId, studentId: people[name].id });
    await academic("enrollments", { classId: otherClass, studentId: people.outsider.id });
  });
  afterAll(async () => { if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); } });

  test("challenges are manager-authored, published like activities, and teams are formed from enrolled students", async () => {
    const f = await workspace();
    const { student, peer, third, outsider, teacher, otherTeacher } = people;
    const draft = await challenge(f.courseId, f.lessonId, { teamMode: "team", maxTeamSize: 2 }, false);
    expect((await json<CourseDetail>(request(course(f.courseId), student.cookie))).challenges).toEqual([]);
    expect((await request(course(f.courseId, "challenges"), student.cookie, { lessonId: f.lessonId, title: "x", instructions: "x", teamMode: "individual" })).status).toBe(403);
    expect((await request(course(f.courseId, "challenges"), otherTeacher.cookie, { lessonId: f.lessonId, title: "x", instructions: "x", teamMode: "individual" })).status).toBe(404);
    expect((await request(course(f.courseId, "challenges"), teacher.cookie, { lessonId: f.lessonId, title: "x", instructions: "x", teamMode: "team", maxTeamSize: 1 })).status).toBe(400);
    await json(request(course(f.courseId, `activities/${draft}/publish`), teacher.cookie, { published: true }));
    expect((await json<CourseDetail>(request(course(f.courseId), student.cookie))).challenges).toEqual([expect.objectContaining({ id: draft, kind: "challenge", projectCount: 0, project: null, settings: { teamMode: "team", maxTeamSize: 2 } })]);

    expect((await request(course(f.courseId, `challenges/${draft}/projects`), student.cookie, { title: "Sendiri" })).status).toBe(403);
    expect((await team(f.courseId, draft, [student.id, outsider.id])).status).toBe(400);
    expect((await team(f.courseId, draft, [student.id, peer.id, third.id])).status).toBe(400);
    const created = await json<{ id: string; resumed: boolean }>(team(f.courseId, draft, [student.id, peer.id]), 201);
    expect(created.resumed).toBe(false);
    expect((await team(f.courseId, draft, [third.id, peer.id], "Tim Rajawali")).status).toBe(409);
    expect((await request(course(f.courseId, `challenges/${draft}/projects`), otherTeacher.cookie, { title: "x", memberIds: [third.id] })).status).toBe(404);

    const base = { title: "Website sekolah", instructions: "Bangun situs.", teamMode: "team" };
    expect((await request(course(f.courseId, `challenges/${draft}`), teacher.cookie, { ...base, maxTeamSize: 3 }, "PATCH")).status).toBe(409);
    await json(request(course(f.courseId, `challenges/${draft}`), teacher.cookie, { ...base, title: "Website profil sekolah", maxTeamSize: 2 }, "PATCH"));
    const studentView = await json<CourseDetail>(request(course(f.courseId), student.cookie));
    expect(studentView.challenges[0]).toMatchObject({ title: "Website profil sekolah", project: { id: created.id, status: "in_progress" }, projectCount: 0 });
    expect((await json<CourseDetail>(request(course(f.courseId), third.cookie))).challenges[0]?.project).toBeNull();
    expect((await json<CourseDetail>(request(course(f.courseId), teacher.cookie))).challenges[0]).toMatchObject({ projectCount: 1, teamLocked: true, locked: false });

    await json(request(project(`${created.id}/members`), teacher.cookie, { memberIds: [student.id, third.id] }));
    expect((await detail(created.id, teacher.cookie)).members.map(member => member.id).sort()).toEqual([student.id, third.id].sort());
    expect((await request(project(created.id), peer.cookie)).status).toBe(404);
    expect((await request(project(`${created.id}/members`), student.cookie, { memberIds: [student.id] })).status).toBe(403);
    expect(await auditCount("project.created", created.id)).toBe(1);
    expect(await auditCount("project.members.updated", created.id)).toBe(1);
  });

  test("students start individual projects idempotently before the deadline", async () => {
    const f = await workspace();
    const { student, peer, outsider } = people;
    const id = await challenge(f.courseId, f.lessonId, { teamMode: "individual", dueAt: new Date(Date.now() + 3600000).toISOString() });
    const start = (cookie: string) => request(course(f.courseId, `challenges/${id}/projects`), cookie, { title: "Poster adab" });
    const starts = await Promise.all([start(student.cookie), start(student.cookie)]);
    expect(starts.map(response => response.status).sort()).toEqual([200, 201]);
    const ids = await Promise.all(starts.map(async response => (await response.json() as { id: string }).id));
    expect(new Set(ids).size).toBe(1);
    expect((await db`SELECT 1 FROM projects WHERE activity_id = ${id}`).length).toBe(1);
    expect((await start(outsider.cookie)).status).toBe(404);
    await db`UPDATE activities SET due_at = clock_timestamp() - interval '1 minute' WHERE id = ${id}`;
    expect((await start(peer.cookie)).status).toBe(409);
    expect(await json<{ id: string; resumed: boolean }>(start(student.cookie))).toEqual({ id: ids[0]!, resumed: true });
    expect((await team(f.courseId, id, [peer.id, people.third.id])).status).toBe(400);
    await json(team(f.courseId, id, [peer.id], "Poster peer"), 201);
  });

  test("kanban cards are edited by members and managers with version checks and contiguous positions", async () => {
    const f = await workspace();
    const { student, peer, third, teacher, otherTeacher } = people;
    const id = await challenge(f.courseId, f.lessonId);
    const projectId = (await json<{ id: string }>(team(f.courseId, id, [student.id, peer.id]), 201)).id;
    expect((await request(project(projectId), third.cookie)).status).toBe(404);
    expect((await request(project(`${projectId}/tasks`), third.cookie, { title: "Menyusup" })).status).toBe(404);
    expect((await request(project(projectId), otherTeacher.cookie)).status).toBe(404);
    expect(await detail(projectId, teacher.cookie)).toMatchObject({ canManage: true, isMember: false, canEdit: true });
    const card = (title: string, extra: Record<string, unknown> = {}, cookie = student.cookie) => json<{ id: string; version: number }>(request(project(`${projectId}/tasks`), cookie, { title, ...extra }), 201);
    const one = await card("Riset kebutuhan", { assigneeId: peer.id, dueAt: "2026-10-01T10:00:00Z", labels: [" UI ", "Backend"] });
    const two = await card("Desain halaman");
    const three = await card("Tulis konten", {}, teacher.cookie);
    expect((await request(project(`${projectId}/tasks`), student.cookie, { title: "x", assigneeId: third.id })).status).toBe(400);
    const move = (taskId: string, status: TaskStatus, position: number, version: number, cookie = student.cookie) => request(project(`${projectId}/tasks/${taskId}/move`), cookie, { status, position, version });
    expect(await json<unknown>(move(two.id, "in_progress", 0, 1))).toEqual({ id: two.id, version: 2, status: "in_progress", position: 0 });
    expect(await json<unknown>(move(two.id, "in_progress", 0, 1, peer.cookie))).toEqual({ id: two.id, version: 2, status: "in_progress", position: 0 });
    expect((await move(two.id, "done", 0, 1)).status).toBe(409);
    await json(move(three.id, "todo", 0, 1));
    const columns = (value: ProjectDetail) => Object.fromEntries((["todo", "in_progress", "review", "done"] as const).map(status => [status, value.tasks.filter(task => task.status === status).sort((a, b) => a.position - b.position).map(task => task.title)]));
    expect(columns(await detail(projectId))).toEqual({ todo: ["Tulis konten", "Riset kebutuhan"], in_progress: ["Desain halaman"], review: [], done: [] });
    const edit = (taskId: string, version: number, title: string) => request(project(`${projectId}/tasks/${taskId}`), peer.cookie, { title, assigneeId: student.id, dueAt: "2026-10-01T10:00:00Z", labels: ["UI", "Backend"], version }, "PATCH");
    expect((await edit(one.id, 5, "Riset pengguna")).status).toBe(409);
    expect(await json<unknown>(edit(one.id, 1, "Riset pengguna"))).toEqual({ id: one.id, version: 2 });
    expect((await detail(projectId)).tasks.find(task => task.id === one.id)).toMatchObject({ title: "Riset pengguna", assigneeName: "student", dueAt: "2026-10-01 17:00:00+07", labels: ["UI", "Backend"], version: 2 });
    await json(request(project(`${projectId}/tasks/${three.id}/archive`), student.cookie, { archived: true, version: 2 }));
    const afterArchive = await detail(projectId);
    expect(afterArchive.tasks.filter(task => task.status === "todo").map(task => [task.title, task.position])).toEqual([["Riset pengguna", 0]]);

    const many: { id: string; version: number }[] = [];
    for (let index = 0; index < 20; index++) many.push(await card(`Kartu ${index}`));
    const moves = await Promise.all(many.map((task, index) => move(task.id, "done", 0, task.version, index % 2 ? student.cookie : peer.cookie)));
    expect(moves.every(response => response.status === 200)).toBe(true);
    const done = (await db<{ position: number }[]>`SELECT position FROM project_tasks WHERE project_id = ${projectId} AND status = 'done' AND archived_at IS NULL ORDER BY position`).map(row => row.position);
    expect(done).toEqual(Array.from({ length: 20 }, (_, position) => position));
    const listed = await json<Page<ProjectRow>>(request(project(), student.cookie));
    expect(listed.items.find(item => item.id === projectId)).toMatchObject({ taskCount: 22, doneCount: 20, status: "in_progress", members: [{ id: peer.id, name: "peer" }, { id: student.id, name: "student" }] });
    expect((await json<Page<ProjectRow>>(request(project(), third.cookie))).items.some(item => item.id === projectId)).toBe(false);
    expect((await json<Page<ProjectRow>>(request(`${project()}?activityId=${id}`, teacher.cookie))).items.map(item => item.id)).toEqual([projectId]);
  });

  test("submission and review follow the status workflow, feed progress and dashboards, and are audited", async () => {
    const f = await workspace();
    const { student, peer, teacher, otherTeacher } = people;
    const id = await challenge(f.courseId, f.lessonId, { teamMode: "team", maxTeamSize: 2, dueAt: new Date(Date.now() + 3600000).toISOString() });
    const projectId = (await json<{ id: string }>(team(f.courseId, id, [student.id, peer.id]), 201)).id;
    const studentActor = { id: student.id, displayName: "student", roles: ["student"], permissions: studentPermissions };
    const teacherActor = { id: teacherId, displayName: "teacher", roles: ["teacher"], permissions: ["dashboard:view", "learning.view", "learning.manage"] };
    expect((await learningTasks(db, studentActor)).find(task => task.type === "challenge" && task.id === id)).toMatchObject({ projectId, courseId: f.courseId });

    const submit = (cookie = student.cookie) => request(project(`${projectId}/submit`), cookie, {});
    expect((await submit()).status).toBe(400);
    expect((await request(project(projectId), student.cookie, { title: "Tim Elang", summary: "Situs profil sekolah.", deliverableUrl: "ftp://x" }, "PATCH")).status).toBe(400);
    await json(request(project(projectId), peer.cookie, { title: "Tim Elang", summary: "Situs profil sekolah dengan 5 halaman.", deliverableUrl: "https://example.test/elang" }, "PATCH"));
    expect((await submit(teacher.cookie)).status).toBe(403);
    const submitted = await Promise.all([submit(student.cookie), submit(peer.cookie)]);
    expect(submitted.map(response => response.status)).toEqual([200, 200]);
    expect(await auditCount("project.submitted", projectId)).toBe(1);
    expect((await request(project(`${projectId}/tasks`), student.cookie, { title: "Terlambat" })).status).toBe(409);
    expect((await request(project(projectId), student.cookie, { title: "Ganti" }, "PATCH")).status).toBe(409);
    expect((await learningTasks(db, studentActor)).some(task => task.type === "challenge" && task.id === id)).toBe(false);
    expect((await learningTasks(db, teacherActor)).find(task => task.type === "review" && task.id === id)).toMatchObject({ pending: 1, courseId: f.courseId });
    expect((await json<CourseDetail>(request(course(f.courseId), student.cookie))).progress).toMatchObject({ activities: 1, submitted: 1, graded: 0 });

    const review = (body: Record<string, unknown>, cookie = teacher.cookie) => request(project(`${projectId}/reviews`), cookie, body);
    expect((await review({ decision: "approved", score: 90, feedback: "x" }, student.cookie)).status).toBe(403);
    expect((await review({ decision: "approved", score: 90, feedback: "x" }, otherTeacher.cookie)).status).toBe(404);
    expect((await review({ decision: "approved", feedback: "Tanpa nilai" })).status).toBe(400);
    const revision = { decision: "changes_requested", feedback: "Tambahkan halaman kontak." };
    const first = await json<{ id: string; status: string }>(review(revision));
    expect(first.status).toBe("changes_requested");
    expect(await json<unknown>(review(revision))).toEqual(first);
    expect((await review({ decision: "approved", score: 80, feedback: "Berubah pikiran" })).status).toBe(409);
    expect((await learningTasks(db, studentActor)).find(task => task.type === "challenge" && task.id === id)).toMatchObject({ projectId });

    await json(request(project(`${projectId}/tasks`), student.cookie, { title: "Halaman kontak" }), 201);
    await db`UPDATE activities SET due_at = clock_timestamp() - interval '1 minute' WHERE id = ${id}`;
    await json(submit());
    await json(review({ decision: "approved", score: 92.5, feedback: "Lengkap dan rapi." }));
    const approved = await detail(projectId);
    expect(approved).toMatchObject({ canEdit: false, project: { status: "approved" } });
    expect(approved.reviews.map(item => [item.decision, item.score])).toEqual([["approved", 92.5], ["changes_requested", null]]);
    expect((await submit()).status).toBe(409);
    expect((await json<CourseDetail>(request(course(f.courseId), student.cookie))).progress).toMatchObject({ activities: 1, submitted: 1, graded: 1 });
    const locked = { title: "Ubah", instructions: "x", teamMode: "team", maxTeamSize: 2 };
    expect((await request(course(f.courseId, `challenges/${id}`), teacher.cookie, locked, "PATCH")).status).toBe(409);
    expect(await auditCount("project.reviewed", projectId)).toBe(2);
    expect(await auditCount("project.submitted", projectId)).toBe(2);
    expect((await learningTasks(db, teacherActor)).some(task => task.type === "review" && task.id === id)).toBe(false);
  });

  test("showcase selection and portfolio entries require approval and respect visibility", async () => {
    const f = await workspace();
    const { student, peer, third, outsider, teacher } = people;
    const id = await challenge(f.courseId, f.lessonId);
    const projectId = (await json<{ id: string }>(team(f.courseId, id, [student.id, peer.id]), 201)).id;
    const other = (await json<{ id: string }>(team(f.courseId, id, [third.id], "Tim Solo"), 201)).id;
    await json(request(project(projectId), student.cookie, { title: "Tim Elang", summary: "Situs profil sekolah." }, "PATCH"));
    const showcase = (target: string, showcased: boolean, cookie = teacher.cookie) => request(project(`${target}/showcase`), cookie, { showcased });
    expect((await showcase(projectId, true)).status).toBe(409);
    expect((await request(project(`${projectId}/portfolio`), student.cookie, { reflection: "Belum" })).status).toBe(409);
    await json(request(project(`${projectId}/submit`), student.cookie, {}));
    await json(request(project(`${projectId}/reviews`), teacher.cookie, { decision: "approved", score: 88, feedback: "Bagus." }));

    expect((await showcase(projectId, true, student.cookie)).status).toBe(403);
    await json(showcase(projectId, true));
    await json(showcase(projectId, true));
    expect(await auditCount("project.showcased", projectId)).toBe(1);
    expect((await json<Page<ShowcaseItem>>(request(project("showcase"), student.cookie))).items).toEqual([expect.objectContaining({ id: projectId, canOpen: true, summary: "Situs profil sekolah." })]);
    const publicView = await json<Page<ShowcaseItem>>(request(project("showcase"), outsider.cookie));
    expect(publicView.items).toEqual([expect.objectContaining({ id: projectId, canOpen: false })]);
    expect(Object.keys(publicView.items[0]!)).not.toContain("score");
    expect((await request(project(projectId), outsider.cookie)).status).toBe(404);

    expect((await request(project(`${projectId}/portfolio`), third.cookie, { reflection: "Bukan anggota" })).status).toBe(404);
    expect((await request(project(`${other}/portfolio`), third.cookie, { reflection: "Belum disetujui" })).status).toBe(409);
    expect((await request(project(`${projectId}/portfolio`), teacher.cookie, { reflection: "Guru" })).status).toBe(403);
    await json(request(project(`${projectId}/portfolio`), student.cookie, { reflection: "Saya belajar merancang situs bersama tim." }));
    const entries = await json<Page<PortfolioEntry>>(request(project("portfolio"), student.cookie));
    expect(entries.items).toEqual([expect.objectContaining({ projectId, score: 88, reflection: "Saya belajar merancang situs bersama tim.", canOpen: true })]);
    expect((await json<Page<PortfolioEntry>>(request(project("portfolio"), peer.cookie))).items).toEqual([]);
    await json(request(project(`${projectId}/portfolio/archive`), student.cookie, { archived: true }));
    expect((await json<Page<PortfolioEntry>>(request(project("portfolio"), student.cookie))).items).toEqual([]);
    await json(request(project(`${projectId}/portfolio`), student.cookie, { reflection: "Refleksi diperbarui." }));
    expect((await detail(projectId)).portfolio).toMatchObject({ reflection: "Refleksi diperbarui.", archived: false });

    await json(request(course(f.courseId, `activities/${id}/archive`), teacher.cookie, { archived: true }));
    expect((await json<Page<ShowcaseItem>>(request(project("showcase"), outsider.cookie))).items).toEqual([]);
    expect((await request(project(projectId), student.cookie)).status).toBe(404);
    expect((await json<Page<PortfolioEntry>>(request(project("portfolio"), student.cookie))).items).toEqual([expect.objectContaining({ projectId, canOpen: false })]);
    expect((await detail(projectId, teacher.cookie)).project.showcasedAt).not.toBeNull();
    await json(showcase(projectId, false));
    expect(await auditCount("project.unshowcased", projectId)).toBe(1);
    expect((await db`SELECT 1 FROM audit_logs WHERE event IN ('portfolio.saved', 'portfolio.archived')`).length).toBe(3);
  });

  test("125 students on 25 teams add and move cards concurrently", async () => {
    const loadClass = await academic("classes", { yearId, name: `Load ${crypto.randomUUID().slice(0, 8)}` });
    const f = await workspace(loadClass);
    const id = await challenge(f.courseId, f.lessonId, { teamMode: "team", maxTeamSize: 5 });
    const students = await db<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
      SELECT 'team-' || n || '-' || ${f.courseId} || '@example.test', 'Team ' || n, '$argon2id$load-fixture' FROM generate_series(1, 125) n RETURNING id`;
    await db`INSERT INTO class_members (class_id, academic_year_id, student_id) SELECT ${loadClass}, ${yearId}, id FROM users WHERE email LIKE ${`team-%-${f.courseId}@example.test`}`;
    const teams: string[] = [];
    for (let index = 0; index < 25; index++) {
      teams.push((await json<{ id: string }>(team(f.courseId, id, students.slice(index * 5, index * 5 + 5).map(row => row.id), `Tim ${index + 1}`), 201)).id);
    }
    const started = performance.now();
    await Promise.all(students.map(async (row, index) => {
      const actor = { id: row.id, displayName: `Team ${index}`, roles: ["student"], permissions: studentPermissions };
      const projectId = teams[Math.floor(index / 5)]!;
      const task = await createTask(db, actor, projectId, { title: `Kartu ${index}`, assigneeId: row.id });
      await moveTask(db, actor, projectId, task.id, { status: "done", position: 0, version: task.version });
    }));
    const elapsed = performance.now() - started;
    const rows = await db<{ projectId: string; positions: string }[]>`SELECT project_id AS "projectId", array_agg(position ORDER BY position)::text AS positions
      FROM project_tasks WHERE project_id = ANY(string_to_array(${teams.join(",")}, ',')::uuid[]) AND status = 'done' GROUP BY project_id`;
    expect(rows).toHaveLength(25);
    expect(new Set(rows.map(row => row.positions))).toEqual(new Set(["{0,1,2,3,4}"]));
    expect(elapsed).toBeLessThan(15000);
  });
});
