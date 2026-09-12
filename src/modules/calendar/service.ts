import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { recordAudit } from "../../core/audit/repository";
import { HttpError } from "../../core/errors";
import { idField } from "../../core/validation";
import { courseAccess, notFound } from "../learning/access";
import { eventInput, rangeInput, versionInput } from "./input";
import type { AcademicCalendarData, CalendarEntry } from "../../shared/calendar";
const changed = () => new HttpError(409, "EVENT_CHANGED", "Acara sudah berubah. Muat ulang sebelum menyimpan.");
export async function academicCalendar(db: SQL, actor: Actor, url: URL): Promise<AcademicCalendarData> {
  requirePermission(actor, "dashboard:view");
  const canManage = actor.permissions.includes("academic.manage");
  const requestedYear = url.searchParams.get("yearId");
  const requestedClass = url.searchParams.get("classId");
  const requestedYearId = canManage && requestedYear ? idField({ yearId: requestedYear }, "yearId") : null;
  const requestedClassId = requestedClass ? idField({ classId: requestedClass }, "classId") : null;
  const [selected] = await db<AcademicCalendarData["years"]>`SELECT id, name, starts_on::text AS "startsOn", ends_on::text AS "endsOn"
    FROM academic_years WHERE archived_at IS NULL AND (${requestedYearId}::uuid IS NULL OR id = ${requestedYearId}::uuid)
    ORDER BY (CURRENT_DATE BETWEEN starts_on AND ends_on) DESC, starts_on DESC LIMIT 1`;
  if (!selected) throw new HttpError(404, "NOT_FOUND", "Tahun ajaran belum tersedia.");
  const years = canManage ? await db<AcademicCalendarData["years"]>`SELECT id, name, starts_on::text AS "startsOn", ends_on::text AS "endsOn"
    FROM academic_years WHERE archived_at IS NULL ORDER BY starts_on DESC` : [selected];
  const classes = await db<AcademicCalendarData["classes"]>`SELECT id, name FROM classes
    WHERE academic_year_id = ${selected.id} AND archived_at IS NULL ORDER BY name`;
  const classFilter = canManage ? requestedClassId : null;
  const events = await db<AcademicCalendarData["events"]>`SELECT e.id, e.academic_year_id AS "academicYearId", e.class_id AS "classId",
    c.name AS "className", e.title, e.description, e.category, e.starts_on::text AS "startsOn", e.ends_on::text AS "endsOn"
    FROM academic_calendar_events e LEFT JOIN classes c ON c.id = e.class_id
    WHERE e.academic_year_id = ${selected.id} AND e.archived_at IS NULL
      AND (${classFilter}::uuid IS NULL OR e.class_id IS NULL OR e.class_id = ${classFilter}::uuid)
      AND (e.class_id IS NULL OR ${canManage} OR EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = e.class_id AND m.student_id = ${actor.id})
        OR EXISTS (SELECT 1 FROM teaching_assignments ta JOIN courses course ON course.id = ta.course_id WHERE ta.teacher_id = ${actor.id} AND course.class_id = e.class_id))
    ORDER BY e.starts_on, e.ends_on, e.id`;
  return { year: selected, years, classes, events, canManage };
}
export async function calendarEntries(db: SQL, actor: Actor, url: URL) {
  requirePermission(actor, "dashboard:view");
  const { from, to, pattern, offset } = rangeInput(url);
  const rows = await db<CalendarEntry[]>`SELECT kind, id, course_id AS "courseId", course_name AS "courseName", lesson_id AS "lessonId", title, description,
    to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt", to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt", version,
    (kind = 'event' AND (can_manage OR (course_id IS NULL AND ${actor.permissions.includes("academic.manage")}))) AS "canManage"
    FROM calendar_audience WHERE user_id = ${actor.id} AND starts_at < ${to}::timestamptz AND ends_at >= ${from}::timestamptz
    AND title ILIKE ${pattern} ORDER BY starts_at, kind, id LIMIT 51 OFFSET ${offset}`;
  return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null };
}
export async function eventDetail(db: SQL, actor: Actor, id: string) {
  requirePermission(actor, "dashboard:view");
  const [row] = await db<CalendarEntry[]>`SELECT kind, id, course_id AS "courseId", course_name AS "courseName", lesson_id AS "lessonId", title, description,
    to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt", to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt", version,
    (can_manage OR (course_id IS NULL AND ${actor.permissions.includes("academic.manage")})) AS "canManage"
    FROM calendar_audience WHERE user_id = ${actor.id} AND kind = 'event' AND id = ${id}`;
  if (!row) notFound();
  return row;
}
async function manage(tx: SQL, actor: Actor, courseId: string | null) {
  if (courseId) await courseAccess(tx, actor, courseId, "manage", true);
  else requirePermission(actor, "academic.manage");
}
export async function createEvent(db: SQL, actor: Actor, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "dashboard:view");
  const input = eventInput(body), key = idField(body, "requestKey"), operation = JSON.stringify(input);
  return db.begin(async tx => {
    await manage(tx, actor, input.courseId);
    // The actor/key advisory lock covers school events, which have no course row to lock.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id + key}, 0))`;
    const [existing] = await tx<{ id: string; same: boolean }[]>`SELECT id, last_operation = ${operation}::text::jsonb AS same
      FROM academic_events WHERE created_by = ${actor.id} AND request_key = ${key}`;
    if (existing) { if (!existing.same) throw changed(); return { id: existing.id }; }
    const [row] = await tx<{ id: string }[]>`INSERT INTO academic_events (course_id, title, description, starts_at, ends_at, created_by, request_key, last_operation)
      VALUES (${input.courseId}, ${input.title}, ${input.description}, ${input.startsAt}, ${input.endsAt}, ${actor.id}, ${key}, ${operation}::text::jsonb) RETURNING id`;
    await recordAudit(tx, actor.id, "calendar.event.created", "academic_events", row!.id, requestId);
    return row!;
  });
}
export async function updateEvent(db: SQL, actor: Actor, id: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "dashboard:view");
  const version = versionInput(body);
  const archive = body.action === "archive";
  const input = archive ? null : eventInput(body);
  const operation = JSON.stringify({ version, archive, input });
  return db.begin(async tx => {
    const [scope] = await tx<{ courseId: string | null }[]>`SELECT course_id AS "courseId" FROM academic_events WHERE id = ${id}`;
    if (!scope) notFound();
    await manage(tx, actor, scope.courseId);
    const [row] = await tx<{ version: number; same: boolean; archived: boolean }[]>`SELECT version, last_operation = ${operation}::text::jsonb AS same,
      archived_at IS NOT NULL AS archived FROM academic_events WHERE id = ${id} FOR UPDATE`;
    if (!row) notFound();
    if (row.same) return { id, version: row.version };
    if (row.version !== version || row.archived) throw changed();
    if (input && input.courseId !== scope.courseId) throw new HttpError(400, "INVALID_INPUT", "Lingkup acara tidak dapat dipindahkan.");
    if (archive) await tx`UPDATE academic_events SET archived_at = clock_timestamp(), version = version + 1, last_operation = ${operation}::text::jsonb WHERE id = ${id}`;
    else await tx`UPDATE academic_events SET title = ${input!.title}, description = ${input!.description}, starts_at = ${input!.startsAt}, ends_at = ${input!.endsAt},
      version = version + 1, last_operation = ${operation}::text::jsonb WHERE id = ${id}`;
    await recordAudit(tx, actor.id, archive ? "calendar.event.archived" : "calendar.event.updated", "academic_events", id, requestId);
    return { id, version: version + 1 };
  });
}
