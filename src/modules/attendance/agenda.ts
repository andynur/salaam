import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import type { AgendaSession, AttendanceAgenda, CourseNextSession } from "../../shared/attendance";

// The Kehadiran landing agenda. Scope matches `courseAccess(..., "view")` plus the roster check
// of `meetingDetail`: managers see every session of courses they manage; santri see sessions of
// published, active courses of their class where they are on the roster. "Today" is the school
// timezone's calendar day on the database clock; sessions still open from earlier days stay
// listed so a forgotten session can be closed.
export async function attendanceAgenda(db: SQL, actor: Actor, timezone: string): Promise<AttendanceAgenda> {
  requirePermission(actor, "learning.view");
  const manage = actor.permissions.includes("learning.manage");
  const manageAll = actor.permissions.includes("learning.manage.all");
  const assist = actor.permissions.includes("learning.assist");
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const [clock] = await tx<{ now: string }[]>`SELECT clock_timestamp()::text AS now`;
    const visible = () => tx`WITH scoped AS (
        SELECT c.id, c.name, cl.name AS class_name,
          (${manage} AND (${manageAll} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) AS can_manage,
          (${assist} AND EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id})) AS can_assist,
          (c.published AND cl.archived_at IS NULL AND t.archived_at IS NULL AND y.archived_at IS NULL
            AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.class_id AND m.student_id = ${actor.id})) AS participates
        FROM courses c JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
      ) SELECT s.id, s.course_id, s.title, s.starts_at, s.ends_at, s.status, sc.name AS course_name, sc.class_name, sc.can_manage, sc.can_assist
      FROM classroom_sessions s JOIN scoped sc ON sc.id = s.course_id
      WHERE sc.can_manage OR sc.can_assist OR (sc.participates AND EXISTS (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = ${actor.id} AND r.removed_at IS NULL))`;
    const rows = await tx<AgendaSession[]>`SELECT v.id, v.course_id AS "courseId", v.course_name AS "courseName", v.class_name AS "className", v.title,
        v.starts_at::text AS "startsAt", v.ends_at::text AS "endsAt", v.status, v.can_manage AS "canManage", v.can_assist AS "canAssist",
        CASE WHEN v.can_manage OR v.can_assist THEN (SELECT count(*)::int FROM classroom_roster r WHERE r.session_id = v.id AND r.removed_at IS NULL) END AS total,
        CASE WHEN v.can_manage OR v.can_assist THEN (SELECT count(*)::int FROM classroom_roster r WHERE r.session_id = v.id AND r.removed_at IS NULL
          AND EXISTS (SELECT 1 FROM attendance_records a WHERE a.session_id = r.session_id AND a.student_id = r.student_id)) END AS recorded,
        CASE WHEN NOT v.can_manage AND NOT v.can_assist THEN (SELECT a.status FROM attendance_records a WHERE a.session_id = v.id AND a.student_id = ${actor.id}
          AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)) END AS "myStatus",
        EXISTS (SELECT 1 FROM attendance_checkin_windows w WHERE w.session_id = v.id AND w.status = 'open') AS "checkinOpen"
      FROM (${visible()}) v
      WHERE v.status = 'open' OR (v.starts_at AT TIME ZONE ${timezone})::date = (clock_timestamp() AT TIME ZONE ${timezone})::date
      ORDER BY (v.status = 'open') DESC, v.starts_at, v.id LIMIT 51`;
    // One pointer per course for the catalog tiles: the open session, else the next scheduled one.
    const courses = await tx<CourseNextSession[]>`SELECT DISTINCT ON (v.course_id) v.course_id AS "courseId", v.course_name AS "courseName", v.id AS "sessionId", v.title,
        v.starts_at::text AS "startsAt", v.ends_at::text AS "endsAt", v.status
      FROM (${visible()}) v WHERE v.status = 'open' OR (v.status = 'scheduled' AND v.ends_at > clock_timestamp())
      ORDER BY v.course_id, (v.status = 'open') DESC, v.starts_at, v.id LIMIT 1000`;
    return { now: clock!.now, sessions: rows.slice(0, 50), hasMore: rows.length > 50, courses };
  });
}
