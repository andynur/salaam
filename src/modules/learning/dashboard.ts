import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import type { LearningTask } from "../../shared/learning";

// Dashboard shortcuts: open assignments and the next lesson for students, pending grading for teachers.
export async function learningTasks(db: SQL, actor: Actor): Promise<LearningTask[]> {
  const tasks: LearningTask[] = [];
  if (actor.permissions.includes("learning.participate")) {
    tasks.push(...await db<LearningTask[]>`SELECT 'assignment' AS type, a.id, c.id AS "courseId", c.name AS "courseName", a.lesson_id AS "lessonId",
        a.title, a.due_at::text AS "dueAt", 0 AS pending
      FROM activities a JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = a.course_id
      JOIN class_members cm ON cm.class_id = c.class_id AND cm.student_id = ${actor.id}
      WHERE a.kind = 'assignment' AND c.published AND m.published AND l.published AND a.published
        AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL
        AND (a.due_at IS NULL OR a.due_at > clock_timestamp())
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.activity_id = a.id AND s.student_id = ${actor.id})
      ORDER BY a.due_at NULLS LAST, a.created_at, a.id LIMIT 5`);
    // The first incomplete lesson per course, most recently studied courses first.
    tasks.push(...await db<LearningTask[]>`SELECT type, id, "courseId", "courseName", "lessonId", title, "dueAt", pending FROM (
        SELECT DISTINCT ON (c.id) 'lesson' AS type, l.id, c.id AS "courseId", c.name AS "courseName", l.id AS "lessonId", l.title,
          NULL::text AS "dueAt", 0 AS pending,
          (SELECT max(lc.completed_at) FROM lesson_completions lc JOIN lessons done ON done.id = lc.lesson_id
            WHERE done.course_id = c.id AND lc.student_id = ${actor.id}) AS recent
        FROM lessons l JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = l.course_id
        JOIN class_members cm ON cm.class_id = c.class_id AND cm.student_id = ${actor.id}
        WHERE c.published AND m.published AND l.published AND l.archived_at IS NULL AND m.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id = l.id AND lc.student_id = ${actor.id})
        ORDER BY c.id, m.position, m.created_at, m.id, l.position, l.created_at, l.id
      ) next_lessons ORDER BY recent DESC NULLS LAST, "courseName", "courseId" LIMIT 3`);
  }
  if (actor.permissions.includes("learning.manage")) {
    tasks.push(...await db<LearningTask[]>`SELECT 'grading' AS type, a.id, c.id AS "courseId", c.name AS "courseName", a.lesson_id AS "lessonId",
        a.title, a.due_at::text AS "dueAt", count(*)::int AS pending
      FROM submissions s JOIN activities a ON a.id = s.activity_id JOIN courses c ON c.id = a.course_id
      WHERE a.kind = 'assignment' AND a.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM submission_grades g WHERE g.submission_id = s.id)
        AND (${actor.permissions.includes("learning.manage.all")} OR EXISTS
          (SELECT 1 FROM teaching_assignments t WHERE t.course_id = c.id AND t.teacher_id = ${actor.id}))
      GROUP BY a.id, c.id ORDER BY min(s.submitted_at), a.id LIMIT 5`);
  }
  return tasks;
}
