import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import type { AccountProfile } from "../../shared/account";

export interface LoginUser { id: string; password_hash: string }

export async function findLoginUser(db: SQL, email: string): Promise<LoginUser | null> {
  const rows = await db<LoginUser[]>`SELECT id, password_hash FROM users WHERE email = ${email} AND is_active = true`;
  return rows[0] ?? null;
}

export async function findSessionPassword(db: SQL, tokenHash: string): Promise<LoginUser | null> {
  const rows = await db<LoginUser[]>`SELECT u.id, u.password_hash FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > now() AND u.is_active = true`;
  return rows[0] ?? null;
}

export async function findSessionAccount(db: SQL, tokenHash: string): Promise<AccountProfile | null> {
  const rows = await db<AccountProfile[]>`
    SELECT u.id, u.display_name AS name, u.email,
      to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      COALESCE((SELECT json_agg(json_build_object('role', r.key, 'identifier', p.identifier) ORDER BY r.key)
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        LEFT JOIN user_profiles p ON p.user_id = ur.user_id AND p.role_id = ur.role_id
        WHERE ur.user_id = u.id), '[]'::json) AS roles,
      (SELECT count(*)::int FROM sessions o WHERE o.user_id = u.id AND o.expires_at > now()) AS "activeSessions"
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > now() AND u.is_active = true`;
  const row = rows[0];
  if (!row) return null;
  return { ...row, roles: typeof row.roles === "string" ? JSON.parse(row.roles) as AccountProfile["roles"] : row.roles };
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
