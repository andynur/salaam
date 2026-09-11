import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import type { LearningCourse } from "../../shared/learning";

export function notFound(): never { throw new HttpError(404, "NOT_FOUND", "Konten pembelajaran tidak ditemukan atau belum dipublikasikan."); }

// Lock the course first on every mutation, including publishing, submitting and grading.
// Descendant checks and writes then observe one consistent visibility state.
// Attempt traffic takes a shared lock instead: publishing still waits for in-flight
// attempt writes, but students answering the same exam do not serialize on each other.
export async function courseAccess(db: SQL, actor: Actor, courseId: string, mode: "view" | "manage" | "participate", lock: boolean | "share" = false) {
  requirePermission(actor, mode === "manage" ? "learning.manage" : mode === "participate" ? "learning.participate" : "learning.view");
  if (lock === "share") await db`SELECT id FROM courses WHERE id = ${courseId} FOR SHARE`;
  else if (lock) await db`SELECT id FROM courses WHERE id = ${courseId} FOR UPDATE`;
  const rows = await db<(LearningCourse & { enrolled: boolean })[]>`SELECT c.id, c.name, cl.name AS "className", t.name AS term, y.name AS year, c.published,
    (${actor.permissions.includes("learning.manage")} AND (${actor.permissions.includes("learning.manage.all")} OR EXISTS
      (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) AS "canManage",
    EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.class_id AND m.student_id = ${actor.id}) AS enrolled
    FROM courses c JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
    WHERE c.id = ${courseId}`;
  const course = rows[0];
  if (!course || (mode === "manage" ? !course.canManage : mode === "participate" ? !(course.enrolled && course.published) : !(course.canManage || (course.enrolled && course.published)))) notFound();
  const { enrolled, ...summary } = course;
  return { course: summary, canParticipate: enrolled && course.published && actor.permissions.includes("learning.participate") };
}

// Archived lessons and lessons in archived modules accept no new work or children.
export async function lessonAccess(db: SQL, courseId: string, lessonId: string, includeDraft: boolean) {
  const rows = await db`SELECT l.id FROM lessons l JOIN course_modules m ON m.id = l.module_id
    WHERE l.id = ${lessonId} AND l.course_id = ${courseId} AND l.archived_at IS NULL AND m.archived_at IS NULL
      AND (${includeDraft} OR (l.published AND m.published))`;
  if (!rows.length) notFound();
}
