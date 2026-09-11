import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField, invalid, textField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { awardXp } from "../gamification/awards";
import { recordStoredFile, uploadInput, withFileCleanup } from "../../core/storage/files";
import type { CourseDetail, CourseModule, Lesson, Material, LearningCourse, Progress, StoredFile } from "../../shared/learning";
import { courseAccess, lessonAccess, notFound } from "./access";
import { archivedInput, materialInput, positionInput, publishedInput } from "./input";
import { listActivities } from "../activities/service";
import { listAssessments } from "../assessments/service";
import { listChallenges } from "../projects/challenges";

export async function listCourses(db: SQL, actor: Actor, pattern: string, offset: number) {
  requirePermission(actor, "learning.view");
  return db<LearningCourse[]>`SELECT c.id, c.name, cl.name AS "className", t.name AS term, y.name AS year, c.published,
    (${actor.permissions.includes("learning.manage")} AND (${actor.permissions.includes("learning.manage.all")} OR EXISTS
      (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) AS "canManage"
    FROM courses c JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
    WHERE (c.name ILIKE ${pattern} OR cl.name ILIKE ${pattern}) AND (
      (${actor.permissions.includes("learning.manage")} AND (${actor.permissions.includes("learning.manage.all")} OR EXISTS
        (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) OR
      (c.published AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.class_id AND m.student_id = ${actor.id})))
    ORDER BY y.starts_on DESC, c.name, c.id LIMIT 51 OFFSET ${offset}`;
}

// Activities of every kind count. An assignment is done when submitted and graded when a
// grade exists; a quiz or exam is both once any attempt is submitted (scores are automatic);
// a challenge is done once the student's project was submitted and graded once approved.
export async function progressRows(db: SQL, courseId: string, studentId: string | null, pattern = "%", offset = 0) {
  return db<Progress[]>`WITH visible_lessons AS (
      SELECT l.id FROM lessons l JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = l.course_id
      WHERE l.course_id = ${courseId} AND c.published AND l.published AND m.published AND l.archived_at IS NULL AND m.archived_at IS NULL
    ), visible_activities AS (
      SELECT a.id FROM activities a JOIN visible_lessons l ON l.id = a.lesson_id WHERE a.published AND a.archived_at IS NULL
    ) SELECT u.id AS "studentId", u.display_name AS "studentName",
      (SELECT count(*)::int FROM visible_lessons) AS lessons,
      (SELECT count(*)::int FROM lesson_completions lc JOIN visible_lessons l ON l.id = lc.lesson_id WHERE lc.student_id = u.id) AS completed,
      (SELECT count(*)::int FROM visible_activities) AS activities,
      (SELECT count(*)::int FROM visible_activities a WHERE EXISTS (SELECT 1 FROM submissions s WHERE s.activity_id = a.id AND s.student_id = u.id)
        OR EXISTS (SELECT 1 FROM attempts t WHERE t.activity_id = a.id AND t.student_id = u.id AND t.submitted_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM project_members pm JOIN projects p ON p.id = pm.project_id
          WHERE p.activity_id = a.id AND pm.student_id = u.id AND p.first_submitted_at IS NOT NULL)) AS submitted,
      (SELECT count(*)::int FROM visible_activities a WHERE EXISTS (SELECT 1 FROM submissions s WHERE s.activity_id = a.id AND s.student_id = u.id
          AND EXISTS (SELECT 1 FROM submission_grades g WHERE g.submission_id = s.id))
        OR EXISTS (SELECT 1 FROM attempts t WHERE t.activity_id = a.id AND t.student_id = u.id AND t.submitted_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM project_members pm JOIN projects p ON p.id = pm.project_id
          WHERE p.activity_id = a.id AND pm.student_id = u.id AND p.status = 'approved')) AS graded
    FROM class_members cm JOIN users u ON u.id = cm.student_id JOIN courses c ON c.class_id = cm.class_id
    WHERE c.id = ${courseId} AND (${studentId}::uuid IS NULL OR u.id = ${studentId}::uuid) AND u.display_name ILIKE ${pattern}
    ORDER BY u.display_name, u.id LIMIT 51 OFFSET ${offset}`;
}

export async function courseDetail(db: SQL, actor: Actor, courseId: string): Promise<CourseDetail> {
  // One snapshot prevents publish/archive changes from leaking descendants mid-read.
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const access = await courseAccess(tx, actor, courseId, "view");
    // Managers receive drafts and archived items (flagged) so they can publish or restore them.
    const drafts = access.course.canManage;
    const modules = await tx<CourseModule[]>`SELECT id, title, position, published, archived_at IS NOT NULL AS archived FROM course_modules
      WHERE course_id = ${courseId} AND (${drafts} OR (published AND archived_at IS NULL)) ORDER BY position, created_at, id`;
    const lessons = await tx<Lesson[]>`SELECT l.id, l.module_id AS "moduleId", l.title, l.content, l.position, l.published, l.archived_at IS NOT NULL AS archived,
      EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id = l.id AND lc.student_id = ${actor.id}) AS completed
      FROM lessons l JOIN course_modules m ON m.id = l.module_id
      WHERE l.course_id = ${courseId} AND (${drafts} OR (l.published AND m.published AND l.archived_at IS NULL AND m.archived_at IS NULL))
      ORDER BY l.position, l.created_at, l.id`;
    const materials = await tx<Material[]>`SELECT lm.id, lm.lesson_id AS "lessonId", lm.title, lm.kind, lm.content, lm.archived_at IS NOT NULL AS archived,
      CASE WHEN f.id IS NULL THEN NULL ELSE json_build_object('id', f.id, 'name', f.original_name, 'mediaType', f.media_type, 'sizeBytes', f.size_bytes) END AS file
      FROM lesson_materials lm JOIN lessons l ON l.id = lm.lesson_id JOIN course_modules m ON m.id = l.module_id LEFT JOIN stored_files f ON f.id = lm.file_id
      WHERE lm.course_id = ${courseId}
        AND (${drafts} OR (lm.archived_at IS NULL AND l.published AND m.published AND l.archived_at IS NULL AND m.archived_at IS NULL))
      ORDER BY lm.created_at, lm.id`;
    const activities = await listActivities(tx, actor, courseId, drafts);
    const assessments = await listAssessments(tx, actor, courseId, drafts);
    const challenges = await listChallenges(tx, actor, courseId, drafts);
    const progress = access.canParticipate ? (await progressRows(tx, courseId, actor.id))[0] ?? null : null;
    return { ...access, modules, lessons, materials, activities, assessments, challenges, progress };
  });
}

export type ContentResource = "modules" | "lessons" | "materials";
export async function saveContent(db: SQL, storageRoot: string, actor: Actor, courseId: string, resource: ContentResource, body: Record<string, unknown>, file: File | null, requestId: string, id?: string) {
  requirePermission(actor, "learning.manage");
  if (file && resource !== "materials") invalid("Berkas hanya dapat dilampirkan pada materi.");
  const upload = file ? await uploadInput(file) : null;
  return withFileCleanup(storageRoot, upload, store => db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const title = textField(body, "title", 150);
    let rows: { id: string }[];
    if (resource === "modules") {
      const position = positionInput(body);
      rows = id ? await tx`UPDATE course_modules SET title = ${title}, position = ${position} WHERE id = ${id} AND course_id = ${courseId} AND archived_at IS NULL RETURNING id`
        : await tx`INSERT INTO course_modules (course_id, title, position) VALUES (${courseId}, ${title}, ${position}) RETURNING id`;
    } else if (resource === "lessons") {
      const content = textField(body, "content", 20000);
      const position = positionInput(body);
      if (id) {
        // A lesson may move to another active module of the same course; its materials,
        // activities, submissions, and completions stay attached to the lesson.
        const moduleId = body.moduleId === undefined ? null : idField(body, "moduleId");
        if (moduleId && !(await tx`SELECT id FROM course_modules WHERE id = ${moduleId} AND course_id = ${courseId} AND archived_at IS NULL`).length) notFound();
        rows = await tx`UPDATE lessons SET title = ${title}, content = ${content}, position = ${position}, module_id = COALESCE(${moduleId}::uuid, module_id)
          WHERE id = ${id} AND course_id = ${courseId} AND archived_at IS NULL RETURNING id`;
      } else {
        const moduleId = idField(body, "moduleId");
        rows = await tx`INSERT INTO lessons (course_id, module_id, title, content, position)
          SELECT ${courseId}, id, ${title}, ${content}, ${position} FROM course_modules
          WHERE id = ${moduleId} AND course_id = ${courseId} AND archived_at IS NULL RETURNING id`;
      }
    } else {
      const { kind, content } = materialInput(body, upload !== null);
      if (id) {
        const current = (await tx<{ fileId: string | null }[]>`SELECT file_id AS "fileId" FROM lesson_materials
          WHERE id = ${id} AND course_id = ${courseId} AND archived_at IS NULL`)[0];
        if (!current) notFound();
        if (kind === "file" && !upload && !current.fileId) invalid("Pilih berkas materi.");
        if (upload) await recordStoredFile(tx, courseId, actor.id, upload);
        // A replaced file keeps its stored_files row and bytes for history and backups.
        const fileId = kind === "file" ? upload?.id ?? current.fileId : null;
        rows = await tx`UPDATE lesson_materials SET title = ${title}, kind = ${kind}, content = ${content}, file_id = ${fileId}
          WHERE id = ${id} AND course_id = ${courseId} RETURNING id`;
      } else {
        const lessonId = idField(body, "lessonId");
        await lessonAccess(tx, courseId, lessonId, true);
        if (kind === "file" && !upload) invalid("Pilih berkas materi.");
        if (upload) await recordStoredFile(tx, courseId, actor.id, upload);
        rows = await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content, file_id)
          VALUES (${courseId}, ${lessonId}, ${title}, ${kind}, ${content}, ${upload?.id ?? null}) RETURNING id`;
      }
    }
    if (!rows.length) notFound();
    const saved = rows[0]!;
    await recordAudit(tx, actor.id, `learning.${resource}.${id ? "updated" : "created"}`, resource, saved.id, requestId);
    await store();
    return saved;
  }));
}

export async function publishContent(db: SQL, actor: Actor, courseId: string, resource: "courses" | "modules" | "lessons" | "activities", id: string, body: Record<string, unknown>, requestId: string) {
  const published = publishedInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let rows: { id: string }[];
    switch (resource) {
      case "courses": rows = await tx`UPDATE courses SET published = ${published} WHERE id = ${courseId} RETURNING id`; break;
      case "modules": rows = await tx`UPDATE course_modules SET published = ${published} WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
      case "lessons": rows = await tx`UPDATE lessons SET published = ${published} WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
      case "activities":
        if (published && (await tx`SELECT 1 FROM activities a WHERE a.id = ${id} AND a.course_id = ${courseId} AND a.kind IN ('quiz', 'exam')
            AND NOT EXISTS (SELECT 1 FROM assessment_questions aq WHERE aq.activity_id = a.id)`).length) {
          throw new HttpError(409, "NO_QUESTIONS", "Tambahkan soal sebelum mempublikasikan penilaian.");
        }
        rows = await tx`UPDATE activities SET published = ${published} WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
    }
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `learning.${resource}.${published ? "published" : "unpublished"}`, resource, rows[0]!.id, requestId);
    return rows[0]!;
  });
}

export async function archiveContent(db: SQL, actor: Actor, courseId: string, resource: "modules" | "lessons" | "materials" | "activities", id: string, body: Record<string, unknown>, requestId: string) {
  const archived = archivedInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let rows: { id: string }[];
    switch (resource) {
      case "modules": rows = await tx`UPDATE course_modules SET archived_at = CASE WHEN ${archived} THEN COALESCE(archived_at, clock_timestamp()) END
        WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
      case "lessons": rows = await tx`UPDATE lessons SET archived_at = CASE WHEN ${archived} THEN COALESCE(archived_at, clock_timestamp()) END
        WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
      case "materials": rows = await tx`UPDATE lesson_materials SET archived_at = CASE WHEN ${archived} THEN COALESCE(archived_at, clock_timestamp()) END
        WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
      case "activities": rows = await tx`UPDATE activities SET archived_at = CASE WHEN ${archived} THEN COALESCE(archived_at, clock_timestamp()) END
        WHERE id = ${id} AND course_id = ${courseId} RETURNING id`; break;
    }
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `learning.${resource}.${archived ? "archived" : "restored"}`, resource, rows[0]!.id, requestId);
    return rows[0]!;
  });
}

export async function completeLesson(db: SQL, actor: Actor, courseId: string, lessonId: string, requestId: string) {
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "participate", true);
    await lessonAccess(tx, courseId, lessonId, false);
    const rows = await tx`INSERT INTO lesson_completions (lesson_id, student_id) VALUES (${lessonId}, ${actor.id}) ON CONFLICT DO NOTHING RETURNING lesson_id`;
    if (rows.length) {
      await recordAudit(tx, actor.id, "learning.lesson.completed", "lessons", lessonId, requestId);
      await awardXp(tx, actor.id, "lesson.completed", "lessons", lessonId, courseId, requestId);
    }
    return { completed: true };
  });
}

export async function courseProgress(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    return progressRows(tx, courseId, course.canManage ? null : actor.id, pattern, offset);
  });
}

export async function materialFile(db: SQL, actor: Actor, courseId: string, materialId: string): Promise<StoredFile> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    const rows = await tx<StoredFile[]>`SELECT f.id, f.original_name AS name, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes"
      FROM lesson_materials lm JOIN stored_files f ON f.id = lm.file_id AND f.course_id = lm.course_id
      JOIN lessons l ON l.id = lm.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE lm.id = ${materialId} AND lm.course_id = ${courseId}
        AND (${course.canManage} OR (lm.archived_at IS NULL AND l.published AND m.published AND l.archived_at IS NULL AND m.archived_at IS NULL))`;
    const file = rows[0];
    if (!file) notFound();
    return file;
  });
}
