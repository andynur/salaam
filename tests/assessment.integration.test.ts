import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import { saveAnswer, startAttempt, submitAttempt } from "../src/modules/assessments/attempts";
import type { AcademicResource } from "../src/shared/foundation";
import type { CourseDetail, Page } from "../src/shared/learning";
import type { AttemptDetail, AttemptRow, Question, ScoreAdjustment } from "../src/shared/assessment";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Phase 3 assessment engine (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let yearId: string;
  let termId: string;
  let classId: string;
  let teacher: string;
  let student: string;
  let peer: string;
  let outsider: string;
  let otherTeacher: string;
  const schema = `hsi_phase3_${crypto.randomUUID().replaceAll("-", "")}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin: config.baseUrl, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  const path = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
  const post = (courseId: string, suffix: string, body: unknown, cookie = teacher) => request(path(courseId, suffix), cookie, body);
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
  async function course(targetClass = classId) {
    const subjectId = await academic("subjects", { name: "Informatika", code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name: `Quiz ${crypto.randomUUID().slice(0, 8)}`, classId: targetClass, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const moduleId = (await json<{ id: string }>(post(courseId, "modules", { title: "Modul", position: 1 }), 201)).id;
    const lessonId = (await json<{ id: string }>(post(courseId, "lessons", { moduleId, title: "Lesson", content: "Isi", position: 1 }), 201)).id;
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`]) expect((await post(courseId, suffix, { published: true })).status).toBe(200);
    return { courseId, lessonId };
  }
  const questionBodies = [
    { type: "single_choice", prompt: "Tag untuk paragraf?", options: ["<div>", "<p>", "<span>"], correct: ["b"] },
    { type: "multiple_choice", prompt: "Elemen semantik?", options: ["<header>", "<b>", "<main>"], correct: ["a", "c"] },
    { type: "true_false", prompt: "CSS adalah bahasa pemrograman.", correct: ["b"], explanation: "CSS adalah bahasa gaya." },
  ];
  async function assessment(courseId: string, lessonId: string, settings: Record<string, unknown>, bodies = questionBodies, points = [2, 3, 1], publish = true) {
    const questionIds = [];
    for (const body of bodies) questionIds.push((await json<{ id: string }>(post(courseId, "questions", body), 201)).id);
    const id = (await json<{ id: string }>(post(courseId, "assessments", { lessonId, kind: "quiz", title: "Quiz HTML", instructions: "Kerjakan.", ...settings }), 201)).id;
    await json(post(courseId, `assessments/${id}/items`, { items: questionIds.map((questionId, index) => ({ questionId, points: points[index] ?? 1 })) }));
    if (publish) await json(post(courseId, `activities/${id}/publish`, { published: true }));
    return { id, questionIds };
  }
  const start = (courseId: string, id: string, cookie = student) => request(path(courseId, `assessments/${id}/attempts`), cookie, {});
  const answer = (courseId: string, attemptId: string, questionId: string, selected: string[], revision: number, cookie = student) =>
    post(courseId, `attempts/${attemptId}/answers`, { questionId, selected, revision }, cookie);
  const detail = (courseId: string, attemptId: string, cookie = student) => json<AttemptDetail>(request(path(courseId, `attempts/${attemptId}`), cookie));

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    const setup = new SQL(url, { max: 1 });
    try { await setup.unsafe(`CREATE SCHEMA ${schema}`); } finally { await setup.close(); }
    db = new SQL(url, { max: 4, connection: { search_path: schema } });
    await migrate(db);
    adminId = (await bootstrapAdmin(db, { email: "admin@example.test", name: "Admin", identifier: "ADMIN", password })).id;
    handle = createHttpHandler(config, createAuthService(db, config), async () => {}, { foundation: createFoundationHandler(db), learning: createLearningHandler(db, ".test-artifacts/unused"), dashboard: async () => ({}) });
    ({ id: teacherId, cookie: teacher } = await user("teacher", "teacher"));
    const studentUser = await user("student", "student");
    student = studentUser.cookie;
    const peerUser = await user("peer", "student");
    peer = peerUser.cookie;
    ({ cookie: outsider } = await user("outsider", "student"));
    ({ cookie: otherTeacher } = await user("otherteacher", "teacher"));
    yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    classId = await academic("classes", { yearId, name: "X A" });
    await academic("enrollments", { classId, studentId: studentUser.id });
    await academic("enrollments", { classId, studentId: peerUser.id });
  });
  afterAll(async () => { if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); } });

  test("question bank is manager-only, validated, archivable and locked once attempted", async () => {
    const f = await course();
    const q = await assessment(f.courseId, f.lessonId, { maxAttempts: 1 });
    const bank = await json<Page<Question>>(request(path(f.courseId, "questions"), teacher));
    expect(bank.items.find(item => item.id === q.questionIds[1])).toMatchObject({ type: "multiple_choice", correct: ["a", "c"], usage: 1 });
    expect((await request(path(f.courseId, "questions"), student)).status).toBe(403);
    expect((await request(path(f.courseId, "questions"), otherTeacher)).status).toBe(404);
    expect((await post(f.courseId, "questions", { type: "single_choice", prompt: "Q", options: ["A"], correct: ["a"] })).status).toBe(400);
    expect((await post(f.courseId, "questions", questionBodies[0], student)).status).toBe(403);
    const spare = (await json<{ id: string }>(post(f.courseId, "questions", questionBodies[2]), 201)).id;
    await json(post(f.courseId, `questions/${spare}/archive`, { archived: true }));
    expect((await json<Page<Question>>(request(path(f.courseId, "questions"), teacher))).items.some(item => item.id === spare)).toBe(false);
    expect((await json<Page<Question>>(request(`${path(f.courseId, "questions")}?archived=1`, teacher))).items.find(item => item.id === spare)?.archived).toBe(true);
    const draft = (await json<{ id: string }>(post(f.courseId, "assessments", { lessonId: f.lessonId, kind: "quiz", title: "Draft", instructions: "x" }), 201)).id;
    expect((await post(f.courseId, `assessments/${draft}/items`, { items: [{ questionId: spare, points: 1 }] })).status).toBe(404);
    expect((await request(path(f.courseId, `questions/${q.questionIds[0]}`), teacher, questionBodies[0], "PATCH")).status).toBe(200);
    await json(start(f.courseId, q.id), 201);
    expect((await request(path(f.courseId, `questions/${q.questionIds[0]}`), teacher, questionBodies[0], "PATCH")).status).toBe(409);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'assessment.question.created'`).length).toBeGreaterThanOrEqual(4);
  });

  test("quiz attempts snapshot questions, autosave forward-only, submit idempotently and score automatically", async () => {
    const f = await course();
    const draft = (await json<{ id: string }>(post(f.courseId, "assessments", { lessonId: f.lessonId, kind: "quiz", title: "Empty", instructions: "x" }), 201)).id;
    expect((await post(f.courseId, `activities/${draft}/publish`, { published: true })).status).toBe(409);
    const q = await assessment(f.courseId, f.lessonId, { maxAttempts: 2 });
    const view = await json<CourseDetail>(request(path(f.courseId), student));
    expect(view.assessments.find(item => item.id === q.id)).toMatchObject({ questionCount: 3, maxScore: 6, items: null, attempts: [] });
    expect(view.assessments.some(item => item.id === draft)).toBe(false);
    const first = await json<{ id: string; resumed: boolean }>(start(f.courseId, q.id), 201);
    expect(await json<unknown>(start(f.courseId, q.id))).toEqual({ id: first.id, resumed: true });
    const open = await detail(f.courseId, first.id);
    expect(open.questions).toHaveLength(3);
    expect(open.questions.every(question => question.correct === null && question.explanation === null && question.selected.length === 0)).toBe(true);
    expect(open.score).toBeNull();
    const [single, multiple, trueFalse] = q.questionIds as [string, string, string];
    expect(await json<unknown>(answer(f.courseId, first.id, single, ["b"], 2))).toEqual({ questionId: single, revision: 2, selected: ["b"] });
    expect(await json<unknown>(answer(f.courseId, first.id, single, ["a"], 1))).toEqual({ questionId: single, revision: 2, selected: ["b"] });
    await json(answer(f.courseId, first.id, multiple, ["c", "a"], 1));
    await json(answer(f.courseId, first.id, trueFalse, ["a"], 1));
    expect((await answer(f.courseId, first.id, single, ["a", "b"], 3)).status).toBe(400);
    expect((await answer(f.courseId, first.id, crypto.randomUUID(), ["a"], 1)).status).toBe(404);
    expect((await answer(f.courseId, first.id, single, ["b"], 5, peer)).status).toBe(404);
    expect((await request(path(f.courseId, `assessments/${q.id}`), teacher, { kind: "quiz", title: "Changed", instructions: "x" }, "PATCH")).status).toBe(409);
    expect((await post(f.courseId, `assessments/${q.id}/items`, { items: [{ questionId: single, points: 1 }] })).status).toBe(409);
    const submitted = await Promise.all([post(f.courseId, `attempts/${first.id}/submit`, {}, student), post(f.courseId, `attempts/${first.id}/submit`, {}, student)]);
    expect(submitted.map(response => response.status)).toEqual([200, 200]);
    expect(await submitted[0]!.json()).toEqual(await submitted[1]!.json());
    expect((await db`SELECT * FROM audit_logs WHERE event = 'assessment.attempt.submitted' AND resource_id = ${first.id}`).length).toBe(1);
    expect((await answer(f.courseId, first.id, trueFalse, ["b"], 9)).status).toBe(409);
    const result = await detail(f.courseId, first.id);
    expect(result).toMatchObject({ score: 5, maxScore: 6, submissionReason: "student", resultsVisible: true });
    expect(Object.fromEntries(result.questions.map(question => [question.questionId, question.awarded]))).toEqual({ [single]: 2, [multiple]: 3, [trueFalse]: 0 });
    expect(result.questions.find(question => question.questionId === trueFalse)).toMatchObject({ correct: ["b"], explanation: "CSS adalah bahasa gaya." });
    expect((await request(path(f.courseId, `attempts/${first.id}`), peer)).status).toBe(404);
    expect((await request(path(f.courseId, `attempts/${first.id}`), teacher)).status).toBe(200);
    const second = await json<{ id: string }>(start(f.courseId, q.id), 201);
    await json(post(f.courseId, `attempts/${second.id}/submit`, {}, student));
    expect((await start(f.courseId, q.id)).status).toBe(409);
    const after = await json<CourseDetail>(request(path(f.courseId), student));
    expect(after.assessments.find(item => item.id === q.id)?.attempts.map(attempt => attempt.score)).toEqual([5, 0]);
    expect(after.progress).toMatchObject({ activities: 1, submitted: 1, graded: 1 });
  });

  test("exam windows and deadlines use server time; expired attempts finalize with saved answers", async () => {
    const f = await course();
    expect((await post(f.courseId, "assessments", { lessonId: f.lessonId, kind: "exam", title: "UTS", instructions: "x", closesAt: iso(3600000) })).status).toBe(400);
    const bodies = [{ type: "true_false", prompt: "HTML adalah bahasa markup.", correct: ["a"] }];
    const questionId = (await json<{ id: string }>(post(f.courseId, "questions", bodies[0]), 201)).id;
    const exam = (await json<{ id: string }>(post(f.courseId, "assessments", { lessonId: f.lessonId, kind: "exam", title: "UTS", instructions: "x", opensAt: iso(600000), closesAt: iso(3600000), timeLimitMinutes: 30, resultsVisibility: "after_close" }), 201)).id;
    await json(post(f.courseId, `assessments/${exam}/items`, { items: [{ questionId, points: 5 }] }));
    await json(post(f.courseId, `activities/${exam}/publish`, { published: true }));
    expect((await start(f.courseId, exam)).status).toBe(409);
    await json(request(path(f.courseId, `assessments/${exam}`), teacher, { kind: "exam", title: "UTS", instructions: "x", closesAt: iso(3600000), timeLimitMinutes: 30, resultsVisibility: "after_close" }, "PATCH"));
    const attempt = await json<{ id: string }>(start(f.courseId, exam), 201);
    const running = await detail(f.courseId, attempt.id);
    const window = new Date(running.deadlineAt!).getTime() - new Date(running.startedAt).getTime();
    expect(window).toBeGreaterThan(29 * 60000);
    expect(window).toBeLessThanOrEqual(30 * 60000);
    await json(answer(f.courseId, attempt.id, questionId, ["a"], 1));
    await db`UPDATE attempts SET started_at = clock_timestamp() - interval '31 minutes', deadline_at = clock_timestamp() - interval '1 second' WHERE id = ${attempt.id}`;
    expect((await answer(f.courseId, attempt.id, questionId, ["b"], 2)).status).toBe(409);
    const expired = await detail(f.courseId, attempt.id);
    expect(expired).toMatchObject({ submissionReason: "expired", score: null, resultsVisible: false, scoreVisible: false });
    expect(expired.questions[0]).toMatchObject({ selected: ["a"], correct: null });
    expect((await db`SELECT actor_id FROM audit_logs WHERE event = 'assessment.attempt.expired' AND resource_id = ${attempt.id}`)[0]).toEqual({ actor_id: null });
    expect(await detail(f.courseId, attempt.id, teacher)).toMatchObject({ score: 5, resultsVisible: true });
    expect((await start(f.courseId, exam)).status).toBe(409);
    await db`UPDATE assessment_settings SET closes_at = clock_timestamp() - interval '1 second' WHERE activity_id = ${exam}`;
    expect(await detail(f.courseId, attempt.id)).toMatchObject({ score: 5, resultsVisible: true });
    expect((await start(f.courseId, exam, peer)).status).toBe(409);
  });

  test("concurrent starts and out-of-order autosaves never duplicate attempts or regress answers", async () => {
    const f = await course();
    const q = await assessment(f.courseId, f.lessonId, { maxAttempts: 3, shuffleQuestions: false }, [questionBodies[0]!], [1]);
    const starts = await Promise.all(Array.from({ length: 5 }, () => start(f.courseId, q.id)));
    const ids = await Promise.all(starts.map(async response => (await response.json() as { id: string }).id));
    expect(new Set(ids).size).toBe(1);
    expect((await db`SELECT * FROM attempts WHERE activity_id = ${q.id}`).length).toBe(1);
    const revisions = Array.from({ length: 20 }, (_, index) => index + 1).sort(() => Math.random() - 0.5);
    const saves = await Promise.all(revisions.map(revision => answer(f.courseId, ids[0]!, q.questionIds[0]!, [revision % 2 ? "a" : "b"], revision)));
    expect(saves.every(response => response.status === 200)).toBe(true);
    expect(await detail(f.courseId, ids[0]!)).toMatchObject({ questions: [{ revision: 20, selected: ["b"] }] });
  });

  test("teacher score adjustments are bounded, append-only, conflict-checked and audited", async () => {
    const f = await course();
    const q = await assessment(f.courseId, f.lessonId, { maxAttempts: 2, resultsVisibility: "score_only" });
    const attempt = await json<{ id: string }>(start(f.courseId, q.id), 201);
    await json(post(f.courseId, `attempts/${attempt.id}/submit`, {}, student));
    const rows = await json<Page<AttemptRow>>(request(path(f.courseId, `assessments/${q.id}/attempts`), teacher));
    expect(rows.items).toEqual([expect.objectContaining({ id: attempt.id, studentName: "student", score: 0, maxScore: 6, adjusted: false })]);
    expect((await request(path(f.courseId, `assessments/${q.id}/attempts`), student)).status).toBe(403);
    expect((await request(path(f.courseId, `assessments/${q.id}/attempts`), otherTeacher)).status).toBe(404);
    const adjust = (score: number, reason: string, previousAdjustmentId: string | null, cookie = teacher) => post(f.courseId, `attempts/${attempt.id}/adjust`, { score, reason, previousAdjustmentId }, cookie);
    expect((await adjust(7, "Terlalu besar", null)).status).toBe(400);
    expect((await adjust(4, "Santri", null, student)).status).toBe(403);
    const first = await json<{ id: string }>(adjust(4, "Kunci soal 2 diperbaiki", null));
    expect(await json<unknown>(adjust(4, "Kunci soal 2 diperbaiki", null))).toEqual(first);
    expect((await adjust(5, "Stale", null)).status).toBe(409);
    await json(adjust(4.5, "Koreksi kedua", first.id));
    expect((await json<Page<ScoreAdjustment>>(request(path(f.courseId, `attempts/${attempt.id}/adjustments`), teacher))).items.map(item => item.score)).toEqual([4.5, 4]);
    const own = await detail(f.courseId, attempt.id);
    expect(own).toMatchObject({ score: 4.5, adjusted: true, scoreVisible: true, resultsVisible: false });
    expect(own.questions.every(question => question.correct === null)).toBe(true);
    const openAttempt = await json<{ id: string }>(start(f.courseId, q.id), 201);
    expect((await post(f.courseId, `attempts/${openAttempt.id}/adjust`, { score: 1, reason: "x", previousAdjustmentId: null })).status).toBe(409);
    expect((await db`SELECT * FROM audit_logs WHERE event = 'assessment.attempt.adjusted' AND resource_id = ${attempt.id}`).length).toBe(2);
  });

  test("course boundaries hold for question IDs, attempts and hidden results", async () => {
    const f = await course();
    const other = await course();
    const foreign = (await json<{ id: string }>(post(other.courseId, "questions", questionBodies[0]), 201)).id;
    const draft = (await json<{ id: string }>(post(f.courseId, "assessments", { lessonId: f.lessonId, kind: "quiz", title: "Draft", instructions: "x" }), 201)).id;
    expect((await post(f.courseId, `assessments/${draft}/items`, { items: [{ questionId: foreign, points: 1 }] })).status).toBe(404);
    const q = await assessment(f.courseId, f.lessonId, { resultsVisibility: "hidden" });
    expect((await start(f.courseId, q.id, outsider)).status).toBe(404);
    expect((await start(other.courseId, q.id)).status).toBe(404);
    const attempt = await json<{ id: string }>(start(f.courseId, q.id), 201);
    expect((await request(path(other.courseId, `attempts/${attempt.id}`), student)).status).toBe(404);
    await json(post(f.courseId, `attempts/${attempt.id}/submit`, {}, student));
    expect(await detail(f.courseId, attempt.id)).toMatchObject({ score: null, scoreVisible: false, resultsVisible: false });
    expect((await json<CourseDetail>(request(path(f.courseId), student))).assessments[0]?.attempts[0]?.score).toBeNull();
    await json(post(f.courseId, `activities/${q.id}/archive`, { archived: true }));
    expect((await request(path(f.courseId, `attempts/${attempt.id}`), student)).status).toBe(404);
    expect((await json<CourseDetail>(request(path(f.courseId), student))).assessments).toEqual([]);
  });

  test("125 students start, answer and submit one exam concurrently", async () => {
    const loadClass = await academic("classes", { yearId, name: `Load ${crypto.randomUUID().slice(0, 8)}` });
    const f = await course(loadClass);
    const q = await assessment(f.courseId, f.lessonId, { maxAttempts: 1 }, [questionBodies[0]!], [1]);
    const students = await db<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
      SELECT 'exam-' || n || '-' || ${f.courseId} || '@example.test', 'Exam ' || n, '$argon2id$load-fixture' FROM generate_series(1, 125) n RETURNING id`;
    await db`INSERT INTO class_members (class_id, academic_year_id, student_id) SELECT ${loadClass}, ${yearId}, id FROM users WHERE email LIKE ${`exam-%-${f.courseId}@example.test`}`;
    const started = performance.now();
    await Promise.all(students.map(async (row, index) => {
      const actor = { id: row.id, displayName: `Exam ${index}`, roles: ["student"], permissions: ["learning.view", "learning.participate"] };
      const attempt = await startAttempt(db, actor, f.courseId, q.id, crypto.randomUUID());
      await saveAnswer(db, actor, f.courseId, attempt.id, { questionId: q.questionIds[0], selected: [index % 2 ? "a" : "b"], revision: 1 });
      await submitAttempt(db, actor, f.courseId, attempt.id, crypto.randomUUID());
    }));
    const elapsed = performance.now() - started;
    const [summary] = await db<{ attempts: number; submitted: number; correct: number }[]>`SELECT count(*)::int AS attempts, count(submitted_at)::int AS submitted,
      count(*) FILTER (WHERE score = 1)::int AS correct FROM attempts WHERE activity_id = ${q.id}`;
    expect(summary).toEqual({ attempts: 125, submitted: 125, correct: 63 });
    expect(elapsed).toBeLessThan(15000);
  });
});
