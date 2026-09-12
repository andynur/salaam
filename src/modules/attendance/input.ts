import { idField, invalid, textField } from "../../core/validation";
import { timestampInput } from "../learning/input";
import { attendanceLabels, checkinCodeLength, checkinCodePattern, type AttendanceStatus } from "../../shared/attendance";
export function noteInput(body: Record<string, unknown>, key = "note", max = 2000) {
  const value = body[key] ?? "";
  if (typeof value !== "string" || value.trim().length > max) invalid(`Catatan maksimal ${max} karakter.`);
  return value.trim();
}
export function meetingInput(body: Record<string, unknown>) {
  const startsAt = timestampInput(body, "startsAt", "Waktu mulai");
  const endsAt = timestampInput(body, "endsAt", "Waktu selesai");
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 86400000) invalid("Durasi sesi harus lebih dari 0 dan maksimal 24 jam.");
  return { title: textField(body, "title", 150), startsAt, endsAt, requestKey: idField(body, "requestKey"), note: noteInput(body) };
}
export function meetingSeriesInput(body: Record<string, unknown>) {
  const meeting = meetingInput(body);
  const integer = (key: string, min: number, max: number, label: string) => {
    const value = body[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) invalid(`${label} harus ${min}–${max}.`);
    return value;
  };
  const intervalDays = integer("intervalDays", 1, 365, "Interval hari");
  const occurrenceCount = integer("occurrenceCount", 1, 52, "Jumlah sesi");
  const qrRotateSeconds = integer("qrRotateSeconds", 15, 300, "Rotasi kode QR");
  const late = body.qrLateAfterMinutes;
  if (late !== null && late !== undefined && (typeof late !== "number" || !Number.isSafeInteger(late) || late < 0 || late > 1440)) invalid("Batas terlambat harus 0–1440 menit atau kosong.");
  return { ...meeting, intervalDays, occurrenceCount, qrRotateSeconds, qrLateAfterMinutes: late === null || late === undefined ? null : late as number };
}
export function attendanceInput(body: Record<string, unknown>) {
  if (typeof body.status !== "string" || !Object.hasOwn(attendanceLabels, body.status)) invalid("Pilih status kehadiran yang valid.");
  return { status: body.status as AttendanceStatus, note: noteInput(body), previousId: body.previousId === null ? null : idField(body, "previousId") };
}
export function bulkAttendanceInput(body: Record<string, unknown>) {
  if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 500) invalid("Pilih 1–500 santri untuk ditandai.");
  return { records: body.records.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`Data santri ke-${index + 1} tidak valid.`);
    const record = value as Record<string, unknown>;
    const parsed = attendanceInput(record);
    return { studentId: idField(record, "studentId"), ...parsed };
  }) };
}
export function operationInput(body: Record<string, unknown>) {
  const version = body.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version >= 2147483647) invalid("Versi sesi tidak valid.");
  if (!["open", "close", "reopen", "cancel", "note"].includes(String(body.action))) invalid("Operasi sesi tidak valid.");
  const action = body.action as "open" | "close" | "reopen" | "cancel" | "note";
  const reason = noteInput(body, "reason", 500);
  if (["reopen", "cancel"].includes(action) && !reason) invalid("Isi alasan perubahan sesi.");
  return { version, action, reason, note: noteInput(body) };
}
export function rosterAdjustmentInput(body: Record<string, unknown>) {
  const version = body.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version >= 2147483647) invalid("Versi sesi tidak valid.");
  const active = body.active;
  if (typeof active !== "boolean") invalid("Status roster tidak valid.");
  const scope = body.scope ?? "session";
  if (scope !== "session" && scope !== "future_series") invalid("Cakupan perubahan roster tidak valid.");
  return { studentId: idField(body, "studentId").toLowerCase(), version, active, scope: scope as "session" | "future_series" };
}
export function checkinWindowInput(body: Record<string, unknown>) {
  if (!["start", "stop"].includes(String(body.action))) invalid("Operasi absensi QR tidak valid.");
  const action = body.action as "start" | "stop";
  const rotateSeconds = body.rotateSeconds ?? 30;
  if (typeof rotateSeconds !== "number" || !Number.isSafeInteger(rotateSeconds) || rotateSeconds < 15 || rotateSeconds > 300) invalid("Rotasi kode 15–300 detik.");
  return { action, rotateSeconds, lateAfter: timestampInput(body, "lateAfter", "Batas terlambat") };
}
export function checkinCodeInput(body: Record<string, unknown>) {
  const code = textField(body, "code", checkinCodeLength).toUpperCase();
  if (!checkinCodePattern.test(code)) invalid("Kode absensi tidak valid.");
  return code;
}
export function checkinImportInput(body: Record<string, unknown>) {
  const requestKey = idField(body, "requestKey");
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500) invalid("Import scan harus berisi 1–500 baris.");
  const rows = body.rows.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`Baris scan ke-${index + 1} tidak valid.`);
    const row = value as Record<string, unknown>;
    const scannedAt = timestampInput(row, "scannedAt", "Waktu scan");
    if (!scannedAt) invalid(`Baris scan ke-${index + 1}: waktu scan wajib diisi.`);
    return { studentId: idField(row, "studentId").toLowerCase(), code: checkinCodeInput(row), scannedAt };
  });
  if (new Set(rows.map(row => row.studentId)).size !== rows.length) invalid("Setiap santri hanya boleh muncul sekali dalam satu import.");
  return { requestKey: requestKey.toLowerCase(), rows };
}
