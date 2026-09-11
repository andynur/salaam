import type { SQL } from "bun";
import type { RecordRow } from "../../shared/foundation";
import { hashPassword } from "../../core/auth/password";
import { recordAudit } from "../../core/audit/repository";
import { invalid, textField } from "../../core/validation";

export async function listUsers(db: SQL, pattern: string, offset: number, role: string) {
  return db<RecordRow[]>`SELECT u.id, u.display_name AS name, u.email, u.is_active AS "isActive",
    string_agg(r.key, ', ' ORDER BY r.key) AS roles, string_agg(p.identifier, ', ' ORDER BY r.key) AS identifier
    FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN user_profiles p ON p.user_id = ur.user_id AND p.role_id = ur.role_id
    WHERE (u.display_name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR p.identifier ILIKE ${pattern})
      AND (${role} = '' OR (r.key = ${role} AND u.is_active = true))
    GROUP BY u.id ORDER BY u.created_at DESC, u.id DESC LIMIT 51 OFFSET ${offset}`;
}
async function userInput(body: Record<string, unknown>) {
  const name = textField(body, "name");
  const email = textField(body, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid("Email tidak valid.");
  const role = textField(body, "role", 20);
  if (!["student", "teacher", "admin"].includes(role)) invalid("Role tidak valid.");
  const identifier = textField(body, "identifier", 50);
  const password = body.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 128) invalid("Kata sandi harus 12–128 karakter.");
  const passwordHash = await hashPassword(password);
  return { name, email, role, identifier, passwordHash };
}
async function insertUser(tx: SQL, input: Awaited<ReturnType<typeof userInput>>, actorId: string | null, requestId: string) {
  const { name, email, role, identifier, passwordHash } = input;
  const [user] = await tx<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
    VALUES (${email}, ${name}, ${passwordHash}) RETURNING id`;
  const [assigned] = await tx<{ role_id: string }[]>`INSERT INTO user_roles (user_id, role_id)
    SELECT ${user!.id}, id FROM roles WHERE key = ${role} RETURNING role_id`;
  if (!assigned) throw new Error("Baseline role missing");
  await tx`INSERT INTO user_profiles (user_id, role_id, identifier) VALUES (${user!.id}, ${assigned.role_id}, ${identifier})`;
  await recordAudit(tx, actorId ?? user!.id, actorId ? "user.created" : "user.bootstrap_admin", "user", user!.id, requestId);
  return { id: user!.id };
}
export async function createUser(db: SQL, body: Record<string, unknown>, actorId: string, requestId: string) {
  const input = await userInput(body);
  return db.begin(tx => insertUser(tx, input, actorId, requestId));
}
export async function bootstrapAdmin(db: SQL, body: Record<string, unknown>) {
  const input = await userInput({ ...body, role: "admin" });
  return db.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(741926302)`;
    const existing = await tx`SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.key = 'admin' LIMIT 1`;
    if (existing.length) invalid("Admin sudah tersedia. Buat akun berikutnya melalui halaman administrasi.");
    return insertUser(tx, input, null, crypto.randomUUID());
  });
}
