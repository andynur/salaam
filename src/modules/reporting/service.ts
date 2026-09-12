import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { recordAudit } from "../../core/audit/repository";
import type {
  AttendanceSummaryRow, AuditReportRow, CourseReportRow, FilterOption, OverviewSummary,
  ProgressReportRow, ReportFilterOptions, ReportKind, ReportScope,
} from "../../shared/reporting";

// One export never streams a whole school: 5,000 rows covers a term for a class and keeps
// the response inside one request.
export const exportRowLimit = 5000;
const readOnly = "ISOLATION LEVEL REPEATABLE READ READ ONLY";
const can = (actor: Actor, permission: string) => actor.permissions.includes(permission);

// Reporting is cross-course, so scope is a filter rather than a single-course lookup:
// learning.manage.all sees every course, anyone else only the courses they teach.
export function reportActor(actor: Actor | null): { actor: Actor; all: boolean } {
  requirePermission(actor, "reports.view");
  return { actor, all: can(actor, "learning.manage.all") };
}

export function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }

export async function filterOptions(db: SQL, actor: Actor | null): Promise<ReportFilterOptions> {
  const { all } = reportActor(actor);
  const me = actor!.id;
  return db.begin(readOnly, async tx => {
    const courses = await tx<FilterOption[]>`SELECT c.id, c.name || ' · ' || cl.name AS name, c.term_id AS "parentId"
      FROM courses c JOIN classes cl ON cl.id = c.class_id
      WHERE ${all} OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${me})
      ORDER BY cl.name, c.name, c.id LIMIT 500`;
    const classes = await tx<FilterOption[]>`SELECT cl.id, cl.name, cl.academic_year_id AS "parentId" FROM classes cl
      WHERE ${all} OR EXISTS (SELECT 1 FROM courses c JOIN teaching_assignments ta ON ta.course_id = c.id WHERE c.class_id = cl.id AND ta.teacher_id = ${me})
      ORDER BY cl.name, cl.id LIMIT 500`;
    const terms = await tx<FilterOption[]>`SELECT t.id, t.name, t.academic_year_id AS "parentId" FROM terms t
      WHERE ${all} OR EXISTS (SELECT 1 FROM courses c JOIN teaching_assignments ta ON ta.course_id = c.id WHERE c.term_id = t.id AND ta.teacher_id = ${me})
      ORDER BY t.starts_on DESC, t.name, t.id LIMIT 500`;
    const years = await tx<FilterOption[]>`SELECT y.id, y.name, NULL::uuid AS "parentId" FROM academic_years y
      WHERE ${all} OR EXISTS (SELECT 1 FROM courses c JOIN teaching_assignments ta ON ta.course_id = c.id WHERE c.academic_year_id = y.id AND ta.teacher_id = ${me})
      ORDER BY y.starts_on DESC, y.name, y.id LIMIT 200`;
    const canViewAudit = can(actor!, "audit.view");
    const events = canViewAudit
      ? (await tx<{ event: string }[]>`SELECT DISTINCT event FROM audit_logs ORDER BY event LIMIT 200`).map(row => row.event)
      : [];
    return { years, terms, classes, courses, events, canViewAudit };
  });
}

export async function overview(db: SQL, actor: Actor | null, scope: ReportScope): Promise<OverviewSummary> {
  const { all } = reportActor(actor);
  const me = actor!.id;
  return db.begin(readOnly, async tx => {
    const rows = await tx<OverviewSummary[]>`WITH scope AS (
        SELECT c.id, c.class_id, c.published FROM courses c
        WHERE (${scope.yearId}::uuid IS NULL OR c.academic_year_id = ${scope.yearId}::uuid)
          AND (${scope.termId}::uuid IS NULL OR c.term_id = ${scope.termId}::uuid)
          AND (${scope.classId}::uuid IS NULL OR c.class_id = ${scope.classId}::uuid)
          AND (${scope.courseId}::uuid IS NULL OR c.id = ${scope.courseId}::uuid)
          AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${me}))
      )
      SELECT
        (SELECT count(DISTINCT cm.student_id)::int FROM class_members cm JOIN users u ON u.id = cm.student_id AND u.is_active
          WHERE EXISTS (SELECT 1 FROM scope s WHERE s.class_id = cm.class_id)) AS students,
        (SELECT count(*)::int FROM scope) AS courses,
        (SELECT count(*)::int FROM scope WHERE published) AS "publishedCourses",
        (SELECT count(*)::int FROM activities a JOIN scope s ON s.id = a.course_id WHERE a.archived_at IS NULL) AS activities,
        (SELECT count(*)::int FROM lessons l JOIN course_modules mo ON mo.id = l.module_id JOIN scope s ON s.id = l.course_id
          WHERE l.archived_at IS NULL AND mo.archived_at IS NULL) AS lessons,
        (SELECT round(100.0 * (SELECT count(*) FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id JOIN scope s ON s.id = l.course_id)
          / nullif((SELECT count(*) FROM lessons l JOIN course_modules mo ON mo.id = l.module_id JOIN scope s ON s.id = l.course_id
              JOIN class_members cm ON cm.class_id = s.class_id JOIN users u ON u.id = cm.student_id AND u.is_active
            WHERE s.published AND mo.published AND l.published AND l.archived_at IS NULL AND mo.archived_at IS NULL), 0), 1)::float) AS "lessonCompletionRate",
        (SELECT count(*)::int FROM classroom_sessions cs JOIN scope s ON s.id = cs.course_id WHERE cs.status <> 'cancelled') AS sessions,
        (SELECT count(*)::int FROM classroom_sessions cs JOIN scope s ON s.id = cs.course_id WHERE cs.status = 'closed') AS "closedSessions",
        (SELECT round(100.0 * count(*) FILTER (WHERE a.status IN ('present', 'late')) / nullif(count(*), 0), 1)::float
          FROM classroom_roster r JOIN classroom_sessions cs ON cs.id = r.session_id AND cs.status = 'closed' JOIN scope s ON s.id = cs.course_id
          LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
            AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)) AS "attendanceRate",
        (SELECT count(*)::int FROM submissions sub JOIN activities a ON a.id = sub.activity_id JOIN scope s ON s.id = a.course_id) AS submissions,
        (SELECT count(*)::int FROM submissions sub JOIN activities a ON a.id = sub.activity_id JOIN scope s ON s.id = a.course_id
          WHERE NOT EXISTS (SELECT 1 FROM submission_grades g WHERE g.submission_id = sub.id)) AS "pendingGrading",
        (SELECT round(avg(g.score), 1)::float FROM submissions sub JOIN activities a ON a.id = sub.activity_id JOIN scope s ON s.id = a.course_id
          JOIN LATERAL (SELECT sg.score FROM submission_grades sg WHERE sg.submission_id = sub.id ORDER BY sg.created_at DESC, sg.id DESC LIMIT 1) g ON true) AS "averageScore",
        (SELECT count(*)::int FROM attempts t JOIN activities a ON a.id = t.activity_id JOIN scope s ON s.id = a.course_id WHERE t.submitted_at IS NOT NULL) AS attempts,
        (SELECT round(avg(100.0 * COALESCE((SELECT adj.score FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id ORDER BY adj.created_at DESC, adj.id DESC LIMIT 1), t.score) / t.max_score), 1)::float
          FROM attempts t JOIN activities a ON a.id = t.activity_id JOIN scope s ON s.id = a.course_id WHERE t.submitted_at IS NOT NULL) AS "averageAttemptScore",
        (SELECT count(*)::int FROM projects p JOIN scope s ON s.id = p.course_id) AS projects,
        (SELECT count(*)::int FROM projects p JOIN scope s ON s.id = p.course_id WHERE p.status = 'submitted') AS "pendingReviews",
        (SELECT COALESCE(sum(x.points), 0)::int FROM xp_entries x JOIN scope s ON s.id = x.course_id) AS "xpAwarded"`;
    return rows[0]!;
  });
}

export async function courseReport(db: SQL, actor: Actor | null, scope: ReportScope, pattern: string, offset: number, limit = 51) {
  const { all } = reportActor(actor);
  const me = actor!.id;
  return db.begin(readOnly, async tx => tx<CourseReportRow[]>`SELECT c.id AS "courseId", c.name AS "courseName", cl.name AS "className",
      t.name AS "termName", sub.name AS "subjectName", c.published,
      (SELECT count(*)::int FROM class_members cm JOIN users u ON u.id = cm.student_id AND u.is_active WHERE cm.class_id = c.class_id) AS students,
      (SELECT count(*)::int FROM lessons l JOIN course_modules mo ON mo.id = l.module_id WHERE l.course_id = c.id AND l.archived_at IS NULL AND mo.archived_at IS NULL) AS lessons,
      (SELECT count(*)::int FROM activities a WHERE a.course_id = c.id AND a.archived_at IS NULL) AS activities,
      (SELECT count(*)::int FROM classroom_sessions cs WHERE cs.course_id = c.id AND cs.status <> 'cancelled') AS sessions,
      (SELECT round(100.0 * count(*) FILTER (WHERE a.status IN ('present', 'late')) / nullif(count(*), 0), 1)::float
        FROM classroom_roster r JOIN classroom_sessions cs ON cs.id = r.session_id AND cs.status = 'closed' AND cs.course_id = c.id
        LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
          AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)) AS "attendanceRate",
      (SELECT count(*)::int FROM submissions s JOIN activities a ON a.id = s.activity_id WHERE a.course_id = c.id) AS submissions,
      (SELECT count(*)::int FROM submissions s JOIN activities a ON a.id = s.activity_id WHERE a.course_id = c.id
        AND NOT EXISTS (SELECT 1 FROM submission_grades g WHERE g.submission_id = s.id)) AS "pendingGrading",
      (SELECT round(avg(g.score), 1)::float FROM submissions s JOIN activities a ON a.id = s.activity_id
        JOIN LATERAL (SELECT sg.score FROM submission_grades sg WHERE sg.submission_id = s.id ORDER BY sg.created_at DESC, sg.id DESC LIMIT 1) g ON true
        WHERE a.course_id = c.id) AS "averageScore"
    FROM courses c JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id JOIN subjects sub ON sub.id = c.subject_id
    WHERE (${scope.yearId}::uuid IS NULL OR c.academic_year_id = ${scope.yearId}::uuid)
      AND (${scope.termId}::uuid IS NULL OR c.term_id = ${scope.termId}::uuid)
      AND (${scope.classId}::uuid IS NULL OR c.class_id = ${scope.classId}::uuid)
      AND (${scope.courseId}::uuid IS NULL OR c.id = ${scope.courseId}::uuid)
      AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${me}))
      AND (c.name ILIKE ${pattern} OR cl.name ILIKE ${pattern} OR sub.name ILIKE ${pattern})
    ORDER BY cl.name, c.name, c.id LIMIT ${limit} OFFSET ${offset}`);
}

// Cross-course attendance: one row per santri over every noncancelled session in scope.
export async function attendanceSummary(db: SQL, actor: Actor | null, scope: ReportScope, pattern: string, offset: number, limit = 51) {
  const { all } = reportActor(actor);
  const me = actor!.id;
  return db.begin(readOnly, async tx => tx<AttendanceSummaryRow[]>`SELECT r.student_id AS "studentId", max(r.student_name) AS "studentName",
      max(r.identifier) AS identifier, max(cl.name) AS "className", count(DISTINCT c.id)::int AS courses, count(*)::int AS total,
      count(*) FILTER (WHERE a.id IS NULL)::int AS unrecorded,
      count(*) FILTER (WHERE a.status = 'present')::int AS present, count(*) FILTER (WHERE a.status = 'late')::int AS late,
      count(*) FILTER (WHERE a.status = 'excused')::int AS excused, count(*) FILTER (WHERE a.status = 'sick')::int AS sick,
      count(*) FILTER (WHERE a.status = 'absent')::int AS absent,
      count(*) FILTER (WHERE cs.status = 'closed')::int AS closed,
      count(*) FILTER (WHERE cs.status = 'closed' AND a.status IN ('present', 'late'))::int AS attended,
      round(100.0 * count(*) FILTER (WHERE cs.status = 'closed' AND a.status IN ('present', 'late'))
        / nullif(count(*) FILTER (WHERE cs.status = 'closed'), 0), 1)::float AS rate
    FROM classroom_roster r JOIN classroom_sessions cs ON cs.id = r.session_id JOIN courses c ON c.id = cs.course_id
    JOIN classes cl ON cl.id = c.class_id
    LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
      AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)
    WHERE cs.status <> 'cancelled'
      AND (${scope.yearId}::uuid IS NULL OR c.academic_year_id = ${scope.yearId}::uuid)
      AND (${scope.termId}::uuid IS NULL OR c.term_id = ${scope.termId}::uuid)
      AND (${scope.classId}::uuid IS NULL OR c.class_id = ${scope.classId}::uuid)
      AND (${scope.courseId}::uuid IS NULL OR c.id = ${scope.courseId}::uuid)
      AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${me}))
      AND (r.student_name ILIKE ${pattern} OR r.identifier ILIKE ${pattern})
    GROUP BY r.student_id ORDER BY "studentName", r.student_id LIMIT ${limit} OFFSET ${offset}`);
}

// Learning progress: one row per santri enrolled in a class that owns a course in scope.
export async function progressReport(db: SQL, actor: Actor | null, scope: ReportScope, pattern: string, offset: number, limit = 51) {
  const { all } = reportActor(actor);
  const me = actor!.id;
  return db.begin(readOnly, async tx => tx<ProgressReportRow[]>`WITH scope AS (
        SELECT c.id, c.class_id, c.published FROM courses c
        WHERE (${scope.yearId}::uuid IS NULL OR c.academic_year_id = ${scope.yearId}::uuid)
          AND (${scope.termId}::uuid IS NULL OR c.term_id = ${scope.termId}::uuid)
          AND (${scope.classId}::uuid IS NULL OR c.class_id = ${scope.classId}::uuid)
          AND (${scope.courseId}::uuid IS NULL OR c.id = ${scope.courseId}::uuid)
          AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${me}))
      ), enrolled AS (
        SELECT DISTINCT cm.student_id, cm.class_id FROM class_members cm JOIN scope s ON s.class_id = cm.class_id
      )
      SELECT u.id AS "studentId", u.display_name AS "studentName",
        (SELECT p.identifier FROM user_profiles p JOIN roles ro ON ro.id = p.role_id WHERE p.user_id = u.id AND ro.key = 'student') AS identifier,
        cl.name AS "className",
        (SELECT count(*)::int FROM scope s WHERE s.class_id = e.class_id) AS courses,
        lessons.total AS lessons, lessons.done AS completed,
        round(100.0 * lessons.done / nullif(lessons.total, 0), 1)::float AS "lessonRate",
        work.activities, work.submitted, work.graded, work."averageScore",
        tries.attempts, tries."averageAttemptScore",
        (SELECT COALESCE(sum(x.points), 0)::int FROM xp_entries x JOIN scope s ON s.id = x.course_id WHERE x.student_id = u.id) AS xp
      FROM enrolled e JOIN users u ON u.id = e.student_id AND u.is_active JOIN classes cl ON cl.id = e.class_id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS total, count(lc.student_id)::int AS done
        FROM lessons l JOIN course_modules mo ON mo.id = l.module_id JOIN scope s ON s.id = l.course_id AND s.class_id = e.class_id
        LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.student_id = u.id
        WHERE s.published AND mo.published AND l.published AND l.archived_at IS NULL AND mo.archived_at IS NULL
      ) lessons
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS activities, count(sub.id)::int AS submitted, count(g.score)::int AS graded, round(avg(g.score), 1)::float AS "averageScore"
        FROM activities a JOIN scope s ON s.id = a.course_id AND s.class_id = e.class_id
        LEFT JOIN submissions sub ON sub.activity_id = a.id AND sub.student_id = u.id
        LEFT JOIN LATERAL (SELECT sg.score FROM submission_grades sg WHERE sg.submission_id = sub.id ORDER BY sg.created_at DESC, sg.id DESC LIMIT 1) g ON true
        WHERE a.kind = 'assignment' AND a.published AND a.archived_at IS NULL AND s.published
      ) work
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS attempts, round(avg(100.0 * COALESCE((SELECT adj.score FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id ORDER BY adj.created_at DESC, adj.id DESC LIMIT 1), t.score) / t.max_score), 1)::float AS "averageAttemptScore"
        FROM attempts t JOIN activities a ON a.id = t.activity_id JOIN scope s ON s.id = a.course_id AND s.class_id = e.class_id
        WHERE t.student_id = u.id AND t.submitted_at IS NOT NULL
      ) tries
      WHERE u.display_name ILIKE ${pattern}
      ORDER BY u.display_name, u.id LIMIT ${limit} OFFSET ${offset}`);
}

// The audit report keeps audit.view: it is an administrative view, not a course report.
// Timestamps go out as ISO UTC rather than PostgreSQL text: the raw form carries microseconds
// and a space separator, which browsers refuse to parse.
export async function auditReport(db: SQL, actor: Actor | null, filters: { event: string; actorId: string | null; from: string | null; to: string | null },
  timezone: string, pattern: string, offset: number, limit = 51) {
  requirePermission(actor, "audit.view");
  return db<AuditReportRow[]>`SELECT a.id, a.event, u.display_name AS actor, a.resource_type AS "resourceType",
      a.resource_id::text AS "resourceId", a.request_id::text AS "requestId",
      to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    WHERE (a.event ILIKE ${pattern} OR u.display_name ILIKE ${pattern})
      AND (${filters.event} = '' OR a.event = ${filters.event})
      AND (${filters.actorId}::uuid IS NULL OR a.actor_id = ${filters.actorId}::uuid)
      AND (${filters.from}::text IS NULL OR a.created_at >= (${filters.from}::text || ' 00:00')::timestamp AT TIME ZONE ${timezone})
      AND (${filters.to}::text IS NULL OR a.created_at < ((${filters.to}::text || ' 00:00')::timestamp + interval '1 day') AT TIME ZONE ${timezone})
    ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`;
}

// An export is an administrative read of many rows at once, so it is audited with the
// filter it ran under. Identifiers only: audit rows never carry exported content.
export async function recordExport(db: SQL, actor: Actor, kind: ReportKind, scope: ReportScope, requestId: string) {
  await recordAudit(db, actor.id, `report.${kind}.exported`, "reports", scope.courseId ?? scope.classId ?? scope.termId ?? scope.yearId, requestId);
}
