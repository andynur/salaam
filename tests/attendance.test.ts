import { expect, test } from "bun:test";
import { attendanceInput, bulkAttendanceInput, checkinCodeInput, checkinWindowInput, meetingInput, meetingSeriesInput, operationInput } from "../src/modules/attendance/input";
const meeting = { title: "Pertemuan", startsAt: "2026-09-12T07:00:00.000Z", endsAt: "2026-09-12T08:00:00.000Z", requestKey: crypto.randomUUID() };
test("meeting input bounds timestamps, duration, notes and retry identifiers", () => {
  expect(meetingInput(meeting).note).toBe("");
  for (const patch of [{ title: " " }, { title: "x".repeat(151) }, { startsAt: null }, { endsAt: meeting.startsAt }, { endsAt: "2026-09-14T08:00:00.000Z" }, { startsAt: "2026-02-30T07:00:00Z" }, { requestKey: "bad" }, { note: "x".repeat(2001) }]) expect(() => meetingInput({ ...meeting, ...patch })).toThrow();
});
test("meeting series input bounds occurrences and QR defaults", () => {
  expect(meetingSeriesInput({ ...meeting, intervalDays: 7, occurrenceCount: 8, qrRotateSeconds: 30 })).toMatchObject({ intervalDays: 7, occurrenceCount: 8, qrRotateSeconds: 30, qrLateAfterMinutes: null });
  for (const patch of [{ intervalDays: 0 }, { intervalDays: 366 }, { occurrenceCount: 0 }, { occurrenceCount: 53 }, { qrRotateSeconds: 14 }, { qrLateAfterMinutes: 1441 }]) expect(() => meetingSeriesInput({ ...meeting, intervalDays: 7, occurrenceCount: 8, qrRotateSeconds: 30, ...patch })).toThrow();
});
test("attendance input requires an explicit predecessor and known status", () => {
  expect(attendanceInput({ status: "late", previousId: null })).toEqual({ status: "late", previousId: null, note: "" });
  for (const input of [{ status: "present" }, { status: "constructor", previousId: null }, { status: "yes", previousId: null }, { status: "present", previousId: "bad" }]) expect(() => attendanceInput(input)).toThrow();
});
test("bulk attendance input bounds and validates each student record", () => {
  expect(bulkAttendanceInput({ records: [{ studentId: crypto.randomUUID(), status: "present", previousId: null }] }).records).toHaveLength(1);
  for (const records of [[], Array.from({ length: 501 }, () => ({ studentId: crypto.randomUUID(), status: "present", previousId: null })), [{ studentId: "bad", status: "present", previousId: null }]]) expect(() => bulkAttendanceInput({ records })).toThrow();
});
test("session operations require bounded versions and correction reasons", () => {
  expect(operationInput({ action: "reopen", version: 2, reason: "Koreksi" }).reason).toBe("Koreksi");
  for (const input of [{ action: "reopen", version: 1 }, { action: "cancel", version: 1 }, { action: "open", version: 0 }, { action: "open", version: 1.5 }, { action: "delete", version: 1 }]) expect(() => operationInput(input)).toThrow();
});
test("check-in window input bounds rotation and late thresholds", () => {
  expect(checkinWindowInput({ action: "start" })).toEqual({ action: "start", rotateSeconds: 30, lateAfter: null });
  expect(checkinWindowInput({ action: "stop", rotateSeconds: 300, lateAfter: "2026-09-12T07:15:00.000Z" }).lateAfter).toBe("2026-09-12T07:15:00.000Z");
  for (const input of [{ action: "pause" }, { action: "start", rotateSeconds: 14 }, { action: "start", rotateSeconds: 301 }, { action: "start", rotateSeconds: 30.5 }, { action: "start", rotateSeconds: "30" }, { action: "start", lateAfter: "besok" }]) expect(() => checkinWindowInput(input)).toThrow();
});
test("check-in codes accept only the display alphabet at the exact length", () => {
  expect(checkinCodeInput({ code: "h7k2qm9xz4" })).toBe("H7K2QM9XZ4");
  for (const code of ["", "H7K2QM9XZ", "H7K2QM9XZ44", "H7K2QM9XZI", "H7K2QM9XZ-", "H7K2QM9XZU", 12345] as const) expect(() => checkinCodeInput({ code })).toThrow();
});
