import { describe, expect, test } from "bun:test";
import { clubArchivedInput, clubCourseInput, clubCreateInput, clubGoalsInput, clubMemberInput, clubProfileInput } from "../src/modules/club/input";
import { clubFlow, clubRoles, maxClubGoals } from "../src/shared/club";

const id = crypto.randomUUID();
describe("club input validation", () => {
  test("profile keeps the name required and the narrative blocks optional", () => {
    expect(clubProfileInput({ name: "  Coders Club  " })).toEqual({ name: "Coders Club", tagline: "", purpose: "", direction: "", program: "" });
    expect(clubProfileInput({ name: "Coders Club", tagline: " Ruang koding ", purpose: "Tujuan", direction: "Arah", program: "Program" }))
      .toEqual({ name: "Coders Club", tagline: "Ruang koding", purpose: "Tujuan", direction: "Arah", program: "Program" });
    expect(() => clubProfileInput({ name: "   " })).toThrow();
    expect(() => clubProfileInput({ name: "a".repeat(101) })).toThrow();
    expect(() => clubProfileInput({ name: "Klub", tagline: "a".repeat(201) })).toThrow();
    expect(() => clubProfileInput({ name: "Klub", purpose: "a".repeat(4001) })).toThrow();
    expect(() => clubProfileInput({ name: "Klub", purpose: 12 })).toThrow();
  });
  test("creating a club derives the slug from the name unless one is given", () => {
    expect(clubCreateInput({ name: "Multimedia Club" })).toEqual({ name: "Multimedia Club", slug: "multimedia-club", tagline: "", purpose: "", direction: "", program: "" });
    expect(clubCreateInput({ name: "Klub Robotik & IoT" }).slug).toBe("klub-robotik-iot");
    expect(clubCreateInput({ name: "Builders Club", slug: " Builders-2026 " }).slug).toBe("builders-2026");
    expect(() => clubCreateInput({ name: "AB" })).toThrow();
    expect(() => clubCreateInput({ name: "Klub", slug: "Spasi tidak boleh" })).toThrow();
    expect(() => clubCreateInput({ name: "Klub", slug: "-awalan" })).toThrow();
    expect(() => clubCreateInput({ name: "Klub", slug: "a".repeat(41) })).toThrow();
  });
  test("archiving takes an explicit boolean", () => {
    expect(clubArchivedInput({ archived: true })).toBe(true);
    expect(clubArchivedInput({ archived: false })).toBe(false);
    expect(() => clubArchivedInput({})).toThrow();
    expect(() => clubArchivedInput({ archived: "1" })).toThrow();
  });
  test("goals are an ordered list with generated positions", () => {
    expect(clubGoalsInput({ goals: [{ title: " Dasar ", description: " Logika " }, { title: "Proyek" }] })).toEqual([
      { position: 1, title: "Dasar", description: "Logika" },
      { position: 2, title: "Proyek", description: "" },
    ]);
    expect(clubGoalsInput({ goals: [] })).toEqual([]);
    expect(() => clubGoalsInput({ goals: Array.from({ length: maxClubGoals + 1 }, () => ({ title: "Tujuan" })) })).toThrow();
    expect(() => clubGoalsInput({ goals: "Dasar" })).toThrow();
    expect(() => clubGoalsInput({ goals: ["Dasar"] })).toThrow();
    expect(() => clubGoalsInput({ goals: [{ title: "" }] })).toThrow();
    expect(() => clubGoalsInput({ goals: [{ title: "Dasar", description: "a".repeat(501) }] })).toThrow();
  });
  test("membership accepts one known role and an explicit removal flag", () => {
    expect(clubMemberInput({ userId: id, role: "mentor" })).toEqual({ userId: id, role: "mentor", removed: false });
    expect(clubMemberInput({ userId: id, role: "member", removed: true })).toEqual({ userId: id, role: "member", removed: true });
    expect(clubRoles).toEqual(["mentor", "member"]);
    expect(() => clubMemberInput({ userId: id, role: "owner" })).toThrow();
    expect(() => clubMemberInput({ userId: "bukan-uuid", role: "member" })).toThrow();
    expect(() => clubMemberInput({ userId: id, role: "member", removed: "ya" })).toThrow();
  });
  test("course linking needs a course id and a boolean state", () => {
    expect(clubCourseInput({ courseId: id, linked: true })).toEqual({ courseId: id, linked: true });
    expect(() => clubCourseInput({ courseId: id, linked: "true" })).toThrow();
    expect(() => clubCourseInput({ courseId: "x", linked: false })).toThrow();
  });
  test("the learning flow is a fixed seven-step strip", () => {
    expect(clubFlow).toEqual(["Belajar", "Berlatih", "Challenge", "Membangun", "Review", "Showcase", "Bertumbuh"]);
  });
});
