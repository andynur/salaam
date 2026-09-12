import { expect, test } from "bun:test";
import { eventInput, preferencesInput, rangeInput, versionInput } from "../src/modules/calendar/input";
import { calendarHref, maxNotifiableLevel } from "../src/shared/calendar";
import { levelFor, levelThresholds, maxLevel } from "../src/shared/gamification";
const valid = { title: " Acara ", description: " Catatan ", startsAt: "2026-09-12T01:00:00Z", endsAt: "2026-09-12T02:00:00Z" };
test("event validation normalizes text and rejects invalid scope, times and length", () => {
  expect(eventInput(valid).title).toBe("Acara");
  expect(eventInput(valid).courseId).toBeNull();
  for (const patch of [{ title: " " }, { title: "x".repeat(151) }, { description: "x".repeat(2001) }, { courseId: "wrong" }, { startsAt: null }, { endsAt: valid.startsAt }, { endsAt: "2027-09-12T00:00:00Z" }, { startsAt: "not a date" }]) expect(() => eventInput({ ...valid, ...patch })).toThrow();
});
test("ranges are bounded, require explicit timezone and preserve pagination validation", () => {
  const url = new URL("http://localhost/api/calendar?from=2026-09-12T00:00:00Z&to=2026-09-13T00:00:00Z&offset=50&q=100%25");
  expect(rangeInput(url).offset).toBe(50);
  expect(rangeInput(url).pattern).toBe("%100\\%%");
  for (const query of ["", "from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z", "from=2026-09-12&to=2026-09-13", "from=2026-09-13T00:00:00Z&to=2026-09-12T00:00:00Z"]) expect(() => rangeInput(new URL(`http://localhost/?${query}`))).toThrow();
});
test("preferences accept booleans only and versions cannot overflow", () => {
  expect(preferencesInput({ reminders: false, levelUp: true, checkin: false })).toEqual({ reminders: false, levelUp: true, checkin: false });
  expect(() => preferencesInput({ reminders: "false", levelUp: true, checkin: true })).toThrow();
  for (const version of [0, -1, "1", 1.5, 2147483647]) expect(() => versionInput({ version })).toThrow();
});
test("source links resolve to existing learning, attendance and calendar pages", () => {
  expect(calendarHref({ kind: "event", id: "event", courseId: null, lessonId: null })).toBe("/calendar?event=event");
  expect(calendarHref({ kind: "session", id: "s", courseId: "c", lessonId: null })).toBe("/attendance/courses/c/sessions/s");
  expect(calendarHref({ kind: "assessment_close", id: "a", courseId: "c", lessonId: "l" })).toBe("/learning/courses/c?lesson=l");
});
// Level-up notices are written inside the XP transaction, so the level column's CHECK range
// must cover every level levelFor() can return. Extending levelThresholds without widening
// the column would otherwise turn a level-up into a failed grade or lesson completion.
test("every derivable level fits the notification level range", () => {
  expect(maxLevel).toBeLessThanOrEqual(maxNotifiableLevel);
  expect(levelFor(0).level).toBe(1);
  expect(levelFor(levelThresholds[levelThresholds.length - 1]! * 10).level).toBe(maxLevel);
});
