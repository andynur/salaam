import type { LearningCourse } from "./learning";
import type { Meeting } from "./attendance";

export type ClubRole = "mentor" | "member";
export const clubRoles: ClubRole[] = ["mentor", "member"];
export const clubRoleLabels: Record<ClubRole, string> = { mentor: "Mentor", member: "Anggota" };
// The club's learning flow, shown on the overview. It names existing SALAAM surfaces
// rather than adding stages of its own.
export const clubFlow = ["Belajar", "Berlatih", "Challenge", "Membangun", "Review", "Showcase", "Bertumbuh"];
export const maxClubGoals = 20;
export const maxClubTracks = 20;
// A mentoring group is a small circle: one mentor and a handful of santri on one topic.
// Levels name how far the group has come, not the santri's class.
export const clubGroupLevels: Record<number, string> = {
  1: "Level 1 · Pemula", 2: "Level 2 · Dasar", 3: "Level 3 · Menengah", 4: "Level 4 · Lanjutan",
};
export const clubGroupLevelValues = [1, 2, 3, 4];
export const clubGroupCapacity = { min: 2, max: 20, default: 8 };
// Slugs are the club's stable identity in URLs and seeds; the database enforces the shape.
export const clubSlugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const maxClubText = 4000;

export interface ClubSummary {
  id: string; slug: string; name: string; tagline: string; published: boolean; archived: boolean;
  membership: ClubRole | null; canManage: boolean; canAdmin: boolean; mentors: number; members: number; courses: number;
}
export interface ClubGoal { position: number; title: string; description: string }
// `groupId` and `groupName` are the santri's active mentoring group in this club, so the
// members tab can show who guides whom without a second request.
export interface ClubPerson {
  userId: string; name: string; role: ClubRole; joinedAt: string;
  groupId?: string | null; groupName?: string | null;
  // The santri's class in the latest active academic year; it colours the avatar by grade.
  className?: string | null;
}
export interface ClubTrack {
  id: string; slug: string; name: string; tagline: string; description: string;
  position: number; archived: boolean; groups: number; members: number;
}
export interface ClubGroupRow {
  id: string; name: string; topic: string; level: number; capacity: number; schedule: string; note: string; archived: boolean;
  trackId: string | null; trackName: string | null;
  mentorId: string | null; mentorName: string | null; mentorRole: ClubRole | null;
  memberCount: number; members: { id: string; name: string }[]; mine: boolean;
}
export interface ClubDetail extends ClubSummary {
  purpose: string; direction: string; program: string; goals: ClubGoal[]; mentorList: ClubPerson[];
  stats: { lessons: number; challenges: number; projects: number; approvedProjects: number; sessions: number; xp: number };
}
// One linked course with the counts the club overview needs; `canManage` follows the
// course's own teaching assignment, never club membership.
export interface ClubCourseRow extends LearningCourse { lessons: number; activities: number; challenges: number; linkedAt: string }
export interface ClubChallengeRow {
  id: string; courseId: string; courseName: string; lessonId: string; title: string; dueAt: string | null;
  teamMode: "individual" | "team"; maxTeamSize: number; projectCount: number; myProjectId: string | null;
}
export interface ClubMeetingRow extends Meeting { courseName: string }
export interface ClubProgressRow {
  studentId: string; studentName: string; className: string | null; role: ClubRole; xp: number; level: number; badges: number;
  lessonsCompleted: number; projectsApproved: number;
}
