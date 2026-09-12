import { expect, test } from "bun:test";
import { attendanceInput, meetingInput, operationInput } from "../src/modules/attendance/input";
const meeting = { title: "Pertemuan", startsAt: "2026-09-12T07:00:00.000Z", endsAt: "2026-09-12T08:00:00.000Z", requestKey: crypto.randomUUID() };
test("meeting input bounds timestamps, duration, notes and retry identifiers", () => {
  expect(meetingInput(meeting).note).toBe("");
  for (const patch of [{ title: " " }, { title: "x".repeat(151) }, { startsAt: null }, { endsAt: meeting.startsAt }, { endsAt: "2026-09-14T08:00:00.000Z" }, { startsAt: "2026-02-30T07:00:00Z" }, { requestKey: "bad" }, { note: "x".repeat(2001) }]) expect(() => meetingInput({ ...meeting, ...patch })).toThrow();
});
test("attendance input requires an explicit predecessor and known status", () => {
  expect(attendanceInput({ status: "late", previousId: null })).toEqual({ status: "late", previousId: null, note: "" });
  for (const input of [{ status: "present" }, { status: "constructor", previousId: null }, { status: "yes", previousId: null }, { status: "present", previousId: "bad" }]) expect(() => attendanceInput(input)).toThrow();
});
test("session operations require bounded versions and correction reasons", () => {
  expect(operationInput({ action: "reopen", version: 2, reason: "Koreksi" }).reason).toBe("Koreksi");
  for (const input of [{ action: "reopen", version: 1 }, { action: "cancel", version: 1 }, { action: "open", version: 0 }, { action: "open", version: 1.5 }, { action: "delete", version: 1 }]) expect(() => operationInput(input)).toThrow();
});
