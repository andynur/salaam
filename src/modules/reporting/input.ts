import { invalid } from "../../core/validation";
import type { ReportScope } from "../../shared/reporting";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scopeLabels: Record<string, string> = { yearId: "Tahun ajaran", termId: "Semester", classId: "Kelas", courseId: "Course", actorId: "Pengguna" };

export function optionalId(url: URL, key: string): string | null {
  const value = (url.searchParams.get(key) ?? "").trim();
  if (!value) return null;
  if (!uuid.test(value)) invalid(`${scopeLabels[key] ?? key}: pilihan tidak valid.`);
  return value.toLowerCase();
}
// Report boundaries are calendar dates in the school timezone; the service converts them.
export function optionalDate(url: URL, key: string): string | null {
  const value = (url.searchParams.get(key) ?? "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31" ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid("Tanggal tidak valid (1900–2200).");
  return value;
}
export function reportScope(url: URL): ReportScope {
  return { yearId: optionalId(url, "yearId"), termId: optionalId(url, "termId"), classId: optionalId(url, "classId"), courseId: optionalId(url, "courseId") };
}
export function auditFilters(url: URL) {
  const event = (url.searchParams.get("event") ?? "").trim();
  if (event.length > 100) invalid("Peristiwa maksimal 100 karakter.");
  if (event && !/^[a-z0-9._-]+$/.test(event)) invalid("Peristiwa: pilihan tidak valid.");
  const from = optionalDate(url, "from");
  const to = optionalDate(url, "to");
  if (from && to && to < from) invalid("Tanggal selesai harus setelah atau sama dengan tanggal mulai.");
  return { event, actorId: optionalId(url, "actorId"), from, to };
}
