import { idField, invalid, textField, listInput } from "../../core/validation";
import { timestampInput } from "../learning/input";
import { noteInput } from "../attendance/input";
export function rangeInput(url: URL) {
  const from = timestampInput({ from: url.searchParams.get("from") }, "from", "Mulai");
  const to = timestampInput({ to: url.searchParams.get("to") }, "to", "Selesai");
  if (!from || !to || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 93 * 86400000) invalid("Pilih rentang lebih dari 0 dan maksimal 93 hari.");
  return { from, to, ...listInput(url) };
}
export function versionInput(body: Record<string, unknown>) {
  const version = body.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version >= 2147483647) invalid("Versi acara tidak valid.");
  return version;
}
export function eventInput(body: Record<string, unknown>) {
  const startsAt = timestampInput(body, "startsAt", "Waktu mulai");
  const endsAt = timestampInput(body, "endsAt", "Waktu selesai");
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 93 * 86400000) invalid("Durasi acara lebih dari 0 dan maksimal 93 hari.");
  return { title: textField(body, "title", 150), description: noteInput(body, "description"), startsAt, endsAt,
    courseId: body.courseId == null || body.courseId === "" ? null : idField(body, "courseId") };
}
export function preferencesInput(body: Record<string, unknown>) {
  if (typeof body.reminders !== "boolean" || typeof body.levelUp !== "boolean" || typeof body.checkin !== "boolean") invalid("Pilih preferensi notifikasi yang valid.");
  return { reminders: body.reminders, levelUp: body.levelUp, checkin: body.checkin };
}
