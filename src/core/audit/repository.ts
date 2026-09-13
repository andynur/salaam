import type { SQL } from "bun";
import type { RecordRow } from "../../shared/foundation";

// A null actor marks system-driven events, such as attempts finalized at their deadline.
export async function recordAudit(db: SQL, actorId: string | null, event: string, resourceType: string, resourceId: string | null, requestId: string) {
  await db`INSERT INTO audit_logs (actor_id, event, resource_type, resource_id, request_id)
    VALUES (${actorId}, ${event}, ${resourceType}, ${resourceId}, ${requestId})`;
}
// `category` is the event's dot-separated prefix (e.g. "gamification" for
// "gamification.badge.awarded"), used by the admin audit log's category filter.
export async function listAudit(db: SQL, pattern: string, offset: number, category: string) {
  return db<RecordRow[]>`SELECT a.id, a.event AS name, u.display_name AS actor,
    a.resource_type AS "resourceType", a.resource_id::text AS "resourceId", a.request_id::text AS "requestId",
    a.created_at::text AS "createdAt"
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
    WHERE (a.event ILIKE ${pattern} OR u.display_name ILIKE ${pattern})
      AND (${category} = '' OR a.event = ${category} OR a.event LIKE ${category + ".%"})
    ORDER BY a.created_at DESC, a.id DESC LIMIT 51 OFFSET ${offset}`;
}
