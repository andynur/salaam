import { HttpError } from "./errors";

const fieldLabels: Record<string, string> = {
  name: "Nama", email: "Email", role: "Role", identifier: "NIS / nomor pegawai",
  yearId: "Tahun ajaran", classId: "Kelas", termId: "Semester", subjectId: "Mata pelajaran",
  studentId: "Santri", teacherId: "Guru", courseId: "Course", code: "Kode mata pelajaran",
  startsOn: "Tanggal mulai", endsOn: "Tanggal selesai",
};

export function invalid(message: string): never { throw new HttpError(400, "INVALID_INPUT", message); }
export async function jsonObject(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan format JSON.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpError(413, "BODY_TOO_LARGE", "Data terlalu besar.");
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new HttpError(413, "BODY_TOO_LARGE", "Data terlalu besar.");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { invalid("Data JSON tidak valid."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Isi data yang valid.");
  return value as Record<string, unknown>;
}
// Accepts text fields plus at most one file in the `file` field.
export async function multipartInput(request: Request, maxBytes: number): Promise<{ body: Record<string, unknown>; file: File | null }> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "multipart/form-data") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan formulir berkas.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpError(413, "BODY_TOO_LARGE", "Berkas terlalu besar.");
  let form: FormData;
  try { form = await request.formData(); } catch { invalid("Data formulir tidak valid."); }
  const body: Record<string, unknown> = {};
  let file: File | null = null;
  let fileField = false;
  for (const [key, value] of form) {
    if (key === "file") {
      if (fileField) invalid("Lampirkan satu berkas saja.");
      fileField = true;
      // An empty browser file input submits a nameless, empty file.
      if (typeof value !== "string" && (value.name || value.size)) file = value;
      else if (typeof value === "string" && value) invalid("Data berkas tidak valid.");
    } else {
      if (typeof value !== "string" || key in body) invalid("Data formulir tidak valid.");
      body[key] = value;
    }
  }
  return { body, file };
}
export function textField(body: Record<string, unknown>, key: string, max = 100): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid(`${fieldLabels[key] ?? key}: isi 1–${max} karakter.`);
  return value.trim();
}
export function idField(body: Record<string, unknown>, key: string): string {
  const value = textField(body, key, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid(`${fieldLabels[key] ?? key}: pilihan tidak valid.`);
  return value;
}
export function dates(body: Record<string, unknown>): { startsOn: string; endsOn: string } {
  const startsOn = textField(body, "startsOn", 10);
  const endsOn = textField(body, "endsOn", 10);
  for (const date of [startsOn, endsOn]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1900-01-01" || date > "2200-12-31" ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) invalid("Tanggal tidak valid (1900–2200).");
  }
  if (endsOn < startsOn) invalid("Tanggal selesai harus setelah atau sama dengan tanggal mulai.");
  return { startsOn, endsOn };
}
export function listInput(url: URL) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) invalid("Halaman tidak valid.");
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length > 100) invalid("Pencarian maksimal 100 karakter.");
  return { offset, pattern: `%${q.replace(/[\\%_]/g, "\\$&")}%` };
}
export function databaseInputError(error: unknown): never {
  const code = error && typeof error === "object" && "errno" in error ? error.errno : null;
  if (code === "23505") throw new HttpError(409, "ALREADY_EXISTS", "Data sudah terdaftar. Periksa duplikasi akun, nomor identitas, atau relasi akademik.");
  if (code === "23503" || code === "23514") invalid("Relasi atau nilai data tidak valid. Muat ulang pilihan Anda.");
  throw error;
}
