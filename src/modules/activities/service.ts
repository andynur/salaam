import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField, invalid } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { awardXp } from "../gamification/awards";
import { recordStoredFile, uploadInput, withFileCleanup } from "../../core/storage/files";
import { courseAccess, lessonAccess, notFound } from "../learning/access";
import { activityInput, gradeInput, submissionContentInput } from "../learning/input";
import type { Activity, Grade, StoredFile, Submission } from "../../shared/learning";

export async function listActivities(db: SQL, actor: Actor, courseId: string, drafts: boolean) {
  return db<Activity[]>`SELECT a.id, a.lesson_id AS "lessonId", a.kind, a.title, a.instructions, a.due_at::text AS "dueAt", a.published,
    a.archived_at IS NOT NULL AS archived,
    (SELECT json_build_object('id', s.id, 'activityId', s.activity_id, 'studentId', s.student_id, 'studentName', u.display_name,
      'content', s.content, 'submittedAt', s.submitted_at::text,
      'file', (SELECT json_build_object('id', f.id, 'name', f.original_name, 'mediaType', f.media_type, 'sizeBytes', f.size_bytes)
        FROM stored_files f WHERE f.id = s.file_id),
      'grade', (SELECT json_build_object('id', g.id, 'score', g.score, 'feedback', g.feedback, 'createdAt', g.created_at::text)
        FROM submission_grades g WHERE g.submission_id = s.id ORDER BY g.created_at DESC, g.id DESC LIMIT 1))
      FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.activity_id = a.id AND s.student_id = ${actor.id}) AS submission
    FROM activities a JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    WHERE a.course_id = ${courseId} AND a.kind = 'assignment'
      AND (${drafts} OR (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))
    ORDER BY a.created_at, a.id`;
}

export async function saveActivity(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string, id?: string) {
  const { title, instructions, dueAt } = activityInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let rows: { id: string }[];
    if (id) {
      // Once answers exist, keep the assignment definition stable for fair grading.
      if ((await tx`SELECT s.id FROM submissions s JOIN activities a ON a.id = s.activity_id WHERE a.id = ${id} AND a.course_id = ${courseId} LIMIT 1`).length) {
        throw new HttpError(409, "ACTIVITY_LOCKED", "Tugas sudah memiliki jawaban. Instruksi dan tenggat tidak dapat diubah.");
      }
      rows = await tx`UPDATE activities SET title = ${title}, instructions = ${instructions}, due_at = ${dueAt}
        WHERE id = ${id} AND course_id = ${courseId} AND kind = 'assignment' AND archived_at IS NULL RETURNING id`;
    } else {
      const lessonId = idField(body, "lessonId");
      await lessonAccess(tx, courseId, lessonId, true);
      rows = await tx`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at)
        VALUES (${courseId}, ${lessonId}, 'assignment', ${title}, ${instructions}, ${dueAt}) RETURNING id`;
    }
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `activity.${id ? "updated" : "created"}`, "activities", rows[0]!.id, requestId);
    return rows[0]!;
  });
}

export async function submitActivity(db: SQL, storageRoot: string, actor: Actor, courseId: string, activityId: string, body: Record<string, unknown>, file: File | null, requestId: string) {
  requirePermission(actor, "learning.participate");
  const content = submissionContentInput(body);
  const upload = file ? await uploadInput(file) : null;
  if (!content && !upload) invalid("Isi jawaban atau lampirkan berkas.");
  return withFileCleanup(storageRoot, upload, store => db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "participate", true);
    const activities = await tx`SELECT a.id, (a.due_at IS NOT NULL AND clock_timestamp() >= a.due_at) AS closed
      FROM activities a JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE a.id = ${activityId} AND a.course_id = ${courseId} AND a.kind = 'assignment' AND a.published AND l.published AND m.published
        AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL`;
    if (!activities.length) notFound();
    const existing = await tx<{ id: string; content: string; sha256: string | null }[]>`SELECT s.id, s.content, f.sha256
      FROM submissions s LEFT JOIN stored_files f ON f.id = s.file_id WHERE s.activity_id = ${activityId} AND s.student_id = ${actor.id}`;
    if (existing[0]) {
      // A retry with identical text and file bytes returns the original submission.
      if (existing[0].content !== content || existing[0].sha256 !== (upload?.sha256 ?? null)) throw new HttpError(409, "ALREADY_SUBMITTED", "Jawaban sudah dikumpulkan dan tidak dapat diganti.");
      return { id: existing[0].id };
    }
    if (activities[0].closed) throw new HttpError(409, "DEADLINE_PASSED", "Tenggat pengumpulan sudah berakhir.");
    if (upload) await recordStoredFile(tx, courseId, actor.id, upload);
    const rows = await tx<{ id: string }[]>`INSERT INTO submissions (activity_id, student_id, content, file_id)
      VALUES (${activityId}, ${actor.id}, ${content}, ${upload?.id ?? null}) RETURNING id`;
    await recordAudit(tx, actor.id, "activity.submitted", "submissions", rows[0]!.id, requestId);
    await store();
    return rows[0]!;
  }));
}

export async function listSubmissions(db: SQL, actor: Actor, courseId: string, activityId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    const activities = await tx`SELECT a.id FROM activities a JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE a.id = ${activityId} AND a.course_id = ${courseId}
        AND (${course.canManage} OR (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))`;
    if (!activities.length) notFound();
    return tx<Submission[]>`SELECT s.id, s.activity_id AS "activityId", s.student_id AS "studentId", u.display_name AS "studentName", s.content, s.submitted_at::text AS "submittedAt",
      (SELECT json_build_object('id', f.id, 'name', f.original_name, 'mediaType', f.media_type, 'sizeBytes', f.size_bytes) FROM stored_files f WHERE f.id = s.file_id) AS file,
      (SELECT json_build_object('id', g.id, 'score', g.score, 'feedback', g.feedback, 'createdAt', g.created_at::text)
        FROM submission_grades g WHERE g.submission_id = s.id ORDER BY g.created_at DESC, g.id DESC LIMIT 1) AS grade
      FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.activity_id = ${activityId}
        AND (${course.canManage} OR s.student_id = ${actor.id}) AND u.display_name ILIKE ${pattern}
      ORDER BY s.submitted_at, s.id LIMIT 51 OFFSET ${offset}`;
  });
}

export async function gradeSubmission(db: SQL, actor: Actor, courseId: string, submissionId: string, body: Record<string, unknown>, requestId: string) {
  const { score, feedback } = gradeInput(body);
  // The editor supplies the grade it read so concurrent corrections cannot overwrite silently.
  const previousGradeId = body.previousGradeId === null ? null : idField(body, "previousGradeId");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const submission = (await tx<{ studentId: string }[]>`SELECT s.student_id AS "studentId" FROM submissions s JOIN activities a ON a.id = s.activity_id
      WHERE s.id = ${submissionId} AND a.course_id = ${courseId} AND a.kind = 'assignment'`)[0];
    if (!submission) notFound();
    const latest = (await tx<Grade[]>`SELECT id, score::float8 AS score, feedback FROM submission_grades WHERE submission_id = ${submissionId} ORDER BY created_at DESC, id DESC LIMIT 1`)[0];
    if (latest && latest.score === score && latest.feedback === feedback) return { id: latest.id };
    if ((latest?.id ?? null) !== previousGradeId) throw new HttpError(409, "GRADE_CHANGED", "Nilai sudah diperbarui. Muat ulang jawaban sebelum menilai kembali.");
    const rows = await tx<{ id: string }[]>`INSERT INTO submission_grades (submission_id, grader_id, score, feedback)
      VALUES (${submissionId}, ${actor.id}, ${score}, ${feedback}) RETURNING id`;
    await recordAudit(tx, actor.id, "activity.graded", "submissions", submissionId, requestId);
    // The first grade rewards the student; corrections and regrades add no further XP.
    await awardXp(tx, submission.studentId, "assignment.graded", "submissions", submissionId, courseId, requestId);
    return rows[0]!;
  });
}

export async function gradeHistory(db: SQL, actor: Actor, courseId: string, submissionId: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    const rows = await tx`SELECT s.id FROM submissions s JOIN activities a ON a.id = s.activity_id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE s.id = ${submissionId} AND a.course_id = ${courseId}
        AND (${course.canManage} OR (s.student_id = ${actor.id} AND a.published AND l.published AND m.published
          AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))`;
    if (!rows.length) notFound();
    return tx<Grade[]>`SELECT id, score::float8 AS score, feedback, created_at::text AS "createdAt" FROM submission_grades
      WHERE submission_id = ${submissionId} ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ${offset}`;
  });
}

export async function submissionFile(db: SQL, actor: Actor, courseId: string, submissionId: string): Promise<StoredFile> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    const rows = await tx<StoredFile[]>`SELECT f.id, f.original_name AS name, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes"
      FROM submissions s JOIN stored_files f ON f.id = s.file_id JOIN activities a ON a.id = s.activity_id
      JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE s.id = ${submissionId} AND a.course_id = ${courseId} AND f.course_id = ${courseId}
        AND (${course.canManage} OR (s.student_id = ${actor.id} AND a.published AND l.published AND m.published
          AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))`;
    const file = rows[0];
    if (!file) notFound();
    return file;
  });
}
