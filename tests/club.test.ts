import { describe, expect, test } from "bun:test";
import { clubArchivedInput, clubCourseInput, clubCreateInput, clubGoalsInput, clubGroupFilter, clubGroupInput, clubGroupMemberInput, clubMemberInput, clubProfileInput, clubTrackInput } from "../src/modules/club/input";
import { clubFlow, clubGroupCapacity, clubGroupLevels, clubRoles, maxClubGoals } from "../src/shared/club";

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
  test("a track derives its slug from the name and carries an ordered position", () => {
    expect(clubTrackInput({ name: " Olympiad Track " })).toEqual({
      trackId: null, slug: "olympiad-track", name: "Olympiad Track", tagline: "", description: "", position: 1, archived: false,
    });
    expect(clubTrackInput({ name: "Product Track", slug: " Product ", position: 2, tagline: " Web ", archived: true }))
      .toMatchObject({ slug: "product", position: 2, tagline: "Web", archived: true });
    expect(clubTrackInput({ trackId: id, name: "Track" }).trackId).toBe(id);
    expect(() => clubTrackInput({ name: "Track", slug: "Spasi tidak boleh" })).toThrow();
    expect(() => clubTrackInput({ name: "Track", position: 0 })).toThrow();
    expect(() => clubTrackInput({ name: "Track", position: 21 })).toThrow();
    expect(() => clubTrackInput({ name: "Track", archived: "ya" })).toThrow();
    expect(() => clubTrackInput({ trackId: "bukan-uuid", name: "Track" })).toThrow();
  });
  test("a group keeps level and capacity inside their range and lets track and mentor be empty", () => {
    expect(clubGroupInput({ name: " Kelompok A " })).toEqual({
      groupId: null, trackId: null, mentorId: null, name: "Kelompok A", topic: "", schedule: "", note: "",
      level: 1, capacity: clubGroupCapacity.default, archived: false,
    });
    expect(clubGroupInput({ name: "Kelompok", level: 4, capacity: 7, trackId: id, mentorId: id, topic: " HTML ", schedule: "Sabtu" }))
      .toMatchObject({ level: 4, capacity: 7, trackId: id, mentorId: id, topic: "HTML", schedule: "Sabtu" });
    expect(Object.keys(clubGroupLevels)).toEqual(["1", "2", "3", "4"]);
    expect(() => clubGroupInput({ name: "Kelompok", level: 0 })).toThrow();
    expect(() => clubGroupInput({ name: "Kelompok", level: 5 })).toThrow();
    expect(() => clubGroupInput({ name: "Kelompok", capacity: clubGroupCapacity.min - 1 })).toThrow();
    expect(() => clubGroupInput({ name: "Kelompok", capacity: clubGroupCapacity.max + 1 })).toThrow();
    expect(() => clubGroupInput({ name: "Kelompok", mentorId: "bukan-uuid" })).toThrow();
    expect(() => clubGroupInput({ name: "" })).toThrow();
  });
  test("group membership needs both ids and an explicit removal flag", () => {
    expect(clubGroupMemberInput({ groupId: id, userId: id })).toEqual({ groupId: id, userId: id, removed: false });
    expect(clubGroupMemberInput({ groupId: id, userId: id, removed: true }).removed).toBe(true);
    expect(() => clubGroupMemberInput({ groupId: id })).toThrow();
    expect(() => clubGroupMemberInput({ groupId: id, userId: id, removed: "ya" })).toThrow();
  });
  test("group filters reject a value outside the known set instead of listing everything", () => {
    const url = (query: string) => new URL(`https://salaam.test/api/clubs/${id}/groups${query}`);
    expect(clubGroupFilter(url(""))).toEqual({ trackId: "", level: 0 });
    expect(clubGroupFilter(url(`?trackId=${id}&level=3`))).toEqual({ trackId: id, level: 3 });
    expect(() => clubGroupFilter(url("?trackId=bukan-uuid"))).toThrow();
    expect(() => clubGroupFilter(url("?level=9"))).toThrow();
    expect(() => clubGroupFilter(url("?level=pemula"))).toThrow();
  });
  test("the learning flow is a fixed seven-step strip", () => {
    expect(clubFlow).toEqual(["Belajar", "Berlatih", "Challenge", "Membangun", "Review", "Showcase", "Bertumbuh"]);
  });
});
