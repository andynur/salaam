import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { invalid } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { recordStoredFile, uploadInput, withFileCleanup } from "../../core/storage/files";
import { coverTypes, type LessonDocument, type SharedLesson, type StoredFile } from "../../shared/learning";
import { courseAccess, notFound } from "./access";
import { documentInput, shareInput } from "./input";

// Editing is continuous, so a save every few seconds is normal. Auditing each one would
// bury the log: the first save of a document is recorded, and after that one record per
// five minutes of continuous work.
const auditInterval = "5 minutes";
const shareSlug = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");

type SavedRow = LessonDocument & { audit: boolean };
/**
 * Autosave for a lesson document. The caller sends the version it last saw: an older
 * version means somebody else saved in between and the request is refused, unless the
 * stored document already matches, which is how a retried request succeeds.
 */
export async function saveLessonDocument(db: SQL, actor: Actor, courseId: string, lessonId: string, body: Record<string, unknown>, requestId: string): Promise<LessonDocument> {
  requirePermission(actor, "learning.manage");
  const { title, content, version } = documentInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const rows = await tx<SavedRow[]>`WITH previous AS (
        SELECT id, version, title, content, updated_at FROM lessons
        WHERE id = ${lessonId} AND course_id = ${courseId} AND archived_at IS NULL)
      UPDATE lessons l SET title = COALESCE(${title}, l.title), content = ${content},
        version = l.version + 1, updated_at = clock_timestamp()
      FROM previous p WHERE l.id = p.id AND p.version = ${version}
      RETURNING l.id, l.version, l.updated_at AS "updatedAt",
        (p.version = 1 OR p.updated_at < clock_timestamp() - ${auditInterval}::interval) AS audit`;
    const saved = rows[0];
    if (!saved) {
      const current = await tx<(LessonDocument & { title: string; content: string })[]>`SELECT id, version, title, content, updated_at AS "updatedAt"
        FROM lessons WHERE id = ${lessonId} AND course_id = ${courseId} AND archived_at IS NULL`;
      const lesson = current[0];
      if (!lesson) notFound();
      // A retry of the save that already landed returns that same document.
      if (lesson.version === version + 1 && lesson.content === content && (title === null || lesson.title === title)) {
        return { id: lesson.id, version: lesson.version, updatedAt: lesson.updatedAt };
      }
      throw new HttpError(409, "STALE_DOCUMENT", "Dokumen sudah diubah dari tempat lain. Muat ulang halaman agar perubahan terbaru tidak hilang.");
    }
    if (saved.audit) await recordAudit(tx, actor.id, "learning.lessons.document_saved", "lessons", lessonId, requestId);
    return { id: saved.id, version: saved.version, updatedAt: saved.updatedAt };
  });
}

/** Sets or clears the cover image shown at the top of a lesson document. */
export async function setLessonCover(db: SQL, storageRoot: string, actor: Actor, courseId: string, lessonId: string, body: Record<string, unknown>, file: File | null, requestId: string) {
  requirePermission(actor, "learning.manage");
  const remove = body.remove === true || body.remove === "true" || body.remove === "1";
  if (remove && file) invalid("Pilih mengganti atau menghapus sampul, tidak keduanya.");
  if (!remove && !file) invalid("Pilih berkas gambar sampul.");
  const upload = file ? await uploadInput(file) : null;
  if (upload && !coverTypes.includes(upload.mediaType)) invalid("Sampul harus berupa gambar PNG, JPG, atau WebP.");
  return withFileCleanup(storageRoot, upload, store => db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    if (upload) await recordStoredFile(tx, courseId, actor.id, upload);
    // A replaced cover keeps its stored_files row and bytes, like a replaced material file.
    const rows = await tx<{ id: string }[]>`UPDATE lessons SET cover_file_id = ${upload?.id ?? null}, updated_at = clock_timestamp()
      WHERE id = ${lessonId} AND course_id = ${courseId} AND archived_at IS NULL RETURNING id`;
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `learning.lessons.cover_${remove ? "removed" : "set"}`, "lessons", lessonId, requestId);
    await store();
    return { id: rows[0]!.id, cover: upload ? { id: upload.id, name: upload.name, mediaType: upload.mediaType, sizeBytes: upload.sizeBytes } : null };
  }));
}

/**
 * Turns public sharing on or off. Sharing issues an opaque slug once and keeps it while
 * the share is on, so a link that was handed out stays valid until sharing is stopped.
 */
export async function setLessonShare(db: SQL, actor: Actor, courseId: string, lessonId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const shared = shareInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const rows = await tx<{ shareSlug: string | null }[]>`SELECT share_slug AS "shareSlug" FROM lessons
      WHERE id = ${lessonId} AND course_id = ${courseId} AND archived_at IS NULL`;
    const lesson = rows[0];
    if (!lesson) notFound();
    if (shared === (lesson.shareSlug !== null)) return { shareSlug: lesson.shareSlug };
    const slug = shared ? shareSlug() : null;
    await tx`UPDATE lessons SET share_slug = ${slug}, shared_at = ${slug ? new Date() : null}, shared_by = ${slug ? actor.id : null}
      WHERE id = ${lessonId} AND course_id = ${courseId}`;
    await recordAudit(tx, actor.id, `learning.lessons.${shared ? "shared" : "unshared"}`, "lessons", lessonId, requestId);
    return { shareSlug: slug };
  });
}

const shareMissing = (): never => { throw new HttpError(404, "NOT_FOUND", "Halaman publik tidak ditemukan atau sudah dihentikan."); };

/** Reads a shared document for the public page. No session and no course scope apply. */
export async function sharedLesson(db: SQL, slug: string): Promise<SharedLesson> {
  const rows = await db<SharedLesson[]>`SELECT l.title, l.content, l.updated_at AS "updatedAt", c.name AS "courseName",
      cl.name AS "className", t.name AS term, y.name AS year, l.cover_file_id IS NOT NULL AS cover
    FROM lessons l JOIN courses c ON c.id = l.course_id JOIN classes cl ON cl.id = c.class_id
    JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
    WHERE l.share_slug = ${slug} AND l.archived_at IS NULL`;
  return rows[0] ?? shareMissing();
}

export async function sharedLessonCover(db: SQL, slug: string): Promise<StoredFile> {
  const rows = await db<StoredFile[]>`SELECT f.id, f.original_name AS name, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes"
    FROM lessons l JOIN stored_files f ON f.id = l.cover_file_id AND f.course_id = l.course_id
    WHERE l.share_slug = ${slug} AND l.archived_at IS NULL`;
  return rows[0] ?? shareMissing();
}

/** The cover image behind the course's own access rules, for the SPA. */
export async function lessonCover(db: SQL, actor: Actor, courseId: string, lessonId: string): Promise<StoredFile> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    const rows = await tx<StoredFile[]>`SELECT f.id, f.original_name AS name, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes"
      FROM lessons l JOIN course_modules m ON m.id = l.module_id JOIN stored_files f ON f.id = l.cover_file_id AND f.course_id = l.course_id
      WHERE l.id = ${lessonId} AND l.course_id = ${courseId}
        AND (${course.canManage} OR (l.published AND m.published AND l.archived_at IS NULL AND m.archived_at IS NULL))`;
    const cover = rows[0];
    if (!cover) notFound();
    return cover;
  });
}
