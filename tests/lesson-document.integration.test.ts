import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { rm } from "node:fs/promises";
import { migrate } from "../src/core/database/migrations";
import { loadConfig } from "../src/core/config";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { createFoundationHandler } from "../src/core/foundation-http";
import { createLearningHandler } from "../src/core/learning-http";
import { createShareHandler } from "../src/core/share-http";
import { bootstrapAdmin, createUser } from "../src/modules/users/service";
import { createAcademic } from "../src/modules/academic/service";
import type { AcademicResource } from "../src/shared/foundation";
import type { CourseDetail, LessonDocument } from "../src/shared/learning";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Lesson documents (isolated PostgreSQL schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let adminId: string;
  let teacherId: string;
  let yearId: string;
  let classId: string;
  let termId: string;
  let teacher: string;
  let student: string;
  let otherTeacher: string;
  const schema = `hsi_documents_${crypto.randomUUID().replaceAll("-", "")}`;
  const storage = `.test-artifacts/${schema}`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST", origin = config.baseUrl) {
    return handle(new Request(`${config.baseUrl}${path}`, { method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), crypto.randomUUID());
  }
  function send(path: string, cookie: string, form: FormData) {
    return handle(new Request(`${config.baseUrl}${path}`, { method: "POST", headers: { cookie, origin: config.baseUrl }, body: form }), crypto.randomUUID());
  }
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])], "sampul.png");
  const path = (courseId: string, suffix = "") => `/api/learning/courses/${courseId}${suffix ? `/${suffix}` : ""}`;
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
  async function fixture() {
    const subjectId = await academic("subjects", { name: "Informatika", code: crypto.randomUUID().slice(0, 16) });
    const courseId = await academic("courses", { name: `Dokumen ${crypto.randomUUID().slice(0, 8)}`, classId, termId, subjectId });
    await academic("teaching-assignments", { courseId, teacherId });
    const moduleId = await created(request(path(courseId, "modules"), teacher, { title: "Modul", position: 1 }));
    const lessonId = await created(request(path(courseId, "lessons"), teacher, { moduleId, title: "Bab 1", content: "Isi awal", position: 1 }));
    for (const suffix of ["publish", `modules/${moduleId}/publish`, `lessons/${lessonId}/publish`]) {
      expect((await request(path(courseId, suffix), teacher, { published: true })).status).toBe(200);
    }
    return { courseId, moduleId, lessonId };
  }
  const save = (courseId: string, lessonId: string, body: unknown, cookie = teacher) => request(path(courseId, `lessons/${lessonId}/document`), cookie, body);
  async function lessonOf(courseId: string, lessonId: string, cookie = teacher) {
    const detail = await (await request(path(courseId), cookie)).json() as CourseDetail;
    return detail.lessons.find(lesson => lesson.id === lessonId)!;
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
      share: createShareHandler(db, storage, config.timezone), dashboard: async () => ({}),
    });
    ({ id: teacherId, cookie: teacher } = await user("teacher", "teacher"));
    const learner = await user("student", "student");
    student = learner.cookie;
    ({ cookie: otherTeacher } = await user("otherteacher", "teacher"));
    yearId = await academic("years", { name: "2026/2027", startsOn: "2026-07-01", endsOn: "2027-06-30" });
    termId = await academic("terms", { yearId, name: "Ganjil", startsOn: "2026-07-01", endsOn: "2026-12-31" });
    classId = await academic("classes", { yearId, name: "X A" });
    await academic("enrollments", { classId, studentId: learner.id });
  });
  afterAll(async () => {
    if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
    await rm(storage, { recursive: true, force: true });
  });

  test("autosave stores Markdown, bumps the version and refuses a stale or cross-origin write", async () => {
    const f = await fixture();
    const before = await lessonOf(f.courseId, f.lessonId);
    expect(before).toMatchObject({ version: 1, content: "Isi awal", cover: null, shareSlug: null });
    const first = await save(f.courseId, f.lessonId, { content: "# Bab 1\n\nIsi **baru**.", title: "Bab 1 revisi", version: before.version });
    expect(first.status).toBe(200);
    const saved = await first.json() as LessonDocument;
    expect(saved.version).toBe(2);
    const stored = await lessonOf(f.courseId, f.lessonId);
    expect(stored).toMatchObject({ title: "Bab 1 revisi", content: "# Bab 1\n\nIsi **baru**.", version: 2 });
    expect(new Date(stored.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(before.updatedAt).getTime());

    // A save that started from an older version never overwrites the newer document.
    const stale = await save(f.courseId, f.lessonId, { content: "Tulisan lama", version: before.version });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "STALE_DOCUMENT" } });
    expect((await lessonOf(f.courseId, f.lessonId)).content).toBe("# Bab 1\n\nIsi **baru**.");

    // Retrying the save that already landed returns the same document instead of failing.
    const retry = await save(f.courseId, f.lessonId, { content: "# Bab 1\n\nIsi **baru**.", title: "Bab 1 revisi", version: before.version });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ version: 2 });

    const crossOrigin = await request(path(f.courseId, `lessons/${f.lessonId}/document`), teacher, { content: "Dari luar", version: 2 }, "POST", "https://evil.test");
    expect(crossOrigin.status).toBe(403);
    for (const body of [{ content: "   ", version: 2 }, { content: "Isi", version: 0 }, { content: "Isi" }]) {
      expect((await save(f.courseId, f.lessonId, body)).status).toBe(400);
    }
  });

  test("only a manager of the course may edit the document, and the audit trail is coalesced", async () => {
    const f = await fixture();
    expect((await save(f.courseId, f.lessonId, { content: "Milik saya", version: 1 }, student)).status).toBe(403);
    expect((await save(f.courseId, f.lessonId, { content: "Milik saya", version: 1 }, otherTeacher)).status).toBe(404);
    expect((await save(f.courseId, crypto.randomUUID(), { content: "Hilang", version: 1 })).status).toBe(404);
    expect((await lessonOf(f.courseId, f.lessonId)).content).toBe("Isi awal");

    expect((await save(f.courseId, f.lessonId, { content: "Tulisan pertama", version: 1 })).status).toBe(200);
    expect((await save(f.courseId, f.lessonId, { content: "Tulisan kedua", version: 2 })).status).toBe(200);
    expect((await save(f.courseId, f.lessonId, { content: "Tulisan ketiga", version: 3 })).status).toBe(200);
    // Continuous typing saves often; the log keeps the first save and then one record per
    // editing stretch instead of one per keystroke batch.
    const audits = await db`SELECT id FROM audit_logs WHERE event = 'learning.lessons.document_saved' AND resource_id = ${f.lessonId}`;
    expect(audits.length).toBe(1);
    expect((await lessonOf(f.courseId, f.lessonId)).version).toBe(4);
  });

  test("a cover image is stored, served inline, replaced and removed", async () => {
    const f = await fixture();
    const cover = new FormData();
    cover.set("file", png());
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), student, cover)).status).toBe(403);
    const upload = new FormData();
    upload.set("file", png());
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher, upload)).status).toBe(200);
    const withCover = await lessonOf(f.courseId, f.lessonId);
    expect(withCover.cover).toMatchObject({ name: "sampul.png", mediaType: "image/png" });
    // A cover never changes the document body or its autosave version.
    expect(withCover.version).toBe(1);

    const served = await request(path(f.courseId, `lessons/${f.lessonId}/cover`), student);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("content-disposition")).toStartWith("inline;");

    const wrongType = new FormData();
    wrongType.set("file", new File([new TextEncoder().encode("%PDF-1.7\nx")], "berkas.pdf"));
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher, wrongType)).status).toBe(400);
    const empty = new FormData();
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher, empty)).status).toBe(400);

    const replacement = new FormData();
    replacement.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9])], "baru.png"));
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher, replacement)).status).toBe(200);
    expect((await lessonOf(f.courseId, f.lessonId)).cover).toMatchObject({ name: "baru.png" });

    const remove = new FormData();
    remove.set("remove", "1");
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher, remove)).status).toBe(200);
    expect((await lessonOf(f.courseId, f.lessonId)).cover).toBeNull();
    expect((await request(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher)).status).toBe(404);
    // Both uploaded files stay on record after the cover is replaced and removed.
    expect((await db`SELECT id FROM stored_files WHERE course_id = ${f.courseId}`).length).toBe(2);
  });

  test("a shared document is readable without a session and stops being readable when sharing ends", async () => {
    const f = await fixture();
    expect((await save(f.courseId, f.lessonId, { content: "## Bagian\n\nIsi <script>alert(1)</script> dan [tautan](https://example.org/a).", version: 1 })).status).toBe(200);
    const upload = new FormData();
    upload.set("file", png());
    expect((await send(path(f.courseId, `lessons/${f.lessonId}/cover`), teacher, upload)).status).toBe(200);

    expect((await request(path(f.courseId, `lessons/${f.lessonId}/share`), student, { shared: true })).status).toBe(403);
    expect((await request(path(f.courseId, `lessons/${f.lessonId}/share`), otherTeacher, { shared: true })).status).toBe(404);
    expect((await request(path(f.courseId, `lessons/${f.lessonId}/share`), teacher, { shared: "yes" })).status).toBe(400);

    const shared = await request(path(f.courseId, `lessons/${f.lessonId}/share`), teacher, { shared: true });
    expect(shared.status).toBe(200);
    const { shareSlug } = await shared.json() as { shareSlug: string };
    expect(shareSlug).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // Turning sharing on twice keeps the link that was already handed out.
    expect(await (await request(path(f.courseId, `lessons/${f.lessonId}/share`), teacher, { shared: true })).json()).toEqual({ shareSlug });
    // Students see the document, never the share link.
    expect((await lessonOf(f.courseId, f.lessonId, student)).shareSlug).toBeNull();
    expect((await lessonOf(f.courseId, f.lessonId)).shareSlug).toBe(shareSlug);

    const page = await handle(new Request(`${config.baseUrl}/share/lessons/${shareSlug}`), "1.2.3.4");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await page.text();
    expect(html).toContain("<h2>Bagian</h2>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(`/share/lessons/${shareSlug}/cover`);
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    const publicCover = await handle(new Request(`${config.baseUrl}/share/lessons/${shareSlug}/cover`), "1.2.3.4");
    expect(publicCover.status).toBe(200);
    expect(publicCover.headers.get("content-disposition")).toStartWith("inline;");

    // The public surface is read-only and reveals nothing about other documents.
    expect((await handle(new Request(`${config.baseUrl}/share/lessons/${shareSlug}`, { method: "POST" }), "1.2.3.4")).status).toBe(405);
    expect((await handle(new Request(`${config.baseUrl}/share/lessons/${shareSlug}/pengaturan`), "1.2.3.4")).status).toBe(404);
    expect((await handle(new Request(`${config.baseUrl}/share/lessons/${f.lessonId}`), "1.2.3.4")).status).toBe(404);
    expect((await handle(new Request(`${config.baseUrl}/share/courses/${shareSlug}`), "1.2.3.4")).status).toBe(404);

    expect((await request(path(f.courseId, `lessons/${f.lessonId}/share`), teacher, { shared: false })).status).toBe(200);
    expect((await handle(new Request(`${config.baseUrl}/share/lessons/${shareSlug}`), "1.2.3.4")).status).toBe(404);
    expect((await handle(new Request(`${config.baseUrl}/share/lessons/${shareSlug}/cover`), "1.2.3.4")).status).toBe(404);
    expect((await lessonOf(f.courseId, f.lessonId)).shareSlug).toBeNull();
    // Sharing again issues a new link rather than reviving the withdrawn one.
    const again = await (await request(path(f.courseId, `lessons/${f.lessonId}/share`), teacher, { shared: true })).json() as { shareSlug: string };
    expect(again.shareSlug).not.toBe(shareSlug);
    expect((await db`SELECT id FROM audit_logs WHERE event IN ('learning.lessons.shared', 'learning.lessons.unshared') AND resource_id = ${f.lessonId}`).length).toBe(3);
  });

  test("an archived lesson leaves the editor and the public page behind", async () => {
    const f = await fixture();
    const shared = await (await request(path(f.courseId, `lessons/${f.lessonId}/share`), teacher, { shared: true })).json() as { shareSlug: string };
    expect((await request(path(f.courseId, `lessons/${f.lessonId}/archive`), teacher, { archived: true })).status).toBe(200);
    expect((await save(f.courseId, f.lessonId, { content: "Masih bisa?", version: 1 })).status).toBe(404);
    expect((await handle(new Request(`${config.baseUrl}/share/lessons/${shared.shareSlug}`), "1.2.3.4")).status).toBe(404);
    expect((await request(path(f.courseId, `lessons/${f.lessonId}/archive`), teacher, { archived: false })).status).toBe(200);
    expect((await save(f.courseId, f.lessonId, { content: "Kembali", version: 1 })).status).toBe(200);
  });

  test("the lesson settings form keeps the document body and its version untouched", async () => {
    const f = await fixture();
    expect((await save(f.courseId, f.lessonId, { content: "# Dokumen\n\nIsi panjang.", version: 1 })).status).toBe(200);
    const edited = await request(path(f.courseId, `lessons/${f.lessonId}`), teacher, { title: "Bab 1 baru", position: 2 }, "PATCH");
    expect(edited.status).toBe(200);
    const lesson = await lessonOf(f.courseId, f.lessonId);
    // Metadata edits must not invalidate an editor that is open on the document.
    expect(lesson).toMatchObject({ title: "Bab 1 baru", position: 2, content: "# Dokumen\n\nIsi panjang.", version: 2 });
    expect((await save(f.courseId, f.lessonId, { content: "Lanjutan", version: 2 })).status).toBe(200);
  });
});
