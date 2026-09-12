import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { recordAudit } from "../../core/audit/repository";
import { notFound } from "../learning/access";
import { preferencesInput } from "./input";
import { calendarHref, maxNotifiableLevel, type CalendarKind, type NotificationItem, type NotificationPreferences } from "../../shared/calendar";
export async function preferences(db: SQL, actor: Actor): Promise<NotificationPreferences> {
  requirePermission(actor, "dashboard:view");
  const [row] = await db<NotificationPreferences[]>`SELECT reminders, level_up AS "levelUp", checkin FROM notification_preferences WHERE user_id = ${actor.id}`;
  return row ?? { reminders: true, levelUp: true, checkin: true };
}
export async function savePreferences(db: SQL, actor: Actor, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "dashboard:view");
  const input = preferencesInput(body);
  return db.begin(async tx => {
    const rows = await tx`INSERT INTO notification_preferences (user_id, reminders, level_up, checkin)
      VALUES (${actor.id}, ${input.reminders}, ${input.levelUp}, ${input.checkin})
      ON CONFLICT (user_id) DO UPDATE SET reminders = EXCLUDED.reminders, level_up = EXCLUDED.level_up, checkin = EXCLUDED.checkin, updated_at = clock_timestamp()
      WHERE (notification_preferences.reminders, notification_preferences.level_up, notification_preferences.checkin)
        IS DISTINCT FROM (EXCLUDED.reminders, EXCLUDED.level_up, EXCLUDED.checkin) RETURNING user_id`;
    if (rows.length) await recordAudit(tx, actor.id, "notification.preferences.updated", "notification_preferences", actor.id, requestId);
    return input;
  });
}
// The same visibility predicate is used for inbox reads and read receipts. Old titles are
// never retained when a source is archived, rescheduled, or no longer accessible.
function visible(db: SQL, actorId: string) {
  return db`SELECT n.*, s.title, s.course_id, s.lesson_id FROM notifications n
    LEFT JOIN calendar_audience s ON s.user_id = n.user_id AND s.kind = n.source_kind AND s.id = n.source_id
    WHERE n.user_id = ${actorId} AND ((n.kind = 'level_up' AND n.source_id = ${actorId})
      OR (s.id IS NOT NULL AND ((n.kind = 'reminder' AND s.starts_at = n.source_at)
        OR (n.kind = 'checkin' AND EXISTS (SELECT 1 FROM attendance_checkin_windows w JOIN classroom_sessions cs ON cs.id = w.session_id
          WHERE w.session_id = n.source_id AND w.status = 'open' AND cs.status = 'open' AND w.updated_at = n.source_at)))))`;
}
export async function inbox(db: SQL, actor: Actor, offset: number, unread: boolean) {
  requirePermission(actor, "dashboard:view");
  const rows = await db<(NotificationItem & { sourceKind: CalendarKind; sourceId: string; courseId: string | null; lessonId: string | null; level: number | null })[]>`
    SELECT id, kind, status, COALESCE(title, 'Level ' || level::text || ' tercapai') AS title, source_kind AS "sourceKind", source_id AS "sourceId",
      course_id AS "courseId", lesson_id AS "lessonId", level, to_char(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "scheduledAt", to_char(delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "deliveredAt", to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt"
    FROM (${visible(db, actor.id)}) n WHERE NOT ${unread} OR (status = 'delivered' AND read_at IS NULL)
    ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ${offset}`;
  return { items: rows.slice(0, 50).map(({ sourceKind, sourceId, courseId, lessonId, level, ...row }) => ({ ...row,
    href: row.kind === "level_up" ? "/gamification" : calendarHref({ kind: sourceKind, id: sourceId, courseId, lessonId }) })), nextOffset: rows.length > 50 ? offset + 50 : null };
}
export async function markRead(db: SQL, actor: Actor, id: string) {
  requirePermission(actor, "dashboard:view");
  const [row] = await db<{ readAt: string }[]>`UPDATE notifications SET read_at = COALESCE(read_at, clock_timestamp())
    WHERE id = ${id} AND status = 'delivered' AND id IN (SELECT id FROM (${visible(db, actor.id)}) visible)
    RETURNING to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt"`;
  if (!row) notFound();
  return row;
}
// A level outside the stored range is skipped rather than rejected: this runs inside the
// transaction that awards the XP, and a missing notice must never roll back a grade or a
// completed lesson. tests/calendar.test.ts fails first if the level table outgrows the range.
export async function enqueueLevel(tx: SQL, studentId: string, level: number) {
  if (level < 2 || level > maxNotifiableLevel) return;
  await tx`INSERT INTO notifications (user_id, kind, source_kind, source_id, level, dedupe_key)
    VALUES (${studentId}, 'level_up', 'level', ${studentId}, ${level}, ${`level:${level}`}) ON CONFLICT DO NOTHING`;
}
export async function enqueueCheckin(tx: SQL, sessionId: string) {
  await tx`INSERT INTO notifications (user_id, kind, source_kind, source_id, source_at, dedupe_key)
    SELECT r.student_id, 'checkin', 'session', w.session_id, w.updated_at, 'checkin:' || w.session_id::text || ':' || extract(epoch FROM w.updated_at)::text
    FROM attendance_checkin_windows w JOIN classroom_roster r ON r.session_id = w.session_id
    WHERE w.session_id = ${sessionId} ON CONFLICT DO NOTHING`;
}
