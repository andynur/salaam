import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { attendanceInput, meetingInput, operationInput } from "./input";
import { checkinState } from "./checkin";
import type { AttendanceCounts, AttendanceReport, AttendanceRow, Meeting, MeetingDetail } from "../../shared/attendance";
export const conflict = () => new HttpError(409, "STALE_ATTENDANCE", "Data sesi berubah. Muat ulang sebelum menyimpan.");
export function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }
export async function sessionRow(tx: SQL, courseId: string, sessionId: string, lock: boolean | "share" = false) {
  if (lock === "share") await tx`SELECT id FROM classroom_sessions WHERE id = ${sessionId} AND course_id = ${courseId} FOR SHARE`;
  else if (lock) await tx`SELECT id FROM classroom_sessions WHERE id = ${sessionId} AND course_id = ${courseId} FOR UPDATE`;
  const [row] = await tx<(Meeting & { lastOperation: unknown })[]>`SELECT id, course_id AS "courseId", title, starts_at::text AS "startsAt", ends_at::text AS "endsAt", status, version, note, reason, last_operation AS "lastOperation" FROM classroom_sessions WHERE id = ${sessionId} AND course_id = ${courseId}`;
  if (!row) notFound();
  return row;
}
export async function canReadMeeting(db: SQL, actor: Actor, courseId: string, sessionId: string) {
  return db.begin(async tx => {
    const access = await courseAccess(tx, actor, courseId, "view", "share");
    await sessionRow(tx, courseId, sessionId);
    if (!access.course.canManage && !(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${actor.id}`).length) notFound();
    return access;
  });
}
export async function createMeeting(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const input = meetingInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const payload = JSON.stringify({ courseId, ...input });
    const [existing] = await tx`SELECT id, creation_payload = ${payload}::text::jsonb AS same FROM classroom_sessions WHERE created_by = ${actor.id} AND request_key = ${input.requestKey}`;
    if (existing) { if (!existing.same) throw conflict(); return { id: existing.id }; }
    const roster = await tx`SELECT u.id, u.display_name, (SELECT p.identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE p.user_id = u.id AND r.key = 'student') AS identifier
      FROM class_members m JOIN users u ON u.id = m.student_id JOIN courses c ON c.class_id = m.class_id
      WHERE c.id = ${courseId} AND u.is_active ORDER BY u.id LIMIT 501`;
    if (roster.length > 500) throw new HttpError(400, "ROSTER_LIMIT", "Satu sesi maksimal 500 santri.");
    const [row] = await tx`INSERT INTO classroom_sessions (course_id, title, starts_at, ends_at, note, created_by, request_key, creation_payload)
      VALUES (${courseId}, ${input.title}, ${input.startsAt}, ${input.endsAt}, ${input.note}, ${actor.id}, ${input.requestKey}, ${payload}::text::jsonb) RETURNING id`;
    for (const student of roster) await tx`INSERT INTO classroom_roster (session_id, student_id, student_name, identifier) VALUES (${row.id}, ${student.id}, ${student.display_name}, ${student.identifier})`;
    await recordAudit(tx, actor.id, "classroom.session.created", "classroom_sessions", row.id, requestId);
    return { id: row.id as string };
  });
}
export async function listMeetings(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number) {
  return db.begin(async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view", "share");
    const rows = await tx<Meeting[]>`SELECT s.id, s.course_id AS "courseId", s.title, s.starts_at::text AS "startsAt", s.ends_at::text AS "endsAt", s.status, s.version,
      CASE WHEN ${course.canManage} THEN s.note END AS note, CASE WHEN ${course.canManage} THEN s.reason END AS reason
      FROM classroom_sessions s WHERE s.course_id = ${courseId} AND s.title ILIKE ${pattern}
      AND (${course.canManage} OR EXISTS (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = ${actor.id}))
      ORDER BY s.starts_at DESC, s.id LIMIT 51 OFFSET ${offset}`;
    return { course, ...page(rows, offset) };
  });
}
export async function meetingDetail(db: SQL, actor: Actor, courseId: string, sessionId: string, pattern: string, offset: number): Promise<MeetingDetail> {
  return db.begin(async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view", "share");
    const { lastOperation, ...session } = await sessionRow(tx, courseId, sessionId);
    if (!course.canManage) {
      if (!(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${actor.id}`).length) notFound();
      session.note = null; session.reason = null;
    }
    const rows = await tx<AttendanceRow[]>`SELECT r.student_id AS "studentId", r.student_name AS "studentName", r.identifier,
      a.id AS "recordId", a.status, CASE WHEN ${course.canManage} THEN a.note END AS note, a.created_at::text AS "recordedAt"
      FROM classroom_roster r LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
        AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)
      WHERE r.session_id = ${sessionId} AND (${course.canManage} OR r.student_id = ${actor.id})
        AND (r.student_name ILIKE ${pattern} OR r.identifier ILIKE ${pattern})
      ORDER BY r.student_name, r.student_id LIMIT 51 OFFSET ${offset}`;
    const [counts] = await tx<AttendanceCounts[]>`SELECT count(*)::int AS total, count(*) FILTER (WHERE a.id IS NULL)::int AS unrecorded,
      count(*) FILTER (WHERE a.status = 'present')::int AS present, count(*) FILTER (WHERE a.status = 'late')::int AS late,
      count(*) FILTER (WHERE a.status = 'excused')::int AS excused, count(*) FILTER (WHERE a.status = 'sick')::int AS sick, count(*) FILTER (WHERE a.status = 'absent')::int AS absent
      FROM classroom_roster r LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
        AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)
      WHERE r.session_id = ${sessionId} AND (${course.canManage} OR r.student_id = ${actor.id})`;
    return { course, session, roster: page(rows, offset), counts: counts!, checkin: await checkinState(tx, actor, sessionId, course.canManage) };
  });
}
export async function recordAttendance(db: SQL, actor: Actor, courseId: string, sessionId: string, studentId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const input = attendanceInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const session = await sessionRow(tx, courseId, sessionId, true);
    if (!(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${studentId}`).length) notFound();
    const [latest] = await tx`SELECT a.* FROM attendance_records a WHERE a.session_id = ${sessionId} AND a.student_id = ${studentId}
      AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)`;
    if (latest && latest.previous_id === input.previousId && latest.status === input.status && latest.note === input.note) return { id: latest.id as string };
    if (session.status !== "open") throw new HttpError(409, "SESSION_NOT_OPEN", "Buka sesi sebelum mencatat atau mengoreksi kehadiran.");
    if ((latest?.id ?? null) !== input.previousId) throw conflict();
    const [row] = await tx`INSERT INTO attendance_records (session_id, student_id, status, note, recorded_by, previous_id)
      VALUES (${sessionId}, ${studentId}, ${input.status}, ${input.note}, ${actor.id}, ${input.previousId}) RETURNING id`;
    await tx`UPDATE classroom_sessions SET version = version + 1, last_operation = NULL, updated_at = clock_timestamp() WHERE id = ${sessionId}`;
    await recordAudit(tx, actor.id, "classroom.attendance.recorded", "attendance_records", row.id, requestId);
    return { id: row.id as string };
  });
}
export async function changeMeeting(db: SQL, actor: Actor, courseId: string, sessionId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const input = operationInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const session = await sessionRow(tx, courseId, sessionId, true);
    const operation = JSON.stringify(input);
    const [retry] = await tx`SELECT last_operation = ${operation}::text::jsonb AS same FROM classroom_sessions WHERE id = ${sessionId}`;
    if (retry.same) return { id: sessionId };
    if (session.version !== input.version) throw conflict();
    const allowed = input.action === "note" ? session.status !== "cancelled" : input.action === "open" ? session.status === "scheduled" : input.action === "close" ? session.status === "open" : input.action === "reopen" ? session.status === "closed" : ["scheduled", "open"].includes(session.status);
    if (!allowed) throw new HttpError(409, "INVALID_TRANSITION", "Perubahan status sesi tidak tersedia.");
    if (input.action === "open" && !(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} LIMIT 1`).length) throw new HttpError(409, "EMPTY_ROSTER", "Sesi tanpa santri tidak dapat dibuka.");
    if (input.action === "close" && (await tx`SELECT 1 FROM classroom_roster r WHERE r.session_id = ${sessionId} AND NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.session_id = r.session_id AND a.student_id = r.student_id) LIMIT 1`).length) throw new HttpError(409, "INCOMPLETE_ATTENDANCE", "Catat kehadiran seluruh santri sebelum menutup sesi.");
    const status = input.action === "open" || input.action === "reopen" ? "open" : input.action === "close" ? "closed" : input.action === "cancel" ? "cancelled" : session.status;
    await tx`UPDATE classroom_sessions SET status = ${status}, note = ${input.action === "note" ? input.note : session.note}, reason = ${input.reason}, version = version + 1,
      last_operation = ${operation}::text::jsonb, updated_at = clock_timestamp() WHERE id = ${sessionId}`;
    await tx`INSERT INTO classroom_session_events (session_id, actor_id, version, action, reason, note) VALUES (${sessionId}, ${actor.id}, ${session.version + 1}, ${input.action}, ${input.reason}, ${input.action === "note" ? input.note : session.note})`;
    const event = { open: "opened", close: "closed", reopen: "reopened", cancel: "cancelled", note: "note_updated" }[input.action];
    await recordAudit(tx, actor.id, `classroom.session.${event}`, "classroom_sessions", sessionId, requestId);
    return { id: sessionId };
  });
}
export async function attendanceReport(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number) {
  return db.begin(async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view", "share");
    const rows = await tx<AttendanceReport[]>`SELECT r.student_id AS "studentId", max(r.student_name) AS "studentName", count(*)::int AS total,
      count(*) FILTER (WHERE a.id IS NULL)::int AS unrecorded,
      count(*) FILTER (WHERE a.status = 'present')::int AS present, count(*) FILTER (WHERE a.status = 'late')::int AS late,
      count(*) FILTER (WHERE a.status = 'excused')::int AS excused, count(*) FILTER (WHERE a.status = 'sick')::int AS sick, count(*) FILTER (WHERE a.status = 'absent')::int AS absent,
      count(*) FILTER (WHERE s.status = 'closed')::int AS closed,
      count(*) FILTER (WHERE s.status = 'closed' AND a.status IN ('present', 'late'))::int AS attended,
      round(100.0 * count(*) FILTER (WHERE s.status = 'closed' AND a.status IN ('present', 'late')) / nullif(count(*) FILTER (WHERE s.status = 'closed'), 0), 1)::float AS rate
      FROM classroom_roster r JOIN classroom_sessions s ON s.id = r.session_id
      LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)
      WHERE s.course_id = ${courseId} AND s.status <> 'cancelled' AND (${course.canManage} OR r.student_id = ${actor.id}) AND r.student_name ILIKE ${pattern}
      GROUP BY r.student_id ORDER BY "studentName", r.student_id LIMIT 51 OFFSET ${offset}`;
    return { course, ...page(rows, offset) };
  });
}
