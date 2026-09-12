import type { SQL } from "bun";
import type { RecordRow } from "../../shared/foundation";
import { hashPassword } from "../../core/auth/password";
import { recordAudit } from "../../core/audit/repository";
import { invalid, textField } from "../../core/validation";
import { HttpError } from "../../core/errors";

export async function listUsers(db: SQL, pattern: string, offset: number, role: string) {
  return db<RecordRow[]>`SELECT u.id, u.display_name AS name, u.email, u.is_active AS "isActive",
    string_agg(r.key, ', ' ORDER BY r.key) AS roles, string_agg(p.identifier, ', ' ORDER BY r.key) AS identifier
    FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN user_profiles p ON p.user_id = ur.user_id AND p.role_id = ur.role_id
    WHERE (u.display_name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR p.identifier ILIKE ${pattern})
      AND (${role} = '' OR (r.key = ${role} AND u.is_active = true))
    GROUP BY u.id ORDER BY u.created_at DESC, u.id DESC LIMIT 51 OFFSET ${offset}`;
}
function passwordField(body: Record<string, unknown>): string {
  const password = body.password;
  if (typeof password !== "string" || password.length < 12 || password.length > 128) invalid("Kata sandi harus 12–128 karakter.");
  return password;
}
function profileInput(body: Record<string, unknown>) {
  const name = textField(body, "name");
  const email = textField(body, "email", 254).toLowerCase();
  if (!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)) invalid("Email tidak valid.");
  const role = textField(body, "role", 20);
  if (!["student", "teacher", "admin"].includes(role)) invalid("Role tidak valid.");
  const identifier = textField(body, "identifier", 50);
  if (typeof body.isActive !== "boolean") invalid("Status akun tidak valid.");
  return { name, email, role, identifier, isActive: body.isActive };
}
async function userInput(body: Record<string, unknown>) {
  const name = textField(body, "name");
  const email = textField(body, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid("Email tidak valid.");
  const role = textField(body, "role", 20);
  if (!["student", "teacher", "admin"].includes(role)) invalid("Role tidak valid.");
  const identifier = textField(body, "identifier", 50);
  const passwordHash = await hashPassword(passwordField(body));
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
// Account recovery: an administrator sets a new password and every existing session of that
// account is revoked in the same transaction, so a stolen or shared session cannot survive it.
export async function resetPassword(db: SQL, userId: string, body: Record<string, unknown>, actorId: string, requestId: string) {
  const passwordHash = await hashPassword(passwordField(body));
  return db.begin(async tx => {
    const [user] = await tx<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!user) throw new HttpError(404, "NOT_FOUND", "Akun tidak ditemukan.");
    await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
    const revoked = await tx`DELETE FROM sessions WHERE user_id = ${userId} RETURNING user_id`;
    await recordAudit(tx, actorId, "user.password_reset", "user", userId, requestId);
    return { id: userId, sessionsRevoked: revoked.length };
  });
}
export async function updateUser(db: SQL, userId: string, body: Record<string, unknown>, actorId: string, requestId: string) {
  const input = profileInput(body);
  return db.begin(async tx => {
    const [current] = await tx<{ id: string; email: string; isActive: boolean }[]>`SELECT id, email, is_active AS "isActive" FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!current) throw new HttpError(404, "NOT_FOUND", "Akun tidak ditemukan.");
    const roles = await tx<{ key: string; roleId: string }[]>`SELECT r.key, r.id AS "roleId" FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ${userId} FOR SHARE`;
    const currentKeys = new Set(roles.map(role => role.key));
    if ((currentKeys.has("student") && input.role !== "student" && (await tx`SELECT 1 FROM class_members WHERE student_id = ${userId} LIMIT 1`).length) ||
      (currentKeys.has("teacher") && input.role !== "teacher" && (await tx`SELECT 1 FROM teaching_assignments WHERE teacher_id = ${userId} LIMIT 1`).length)) {
      throw new HttpError(409, "ROLE_HAS_RELATIONS", "Selesaikan relasi akademik akun sebelum mengganti role.");
    }
    if (currentKeys.has("admin") && (input.role !== "admin" || !input.isActive)) {
      const [admins] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id WHERE r.key = 'admin' AND u.is_active`;
      if ((admins?.count ?? 0) <= 1) throw new HttpError(409, "LAST_ADMIN", "Sistem harus memiliki minimal satu admin aktif.");
    }
    const [role] = await tx<{ id: string }[]>`SELECT id FROM roles WHERE key = ${input.role}`;
    if (!role) throw new Error("Baseline role missing");
    const roleChanged = !currentKeys.has(input.role);
    await tx`UPDATE users SET display_name = ${input.name}, email = ${input.email}, is_active = ${input.isActive}, updated_at = clock_timestamp() WHERE id = ${userId}`;
    await tx`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await tx`INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, ${role.id})`;
    await tx`INSERT INTO user_profiles (user_id, role_id, identifier) VALUES (${userId}, ${role.id}, ${input.identifier})`;
    if (roleChanged || current.email !== input.email || current.isActive !== input.isActive) await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
    await recordAudit(tx, actorId, "user.updated", "user", userId, requestId);
    if (roleChanged) await recordAudit(tx, actorId, "user.role_changed", "user", userId, requestId);
    return { id: userId };
  });
}
