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
export function attendanceInput(body: Record<string, unknown>) {
  if (typeof body.status !== "string" || !Object.hasOwn(attendanceLabels, body.status)) invalid("Pilih status kehadiran yang valid.");
  return { status: body.status as AttendanceStatus, note: noteInput(body), previousId: body.previousId === null ? null : idField(body, "previousId") };
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
