import { describe, expect, test } from "bun:test";
import { HttpError } from "../src/core/errors";
import { levelFor, levelThresholds, maxLevel } from "../src/shared/gamification";
import { badgeInput, leaderboardFilter, rulePointsInput, ruleKeyInput, studentIdInput } from "../src/modules/gamification/input";

function rejects(run: () => unknown) {
  try { run(); } catch (error) { return error instanceof HttpError ? error.status : 500; }
  return 0;
}
const badge = { key: "juara-kelas", name: "Juara Kelas", description: "Contoh lencana.", icon: "star", criterion: "xp_total", threshold: 500 };

describe("levels are derived from the XP total", () => {
  test("an empty ledger is level 1 with the next threshold ahead", () => {
    expect(levelFor(0)).toEqual({ level: 1, total: 0, levelAt: 0, nextAt: 100 });
  });
  test("a level opens exactly at its threshold", () => {
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toEqual({ level: 2, total: 100, levelAt: 100, nextAt: 250 });
    expect(levelFor(249).level).toBe(2);
    expect(levelFor(250).level).toBe(3);
  });
  test("the top level has no next threshold and does not overflow", () => {
    const top = levelFor(levelThresholds[maxLevel - 1]!);
    expect(top.level).toBe(maxLevel);
    expect(top.nextAt).toBeNull();
    expect(levelFor(999999).level).toBe(maxLevel);
  });
  test("invalid or fractional totals are floored to a safe value", () => {
    expect(levelFor(-50)).toEqual({ level: 1, total: 0, levelAt: 0, nextAt: 100 });
    expect(levelFor(Number.NaN).total).toBe(0);
    expect(levelFor(149.9)).toMatchObject({ level: 2, total: 149 });
  });
  test("thresholds increase, so a higher total never lowers a level", () => {
    for (let index = 1; index < levelThresholds.length; index++) expect(levelThresholds[index]!).toBeGreaterThan(levelThresholds[index - 1]!);
  });
});

describe("reward rule input", () => {
  test("only seeded rule keys are accepted", () => {
    expect(ruleKeyInput("lesson.completed")).toBe("lesson.completed");
    expect(rejects(() => ruleKeyInput("lesson.started"))).toBe(400);
    expect(rejects(() => ruleKeyInput(""))).toBe(400);
  });
  test("points must be a whole number within range", () => {
    expect(rulePointsInput({ points: 0 })).toBe(0);
    expect(rulePointsInput({ points: 1000 })).toBe(1000);
    for (const points of [-1, 1001, 12.5, "25", null, undefined]) expect(rejects(() => rulePointsInput({ points }))).toBe(400);
  });
});

describe("badge input", () => {
  test("a valid badge is normalized", () => {
    expect(badgeInput({ ...badge, key: "Juara-Kelas" })).toEqual({ ...badge, key: "juara-kelas", active: true } as never);
    expect(badgeInput({ ...badge, active: false }).active).toBe(false);
  });
  test("the key is a lowercase slug of 3–40 characters", () => {
    for (const key of ["ab", "-juara", "juara-", "juara kelas", "juara_kelas", "a".repeat(41)]) expect(rejects(() => badgeInput({ ...badge, key }))).toBe(400);
  });
  test("icon and criterion come from the shared sets", () => {
    expect(rejects(() => badgeInput({ ...badge, icon: "trophy" }))).toBe(400);
    expect(rejects(() => badgeInput({ ...badge, criterion: "attendance" }))).toBe(400);
  });
  test("the threshold is a whole number within range", () => {
    for (const threshold of [0, 100001, 2.5, "10"]) expect(rejects(() => badgeInput({ ...badge, threshold }))).toBe(400);
  });
  test("text fields are bounded and required", () => {
    expect(rejects(() => badgeInput({ ...badge, name: "" }))).toBe(400);
    expect(rejects(() => badgeInput({ ...badge, name: "a".repeat(81) }))).toBe(400);
    expect(rejects(() => badgeInput({ ...badge, description: "a".repeat(301) }))).toBe(400);
    expect(rejects(() => badgeInput({ ...badge, active: "yes" }))).toBe(400);
  });
});

describe("identifier input", () => {
  test("a student id must be a UUID", () => {
    const id = crypto.randomUUID();
    expect(studentIdInput(id.toUpperCase())).toBe(id);
    expect(rejects(() => studentIdInput("not-a-uuid"))).toBe(400);
  });
  test("the leaderboard class filter is optional and validated", () => {
    expect(leaderboardFilter(new URL("http://localhost/api/gamification/leaderboard"))).toBeNull();
    const id = crypto.randomUUID();
    expect(leaderboardFilter(new URL(`http://localhost/api/gamification/leaderboard?classId=${id}`))).toBe(id);
    expect(rejects(() => leaderboardFilter(new URL("http://localhost/api/gamification/leaderboard?classId=abc")))).toBe(400);
  });
});
