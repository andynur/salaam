import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";

export async function academicSummary(db: SQL, actor: Actor, timezone: string) {
  const all = actor.permissions.includes("academic.manage");
  const [summary] = await db<{ academic: string | null; courses: number; classes: number }[]>`
    SELECT (SELECT name FROM academic_years WHERE (now() AT TIME ZONE ${timezone})::date BETWEEN starts_on AND ends_on
      ORDER BY starts_on DESC, id LIMIT 1) AS academic,
    (SELECT count(*)::int FROM courses c JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id WHERE ${all}
      OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id})
      OR (c.published AND cl.archived_at IS NULL AND t.archived_at IS NULL AND y.archived_at IS NULL AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.class_id AND m.student_id = ${actor.id}))) AS courses,
    (SELECT count(*)::int FROM classes cl JOIN academic_years y ON y.id = cl.academic_year_id WHERE ${all}
      OR EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = cl.id AND m.student_id = ${actor.id})
      OR EXISTS (SELECT 1 FROM courses c JOIN teaching_assignments a ON a.course_id = c.id WHERE c.class_id = cl.id AND a.teacher_id = ${actor.id})) AS classes`;
  return { ...summary!, tasks: [], events: [] };
}
