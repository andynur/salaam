import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { attendanceInput, bulkAttendanceInput, meetingInput, meetingSeriesInput, operationInput, rosterAdjustmentInput } from "./input";
import { checkinState } from "./checkin";
import { fileResponse, recordStoredFile, uploadInput, withFileCleanup } from "../../core/storage/files";
import type { AttendanceCounts, AttendanceDocumentation, AttendanceReport, AttendanceRow, Meeting, MeetingDetail, QrBreakdown, RosterOption, SessionEvent } from "../../shared/attendance";
export const conflict = () => new HttpError(409, "STALE_ATTENDANCE", "Data sesi berubah. Muat ulang sebelum menyimpan.");
export function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }
export async function sessionRow(tx: SQL, courseId: string, sessionId: string, lock: boolean | "share" = false) {
  if (lock === "share") await tx`SELECT id FROM classroom_sessions WHERE id = ${sessionId} AND course_id = ${courseId} FOR SHARE`;
  else if (lock) await tx`SELECT id FROM classroom_sessions WHERE id = ${sessionId} AND course_id = ${courseId} FOR UPDATE`;
  const [row] = await tx<(Meeting & { lastOperation: unknown })[]>`SELECT id, course_id AS "courseId", title, starts_at::text AS "startsAt", ends_at::text AS "endsAt", status, version, note, reason, series_id AS "seriesId", occurrence_index AS "occurrenceIndex", last_operation AS "lastOperation" FROM classroom_sessions WHERE id = ${sessionId} AND course_id = ${courseId}`;
  if (!row) notFound();
  return row;
}
export async function canReadMeeting(db: SQL, actor: Actor, courseId: string, sessionId: string) {
  return db.begin(async tx => {
    const access = await courseAccess(tx, actor, courseId, "view", "share");
    await sessionRow(tx, courseId, sessionId);
    if (!access.course.canManage && !(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${actor.id} AND removed_at IS NULL`).length) notFound();
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
export async function createMeetingSeries(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const input = meetingSeriesInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const payload = JSON.stringify({ courseId, ...input });
    const [existing] = await tx`SELECT id, creation_payload = ${payload}::text::jsonb AS same FROM classroom_meeting_series WHERE created_by = ${actor.id} AND request_key = ${input.requestKey}`;
    if (existing) { if (!existing.same) throw conflict(); return { id: existing.id as string, created: 0 }; }
    const roster = await tx`SELECT u.id, u.display_name, (SELECT p.identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE p.user_id = u.id AND r.key = 'student') AS identifier
      FROM class_members m JOIN users u ON u.id = m.student_id JOIN courses c ON c.class_id = m.class_id
      WHERE c.id = ${courseId} AND u.is_active ORDER BY u.id LIMIT 501`;
    if (roster.length > 500) throw new HttpError(400, "ROSTER_LIMIT", "Satu sesi maksimal 500 santri.");
    const [series] = await tx`INSERT INTO classroom_meeting_series (course_id, title, starts_at, ends_at, interval_days, occurrence_count, note, qr_rotate_seconds, qr_late_after_minutes, created_by, request_key, creation_payload)
      VALUES (${courseId}, ${input.title}, ${input.startsAt}, ${input.endsAt}, ${input.intervalDays}, ${input.occurrenceCount}, ${input.note}, ${input.qrRotateSeconds}, ${input.qrLateAfterMinutes}, ${actor.id}, ${input.requestKey}, ${payload}::text::jsonb) RETURNING id`;
    for (let index = 1; index <= input.occurrenceCount; index++) {
      const [row] = await tx`INSERT INTO classroom_sessions (course_id, title, starts_at, ends_at, note, created_by, request_key, creation_payload, series_id, occurrence_index)
        VALUES (${courseId}, ${input.title}, ${input.startsAt}::timestamptz + make_interval(days => ${(index - 1) * input.intervalDays}), ${input.endsAt}::timestamptz + make_interval(days => ${(index - 1) * input.intervalDays}), ${input.note}, ${actor.id}, ${crypto.randomUUID()}, ${payload}::text::jsonb, ${series!.id}, ${index}) RETURNING id`;
      for (const student of roster) await tx`INSERT INTO classroom_roster (session_id, student_id, student_name, identifier) VALUES (${row!.id}, ${student.id}, ${student.display_name}, ${student.identifier})`;
      await recordAudit(tx, actor.id, "classroom.session.created_from_series", "classroom_sessions", row!.id, requestId);
    }
    await recordAudit(tx, actor.id, "classroom.session_series.created", "classroom_meeting_series", series!.id, requestId);
    return { id: series!.id as string, created: input.occurrenceCount };
  });
}
export async function listMeetings(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number) {
  return db.begin(async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view", "share");
    const rows = await tx<Meeting[]>`SELECT s.id, s.course_id AS "courseId", s.title, s.starts_at::text AS "startsAt", s.ends_at::text AS "endsAt", s.status, s.version,
      CASE WHEN ${course.canManage} THEN s.note END AS note, CASE WHEN ${course.canManage} THEN s.reason END AS reason
      FROM classroom_sessions s WHERE s.course_id = ${courseId} AND s.title ILIKE ${pattern}
      AND (${course.canManage} OR EXISTS (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = ${actor.id} AND r.removed_at IS NULL))
      ORDER BY s.starts_at DESC, s.id LIMIT 51 OFFSET ${offset}`;
    return { course, ...page(rows, offset) };
  });
}
export async function meetingDetail(db: SQL, actor: Actor, courseId: string, sessionId: string, pattern: string, offset: number): Promise<MeetingDetail> {
  return db.begin(async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view", "share");
    const { lastOperation, ...session } = await sessionRow(tx, courseId, sessionId);
    if (!course.canManage) {
      if (!(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${actor.id} AND removed_at IS NULL`).length) notFound();
      session.note = null; session.reason = null;
    }
    const rows = await tx<AttendanceRow[]>`SELECT r.student_id AS "studentId", r.student_name AS "studentName", r.identifier,
      a.id AS "recordId", a.status, CASE WHEN ${course.canManage} THEN a.note END AS note, a.created_at::text AS "recordedAt",
      CASE WHEN ${course.canManage} THEN c.status END AS "checkinStatus", CASE WHEN ${course.canManage} THEN c.created_at::text END AS "checkedInAt"
      FROM classroom_roster r LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
        AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)
      LEFT JOIN attendance_checkins c ON c.session_id = r.session_id AND c.student_id = r.student_id
      WHERE r.session_id = ${sessionId} AND r.removed_at IS NULL AND (${course.canManage} OR r.student_id = ${actor.id})
        AND (r.student_name ILIKE ${pattern} OR r.identifier ILIKE ${pattern})
      ORDER BY r.student_name, r.student_id LIMIT 51 OFFSET ${offset}`;
    const [counts] = await tx<AttendanceCounts[]>`SELECT count(*)::int AS total, count(*) FILTER (WHERE a.id IS NULL)::int AS unrecorded,
      count(*) FILTER (WHERE a.status = 'present')::int AS present, count(*) FILTER (WHERE a.status = 'late')::int AS late,
      count(*) FILTER (WHERE a.status = 'excused')::int AS excused, count(*) FILTER (WHERE a.status = 'sick')::int AS sick, count(*) FILTER (WHERE a.status = 'absent')::int AS absent
      FROM classroom_roster r LEFT JOIN attendance_records a ON a.session_id = r.session_id AND a.student_id = r.student_id
        AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)
      WHERE r.session_id = ${sessionId} AND r.removed_at IS NULL AND (${course.canManage} OR r.student_id = ${actor.id})`;
    const [qrBreakdown] = await tx<QrBreakdown[]>`SELECT count(c.*)::int AS scanned,
      count(c.*) FILTER (WHERE c.status = 'present')::int AS present,
      count(c.*) FILTER (WHERE c.status = 'late')::int AS late,
      (count(r.*) - count(c.*))::int AS unscanned FROM classroom_roster r
      LEFT JOIN attendance_checkins c ON c.session_id = r.session_id AND c.student_id = r.student_id
      WHERE r.session_id = ${sessionId} AND r.removed_at IS NULL AND (${course.canManage} OR r.student_id = ${actor.id})`;
    const documentations = (course.canManage || course.canAssist) ? await tx<AttendanceDocumentation[]>`SELECT d.id, d.caption, d.uploaded_by AS "uploadedBy", u.display_name AS "uploaderName", d.created_at::text AS "createdAt",
      json_build_object('id', f.id, 'name', f.original_name, 'mediaType', f.media_type, 'sizeBytes', f.size_bytes) AS file
      FROM attendance_documentations d JOIN stored_files f ON f.id = d.file_id JOIN users u ON u.id = d.uploaded_by
      WHERE d.session_id = ${sessionId} ORDER BY d.created_at DESC, d.id DESC` : [];
    return { course, session, roster: page(rows, offset), counts: counts!, qrBreakdown: qrBreakdown!, checkin: await checkinState(tx, actor, sessionId, course.canManage), documentations };
  });
}

async function attendanceAccess(tx: SQL, actor: Actor, courseId: string, lock: boolean | "share" = false) {
  const access = await courseAccess(tx, actor, courseId, "view", lock);
  if (!access.course.canManage && !access.course.canAssist) notFound();
  return access;
}

export async function addDocumentation(db: SQL, storageRoot: string, actor: Actor, courseId: string, sessionId: string, file: File | null, caption: string, requestId: string) {
  if (!file) throw new HttpError(400, "PHOTO_REQUIRED", "Lampirkan satu foto dokumentasi.");
  const upload = await uploadInput(file);
  if (!upload.mediaType.startsWith("image/")) throw new HttpError(400, "PHOTO_REQUIRED", "Dokumentasi harus berupa foto PNG, JPG, atau WebP.");
  const text = caption.trim();
  if (text.length > 500) throw new HttpError(400, "INVALID_INPUT", "Keterangan maksimal 500 karakter.");
  return withFileCleanup(storageRoot, upload, store => db.begin(async tx => {
    await attendanceAccess(tx, actor, courseId, true);
    await sessionRow(tx, courseId, sessionId, "share");
    await recordStoredFile(tx, courseId, actor.id, upload);
    const [row] = await tx<{ id: string }[]>`INSERT INTO attendance_documentations (session_id, file_id, caption, uploaded_by)
      VALUES (${sessionId}, ${upload.id}, ${text}, ${actor.id}) RETURNING id`;
    await recordAudit(tx, actor.id, "classroom.attendance.documentation_uploaded", "attendance_documentations", row!.id, requestId);
    await store();
    return { id: row!.id };
  }));
}

export async function documentationFile(db: SQL, storageRoot: string, actor: Actor, courseId: string, sessionId: string, documentationId: string) {
  return db.begin(async tx => {
    await attendanceAccess(tx, actor, courseId, "share");
    await sessionRow(tx, courseId, sessionId, "share");
    const [file] = await tx<{ id: string; name: string; mediaType: string; sizeBytes: number }[]>`SELECT f.id, f.original_name AS name, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes"
      FROM attendance_documentations d JOIN stored_files f ON f.id = d.file_id WHERE d.id = ${documentationId} AND d.session_id = ${sessionId}`;
    if (!file) notFound();
    return fileResponse(storageRoot, file, "inline");
  });
}
export async function rosterOptions(db: SQL, actor: Actor, courseId: string, sessionId: string): Promise<RosterOption[]> {
  requirePermission(actor, "learning.manage");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", "share");
    await sessionRow(tx, courseId, sessionId, "share");
    return tx<RosterOption[]>`SELECT u.id AS "studentId", u.display_name AS "studentName",
      (SELECT p.identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE p.user_id = u.id AND r.key = 'student') AS identifier
      FROM class_members m JOIN users u ON u.id = m.student_id JOIN classroom_sessions s ON s.course_id = ${courseId}
      JOIN courses c ON c.id = s.course_id AND c.class_id = m.class_id
      WHERE s.id = ${sessionId} AND u.is_active AND NOT EXISTS
        (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = u.id AND r.removed_at IS NULL)
      ORDER BY u.display_name, u.id LIMIT 500`;
  });
}
export async function adjustRoster(db: SQL, actor: Actor, courseId: string, sessionId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const input = rosterAdjustmentInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const current = await sessionRow(tx, courseId, sessionId, true);
    if (current.version !== input.version) throw conflict();
    if (!["scheduled", "open"].includes(current.status)) throw new HttpError(409, "ROSTER_LOCKED", "Roster hanya dapat diubah pada sesi terjadwal atau berlangsung.");
    if (input.scope === "future_series" && !current.seriesId) throw new HttpError(409, "NOT_RECURRING", "Sesi ini bukan bagian dari seri berulang.");
    const sessions = await tx<Meeting[]>`SELECT id, course_id AS "courseId", title, starts_at::text AS "startsAt", ends_at::text AS "endsAt", status, version, note, reason
      FROM classroom_sessions WHERE course_id = ${courseId} AND (id = ${sessionId} OR (series_id = ${current.seriesId}
        AND starts_at >= ${current.startsAt} AND status IN ('scheduled', 'open'))) ORDER BY starts_at, id FOR UPDATE`;
    const [student] = await tx<RosterOption[]>`SELECT u.id AS "studentId", u.display_name AS "studentName",
      (SELECT p.identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE p.user_id = u.id AND r.key = 'student') AS identifier
      FROM class_members m JOIN users u ON u.id = m.student_id JOIN courses c ON c.class_id = m.class_id
      WHERE c.id = ${courseId} AND u.id = ${input.studentId} AND u.is_active`;
    if (!student) notFound();
    let affectedSessions = 0;
    for (const session of sessions) {
      const [existing] = await tx<{ removedAt: string | null }[]>`SELECT removed_at::text AS "removedAt" FROM classroom_roster WHERE session_id = ${session.id} AND student_id = ${input.studentId} FOR UPDATE`;
      const alreadyActive = !!existing && existing.removedAt === null;
      if (input.active === alreadyActive) continue;
      if (input.active) {
        if (existing) await tx`UPDATE classroom_roster SET student_name = ${student.studentName}, identifier = ${student.identifier}, removed_at = NULL, removed_by = NULL WHERE session_id = ${session.id} AND student_id = ${input.studentId}`;
        else {
          const [capacity] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM classroom_roster WHERE session_id = ${session.id} AND removed_at IS NULL`;
          if ((capacity?.count ?? 0) >= 500) throw new HttpError(400, "ROSTER_LIMIT", "Satu sesi maksimal 500 santri.");
          await tx`INSERT INTO classroom_roster (session_id, student_id, student_name, identifier) VALUES (${session.id}, ${input.studentId}, ${student.studentName}, ${student.identifier})`;
        }
      } else if (existing) await tx`UPDATE classroom_roster SET removed_at = clock_timestamp(), removed_by = ${actor.id} WHERE session_id = ${session.id} AND student_id = ${input.studentId}`;
      else continue;
      await tx`UPDATE classroom_sessions SET version = version + 1, last_operation = NULL, updated_at = clock_timestamp() WHERE id = ${session.id}`;
      await tx`INSERT INTO classroom_session_events (session_id, actor_id, version, action, reason, note) VALUES (${session.id}, ${actor.id}, ${session.version + 1}, 'roster', '', ${input.active ? "Santri ditambahkan ke roster." : "Santri dikeluarkan dari roster."})`;
      affectedSessions++;
    }
    if (affectedSessions) await recordAudit(tx, actor.id, "classroom.roster.updated", "classroom_sessions", sessionId, requestId);
    return { sessionId, studentId: input.studentId, active: input.active, affectedSessions };
  });
}
export async function recordAttendance(db: SQL, actor: Actor, courseId: string, sessionId: string, studentId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "attendance.manage");
  const input = attendanceInput(body);
  return db.begin(async tx => {
    await attendanceAccess(tx, actor, courseId, true);
    const session = await sessionRow(tx, courseId, sessionId, true);
    if (!(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${studentId} AND removed_at IS NULL`).length) notFound();
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
export async function recordAttendanceBulk(db: SQL, actor: Actor, courseId: string, sessionId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "attendance.manage");
  const input = bulkAttendanceInput(body);
  return db.begin(async tx => {
    await attendanceAccess(tx, actor, courseId, true);
    const session = await sessionRow(tx, courseId, sessionId, true);
    if (session.status !== "open") throw new HttpError(409, "SESSION_NOT_OPEN", "Buka sesi sebelum mencatat kehadiran.");
    const seen = new Set<string>();
    let recorded = 0;
    for (const item of input.records) {
      if (seen.has(item.studentId)) throw new HttpError(400, "DUPLICATE_STUDENT", "Santri tidak boleh dipilih lebih dari sekali.");
      seen.add(item.studentId);
      if (!(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${item.studentId} AND removed_at IS NULL`).length) notFound();
      const [latest] = await tx`SELECT a.* FROM attendance_records a WHERE a.session_id = ${sessionId} AND a.student_id = ${item.studentId}
        AND NOT EXISTS (SELECT 1 FROM attendance_records child WHERE child.previous_id = a.id)`;
      if (latest && latest.previous_id === item.previousId && latest.status === item.status && latest.note === item.note) continue;
      if ((latest?.id ?? null) !== item.previousId) throw conflict();
      await tx`INSERT INTO attendance_records (session_id, student_id, status, note, recorded_by, previous_id)
        VALUES (${sessionId}, ${item.studentId}, ${item.status}, ${item.note}, ${actor.id}, ${item.previousId})`;
      recorded++;
    }
    if (recorded) {
      await tx`UPDATE classroom_sessions SET version = version + 1, last_operation = NULL, updated_at = clock_timestamp() WHERE id = ${sessionId}`;
      await recordAudit(tx, actor.id, "classroom.attendance.bulk_recorded", "classroom_sessions", sessionId, requestId);
    }
    return { recorded };
  });
}
export async function sessionHistory(db: SQL, actor: Actor, courseId: string, sessionId: string, offset: number) {
  requirePermission(actor, "learning.manage");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", "share");
    await sessionRow(tx, courseId, sessionId, "share");
    const rows = await tx<SessionEvent[]>`SELECT e.id, e.session_id AS "sessionId", e.actor_id AS "actorId", u.display_name AS "actorName",
      e.version, e.action, e.reason, e.note, e.created_at::text AS "createdAt"
      FROM classroom_session_events e JOIN users u ON u.id = e.actor_id WHERE e.session_id = ${sessionId}
      ORDER BY e.version DESC, e.id DESC LIMIT 51 OFFSET ${offset}`;
    return page(rows, offset);
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
    if (input.action === "open" && !(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND removed_at IS NULL LIMIT 1`).length) throw new HttpError(409, "EMPTY_ROSTER", "Sesi tanpa santri tidak dapat dibuka.");
    if (input.action === "close" && (await tx`SELECT 1 FROM classroom_roster r WHERE r.session_id = ${sessionId} AND r.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM attendance_records a WHERE a.session_id = r.session_id AND a.student_id = r.student_id) LIMIT 1`).length) throw new HttpError(409, "INCOMPLETE_ATTENDANCE", "Catat kehadiran seluruh santri sebelum menutup sesi.");
    const status = input.action === "open" || input.action === "reopen" ? "open" : input.action === "close" ? "closed" : input.action === "cancel" ? "cancelled" : session.status;
    await tx`UPDATE classroom_sessions SET status = ${status}, note = ${input.action === "note" ? input.note : session.note}, reason = ${input.reason}, version = version + 1,
      last_operation = ${operation}::text::jsonb, updated_at = clock_timestamp() WHERE id = ${sessionId}`;
    // Recurring sessions opt into their configured QR window automatically;
    // ordinary sessions wait for the teacher's explicit QR action.
    if (input.action === "open" && (await tx`SELECT 1 FROM classroom_sessions WHERE id = ${sessionId} AND series_id IS NOT NULL`).length) {
      await tx`INSERT INTO attendance_checkin_windows (session_id, status, rotate_seconds, late_after, opened_by)
        SELECT ${sessionId}, 'open', COALESCE(series.qr_rotate_seconds, 30),
          CASE WHEN series.qr_late_after_minutes IS NULL THEN NULL ELSE session.starts_at + make_interval(mins => series.qr_late_after_minutes) END,
          ${actor.id}
        FROM classroom_sessions session LEFT JOIN classroom_meeting_series series ON series.id = session.series_id
        WHERE session.id = ${sessionId} ON CONFLICT (session_id) DO UPDATE SET status = 'open', updated_at = clock_timestamp()`;
    }
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
      WHERE s.course_id = ${courseId} AND s.status <> 'cancelled' AND r.removed_at IS NULL AND (${course.canManage} OR r.student_id = ${actor.id}) AND r.student_name ILIKE ${pattern}
      GROUP BY r.student_id ORDER BY "studentName", r.student_id LIMIT 51 OFFSET ${offset}`;
    return { course, ...page(rows, offset) };
  });
}
