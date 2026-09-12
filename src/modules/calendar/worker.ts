import type { SQL } from "bun";
import { log } from "../../core/logger";
// Each tick is bounded; the anti-join advances through a backlog without an in-memory
// cursor. A transaction-level advisory lock permits only one worker per database/schema.
export async function notificationTick(db: SQL) {
  return db.begin(async tx => {
    await tx`SET LOCAL statement_timeout = '5s'`;
    const [lock] = await tx<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(current_database() || current_schema() || ':notifications', 0)) AS acquired`;
    if (!lock!.acquired) return { generated: 0, delivered: 0, suppressed: 0 };
    const generated = await tx`INSERT INTO notifications (user_id, kind, source_kind, source_id, source_at, dedupe_key, scheduled_at)
      SELECT s.user_id, 'reminder', s.kind, s.id, s.starts_at, 'reminder:' || s.kind || ':' || s.id::text || ':' || extract(epoch FROM s.starts_at)::text, s.starts_at - interval '24 hours'
      FROM calendar_audience s WHERE s.kind <> 'assessment_open' AND s.starts_at > clock_timestamp() AND s.starts_at <= clock_timestamp() + interval '24 hours'
      AND (s.kind <> 'session' OR EXISTS (SELECT 1 FROM classroom_sessions cs WHERE cs.id = s.id AND cs.status IN ('scheduled', 'open')))
      AND (s.can_manage OR s.kind NOT IN ('deadline', 'assessment_close') OR (
        NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.activity_id = s.id AND sub.student_id = s.user_id)
        AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.activity_id = s.id AND a.student_id = s.user_id AND a.submitted_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.activity_id = s.id AND pm.student_id = s.user_id AND p.status IN ('submitted', 'approved'))))
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = s.user_id AND n.dedupe_key = 'reminder:' || s.kind || ':' || s.id::text || ':' || extract(epoch FROM s.starts_at)::text)
      ORDER BY s.starts_at, s.kind, s.id, s.user_id LIMIT 250 ON CONFLICT DO NOTHING RETURNING id`;
    const updates = await tx<{ status: string }[]>`WITH batch AS (
      SELECT n.id, (u.is_active AND EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = n.user_id AND p.key = 'dashboard:view')
        AND CASE n.kind WHEN 'level_up' THEN COALESCE(p.level_up, true) WHEN 'checkin' THEN COALESCE(p.checkin, true) ELSE COALESCE(p.reminders, true) END
        AND (n.kind = 'level_up' OR EXISTS (SELECT 1 FROM calendar_audience s WHERE s.user_id = n.user_id AND s.id = n.source_id AND s.kind = n.source_kind AND (
          (n.kind = 'reminder' AND s.starts_at = n.source_at AND s.starts_at > clock_timestamp()
            AND (s.kind <> 'session' OR EXISTS (SELECT 1 FROM classroom_sessions cs WHERE cs.id = s.id AND cs.status IN ('scheduled', 'open')))
            AND (s.can_manage OR s.kind NOT IN ('deadline', 'assessment_close') OR (
              NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.activity_id = s.id AND sub.student_id = s.user_id)
              AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.activity_id = s.id AND a.student_id = s.user_id AND a.submitted_at IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM projects pr JOIN project_members pm ON pm.project_id = pr.id WHERE pr.activity_id = s.id AND pm.student_id = s.user_id AND pr.status IN ('submitted', 'approved')))))
          OR (n.kind = 'checkin' AND EXISTS (SELECT 1 FROM attendance_checkin_windows w JOIN classroom_sessions cs ON cs.id = w.session_id
            WHERE w.session_id = n.source_id AND w.status = 'open' AND cs.status = 'open' AND w.updated_at = n.source_at))
        )))) AS allowed
      FROM notifications n JOIN users u ON u.id = n.user_id LEFT JOIN notification_preferences p ON p.user_id = n.user_id
      WHERE n.status = 'pending' AND n.scheduled_at <= clock_timestamp() ORDER BY n.scheduled_at, n.id LIMIT 250 FOR UPDATE OF n SKIP LOCKED
    ) UPDATE notifications n SET status = CASE WHEN b.allowed THEN 'delivered' ELSE 'suppressed' END,
      delivered_at = CASE WHEN b.allowed THEN clock_timestamp() ELSE NULL END FROM batch b WHERE n.id = b.id RETURNING n.status`;
    return { generated: generated.length, delivered: updates.filter(r => r.status === "delivered").length, suppressed: updates.filter(r => r.status === "suppressed").length };
  });
}
export function startNotificationWorker(db: SQL) {
  let active: Promise<unknown> | null = null;
  const tick = () => {
    if (active) return;
    active = notificationTick(db).catch(() => log({ level: "error", event: "notification.delivery.failed" })).finally(() => { active = null; });
  };
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await active; };
}
