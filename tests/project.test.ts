import { expect, test } from "bun:test";
import { challengeInput, memberIdsInput, moveInput, projectFilters, projectInput, reflectionInput, reviewInput, showcaseInput, taskInput } from "../src/modules/projects/input";

test("challenges are individual or team-based with bounded team sizes and deadlines", () => {
  expect(challengeInput({ title: " Poster ", instructions: "Buat poster", teamMode: "individual" })).toEqual({ title: "Poster", instructions: "Buat poster", dueAt: null, teamMode: "individual", maxTeamSize: 1 });
  expect(challengeInput({ title: "Web", instructions: "x", teamMode: "team", maxTeamSize: 4, dueAt: "2026-10-01T10:00:00Z" })).toMatchObject({ teamMode: "team", maxTeamSize: 4, dueAt: "2026-10-01T10:00:00.000Z" });
  for (const body of [
    { title: "x", instructions: "x", teamMode: "pair" },
    { title: "x", instructions: "x", teamMode: "individual", maxTeamSize: 2 },
    { title: "x", instructions: "x", teamMode: "team" },
    { title: "x", instructions: "x", teamMode: "team", maxTeamSize: 1 },
    { title: "x", instructions: "x", teamMode: "team", maxTeamSize: 11 },
    { title: "x", instructions: "x", teamMode: "team", maxTeamSize: 2.5 },
    { title: "x", instructions: "x", teamMode: "individual", dueAt: "besok" },
    { title: " ", instructions: "x", teamMode: "individual" },
  ]) expect(() => challengeInput(body)).toThrow();
});

test("project details accept only HTTP(S) deliverable links without credentials", () => {
  expect(projectInput({ title: "Robot", summary: " Hasil ", deliverableUrl: "" })).toEqual({ title: "Robot", summary: "Hasil", deliverableUrl: null });
  expect(projectInput({ title: "Robot", deliverableUrl: "https://example.test/karya" }).deliverableUrl).toBe("https://example.test/karya");
  for (const body of [
    { title: "Robot", deliverableUrl: "javascript:alert(1)" },
    { title: "Robot", deliverableUrl: "https://user:secret@example.test" },
    { title: "Robot", summary: "x".repeat(5001) },
    { title: "", summary: "x" },
  ]) expect(() => projectInput(body)).toThrow();
});

test("team members, cards, moves and reviews are strictly validated", () => {
  const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
  expect(memberIdsInput({ memberIds: [a, b.toUpperCase()] })).toEqual([a, b]);
  for (const memberIds of [[], [a, a], ["bad"], Array.from({ length: 11 }, () => crypto.randomUUID()), a]) expect(() => memberIdsInput({ memberIds })).toThrow();
  expect(taskInput({ title: "Riset", assigneeId: "" })).toEqual({ title: "Riset", description: "", assigneeId: null, status: "todo" });
  expect(taskInput({ title: "Riset", status: "review", assigneeId: a }).status).toBe("review");
  expect(() => taskInput({ title: "Riset", status: "blocked" })).toThrow();
  expect(moveInput({ status: "done", position: 0, version: 3 })).toEqual({ status: "done", position: 0, version: 3 });
  for (const body of [{ status: "done", position: -1, version: 1 }, { status: "done", position: 0, version: 0 }, { status: "later", position: 0, version: 1 }, { status: "done", position: 1.5, version: 1 }]) {
    expect(() => moveInput(body)).toThrow();
  }
  expect(reviewInput({ decision: "approved", score: 88.5, feedback: " Bagus " })).toEqual({ decision: "approved", score: 88.5, feedback: "Bagus" });
  expect(reviewInput({ decision: "changes_requested", feedback: "Lengkapi dokumentasi" })).toEqual({ decision: "changes_requested", score: null, feedback: "Lengkapi dokumentasi" });
  for (const body of [
    { decision: "approved", feedback: "x" },
    { decision: "approved", score: 101, feedback: "x" },
    { decision: "approved", score: 1.001, feedback: "x" },
    { decision: "changes_requested", score: 50, feedback: "x" },
    { decision: "rejected", feedback: "x" },
    { decision: "approved", score: 80, feedback: " " },
  ]) expect(() => reviewInput(body)).toThrow();
  expect(showcaseInput({ showcased: false })).toBe(false);
  expect(() => showcaseInput({ showcased: "yes" })).toThrow();
  expect(reflectionInput({ reflection: " Saya belajar kerja tim. " })).toBe("Saya belajar kerja tim.");
  expect(() => reflectionInput({ reflection: "" })).toThrow();
});

test("project list filters accept known statuses and challenge IDs only", () => {
  const id = crypto.randomUUID();
  expect(projectFilters(new URL(`http://x/api/projects?status=submitted&activityId=${id}`))).toEqual({ status: "submitted", activityId: id });
  expect(projectFilters(new URL("http://x/api/projects"))).toEqual({ status: null, activityId: null });
  expect(() => projectFilters(new URL("http://x/api/projects?status=done"))).toThrow();
  expect(() => projectFilters(new URL("http://x/api/projects?activityId=1"))).toThrow();
});
