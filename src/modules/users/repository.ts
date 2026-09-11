import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";

export interface LoginUser { id: string; password_hash: string }

export async function findLoginUser(db: SQL, email: string): Promise<LoginUser | null> {
  const rows = await db<LoginUser[]>`SELECT id, password_hash FROM users WHERE email = ${email} AND is_active = true`;
  return rows[0] ?? null;
}

export async function findSessionActor(db: SQL, tokenHash: string): Promise<Actor | null> {
  const rows = await db<Actor[]>`
    SELECT u.id, u.display_name AS "displayName",
      COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles,
      COALESCE(array_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > now() AND u.is_active = true
    GROUP BY u.id`;
  return rows[0] ?? null;
}
