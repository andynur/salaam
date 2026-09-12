import { invalid, textField } from "../../core/validation";
import { maxLessonContent } from "../../shared/learning";

export function positionInput(body: Record<string, unknown>) {
  const value = body.position;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10000) invalid("Urutan harus berupa bilangan bulat 0–10000.");
  return value;
}
export function publishedInput(body: Record<string, unknown>) {
  if (typeof body.published !== "boolean") invalid("Status publikasi tidak valid.");
  return body.published;
}
export function archivedInput(body: Record<string, unknown>) {
  if (typeof body.archived !== "boolean") invalid("Status arsip tidak valid.");
  return body.archived;
}
// Autosave payload for a lesson document: the Markdown body plus the version the editor
// last saw. The title travels with it so renaming a document needs no second request.
export function documentInput(body: Record<string, unknown>) {
  const version = body.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > 2147483646) invalid("Versi dokumen tidak valid. Muat ulang halaman.");
  const content = body.content;
  if (typeof content !== "string" || !content.trim() || content.trim().length > maxLessonContent) invalid(`Isi dokumen harus 1–${maxLessonContent} karakter.`);
  const title = body.title === undefined || body.title === null ? null : textField(body, "title", 150);
  return { title, content: content.trim(), version };
}
export function shareInput(body: Record<string, unknown>) {
  if (typeof body.shared !== "boolean") invalid("Status berbagi tidak valid.");
  return body.shared;
}
export function materialInput(body: Record<string, unknown>, hasFile = false) {
  const title = textField(body, "title", 150);
  const kind = body.kind;
  if (kind !== "text" && kind !== "link" && kind !== "file") invalid("Pilih materi teks, tautan, atau berkas.");
  if (hasFile && kind !== "file") invalid("Berkas hanya dapat dilampirkan pada materi jenis berkas.");
  if (kind === "file") {
    // The file itself is required by the service; the description is optional.
    const content = body.content ?? "";
    if (typeof content !== "string" || content.trim().length > 2000) invalid("Keterangan berkas maksimal 2000 karakter.");
    return { title, kind, content: content.trim() };
  }
  const content = textField(body, "content", kind === "link" ? 2000 : 20000);
  if (kind === "link") httpUrlInput(content);
  return { title, kind, content };
}
export function httpUrlInput(content: string) {
  try {
    const url = new URL(content);
    if (!/^https?:\/\//.test(content) || !["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch { invalid("Tautan harus berupa URL HTTP/HTTPS tanpa kredensial."); }
  return content;
}
// Optional UTC timestamp in canonical ISO form, e.g. an activity deadline.
export function timestampInput(body: Record<string, unknown>, key: string, label: string): string | null {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) invalid(`${label} tidak valid.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z") || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2200) invalid(`${label} tidak valid (1900–2200).`);
  return date.toISOString();
}
export function activityInput(body: Record<string, unknown>) {
  if (body.kind !== "assignment") invalid("Phase 2 mendukung tugas. Jenis assessment belum tersedia.");
  const title = textField(body, "title", 150);
  const instructions = textField(body, "instructions", 20000);
  return { title, instructions, dueAt: timestampInput(body, "dueAt", "Tenggat") };
}
// Text is optional when a file is attached; the service requires at least one of them.
export function submissionContentInput(body: Record<string, unknown>) {
  const content = body.content ?? "";
  if (typeof content !== "string" || content.trim().length > 20000) invalid("Jawaban maksimal 20000 karakter.");
  return content.trim();
}
export function submissionFormInput(body: Record<string, unknown>) {
  const githubUrl = body.githubUrl === undefined || body.githubUrl === "" ? "" : textField(body, "githubUrl", 2000);
  const jamUrl = body.jamUrl === undefined || body.jamUrl === "" ? "" : textField(body, "jamUrl", 2000);
  const feedback = body.feedback === undefined || body.feedback === "" ? "" : typeof body.feedback === "string" && body.feedback.trim().length <= 5000 ? body.feedback.trim() : invalid("Saran dan masukan maksimal 5000 karakter.");
  if (githubUrl) httpUrlInput(githubUrl);
  if (jamUrl) httpUrlInput(jamUrl);
  return { githubUrl, jamUrl, feedback };
}
export function returnInput(body: Record<string, unknown>) {
  return { reason: textField(body, "reason", 5000) };
}
export function deadlineExceptionInput(body: Record<string, unknown>) {
  const dueAt = timestampInput(body, "dueAt", "Tenggat baru");
  if (!dueAt) invalid("Tenggat baru wajib diisi.");
  return { dueAt, reason: textField(body, "reason", 500) };
}
export function assessmentAccommodationInput(body: Record<string, unknown>) {
  const extraMinutes = body.extraMinutes;
  if (typeof extraMinutes !== "number" || !Number.isInteger(extraMinutes) || extraMinutes < 1 || extraMinutes > 120) invalid("Tambahan waktu harus berupa bilangan bulat 1–120 menit.");
  return { extraMinutes, reason: textField(body, "reason", 1000) };
}
export function gradeInput(body: Record<string, unknown>) {
  const score = body.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100 || Math.abs(score * 100 - Math.round(score * 100)) > 0.000001) invalid("Nilai harus 0–100, maksimal dua desimal.");
  return { score, feedback: textField(body, "feedback", 5000) };
}
