import type { SQL } from "bun";
import { hashPassword } from "../../core/auth/password";
import { recordAudit } from "../../core/audit/repository";
import { HttpError } from "../../core/errors";
import { idField, invalid } from "../../core/validation";
import type { StudentImportResult, StudentImportRow } from "../../shared/imports";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const field = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

function parseRows(body: Record<string, unknown>): { classId: string; rows: StudentImportRow[]; mode: "preview" | "commit" } {
  const classId = idField(body, "classId").toLowerCase();
  const mode = body.mode === "commit" ? "commit" : body.mode === "preview" ? "preview" : null;
  if (!mode) invalid("Mode import tidak valid.");
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) invalid("Import harus berisi 1–500 baris.");
  const rows = body.rows.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`Baris ${index + 1} tidak valid.`);
    const row = value as Record<string, unknown>;
    return { name: field(row.name, 100) ?? "", email: field(row.email, 254)?.toLowerCase() ?? "", identifier: field(row.identifier, 50) ?? "", password: typeof row.password === "string" ? row.password : "" };
  });
  return { classId, rows, mode };
}

async function inspect(db: SQL, classId: string, rows: StudentImportRow[]): Promise<StudentImportResult[]> {
  const result = rows.map((row, index) => ({ row: index + 1, email: row.email, identifier: row.identifier, errors: [] as string[], action: "create" as StudentImportResult["action"] }));
  const emails = rows.map(row => row.email).filter(Boolean);
  const identifiers = rows.map(row => row.identifier).filter(Boolean);
  const [classRows, users, profiles, memberships] = await Promise.all([
    db`SELECT id FROM classes WHERE id = ${classId}`,
    emails.length ? db<{ id: string; email: string }[]>`SELECT id, email FROM users WHERE email = ANY(string_to_array(${emails.join(",")}, ','))` : [],
    identifiers.length ? db<{ userId: string; identifier: string }[]>`SELECT user_id AS "userId", identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE r.key = 'student' AND identifier = ANY(string_to_array(${identifiers.join(",")}, ','))` : [],
    db<{ studentId: string }[]>`SELECT student_id AS "studentId" FROM class_members WHERE class_id = ${classId}`,
  ]);
  if (!classRows.length) throw new HttpError(404, "NOT_FOUND", "Kelas tidak ditemukan.");
  const existingEmail = new Map(users.map(row => [row.email, row.id]));
  const existingIdentifier = new Map(profiles.map(row => [row.identifier, row.userId]));
  const enrolled = new Set(memberships.map(row => row.studentId));
  const seenEmails = new Set<string>();
  const seenIdentifiers = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const target = result[index]!;
    if (!row.name) target.errors.push("Nama wajib diisi.");
    if (!row.email || !emailPattern.test(row.email)) target.errors.push("Email tidak valid.");
    if (!row.identifier) target.errors.push("Nomor identitas wajib diisi.");
    if (row.password.length < 12 || row.password.length > 128) target.errors.push("Kata sandi harus 12–128 karakter.");
    if (seenEmails.has(row.email)) target.errors.push("Email duplikat di dalam import.");
    if (seenIdentifiers.has(row.identifier)) target.errors.push("Nomor identitas duplikat di dalam import.");
    seenEmails.add(row.email); seenIdentifiers.add(row.identifier);
    const userId = existingEmail.get(row.email);
    const identifierUserId = existingIdentifier.get(row.identifier);
    if (userId && identifierUserId && userId !== identifierUserId) target.errors.push("Email dan nomor identitas sudah dimiliki akun berbeda.");
    else if (identifierUserId && !userId) target.errors.push("Nomor identitas sudah digunakan akun lain.");
    else if (userId) {
      if (identifierUserId !== userId) target.errors.push("Akun dengan email ini memiliki nomor identitas berbeda.");
      else if (enrolled.has(userId)) target.action = "skip";
      else target.action = "enroll";
    }
    if (target.errors.length) target.action = "invalid";
  }
  return result;
}

export async function importStudents(db: SQL, actorId: string, body: Record<string, unknown>, requestId: string) {
  const { classId, rows, mode } = parseRows(body);
  if (mode === "preview") return { mode, rows: await inspect(db, classId, rows) };
  return db.begin(async tx => {
    const inspection = await inspect(tx, classId, rows);
    if (inspection.some(row => row.errors.length)) throw new HttpError(400, "IMPORT_INVALID", "Perbaiki baris import yang ditandai sebelum menyimpan.");
    let created = 0; let enrolled = 0; let skipped = 0;
    for (const [index, row] of rows.entries()) {
      const status = inspection[index]!;
      let userId: string;
      const existing = await tx<{ id: string }[]>`SELECT id FROM users WHERE email = ${row.email} FOR UPDATE`;
      if (existing[0]) { userId = existing[0].id; }
      else {
        const [user] = await tx<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash) VALUES (${row.email}, ${row.name}, ${await hashPassword(row.password)}) RETURNING id`;
        const [role] = await tx<{ id: string }[]>`SELECT id FROM roles WHERE key = 'student'`;
        if (!role) throw new Error("Baseline role missing");
        await tx`INSERT INTO user_roles (user_id, role_id) VALUES (${user!.id}, ${role.id})`;
        await tx`INSERT INTO user_profiles (user_id, role_id, identifier) VALUES (${user!.id}, ${role.id}, ${row.identifier})`;
        userId = user!.id; created++;
      }
      const inserted = await tx`INSERT INTO class_members (class_id, academic_year_id, student_id) SELECT id, academic_year_id, ${userId} FROM classes WHERE id = ${classId} ON CONFLICT (academic_year_id, student_id) DO NOTHING RETURNING id`;
      if (inserted.length) enrolled++; else skipped++;
      await recordAudit(tx, actorId, `academic.student_import.${status.action}`, "class_members", userId, requestId);
    }
    return { mode, created, enrolled, skipped, rows: inspection };
  });
}
