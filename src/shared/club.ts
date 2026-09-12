import type { LearningCourse } from "./learning";
import type { Meeting } from "./attendance";

export type ClubRole = "mentor" | "member";
export const clubRoles: ClubRole[] = ["mentor", "member"];
export const clubRoleLabels: Record<ClubRole, string> = { mentor: "Mentor", member: "Anggota" };
// The club's learning flow, shown on the overview. It names existing SALAAM surfaces
// rather than adding stages of its own.
export const clubFlow = ["Belajar", "Berlatih", "Challenge", "Membangun", "Review", "Showcase", "Bertumbuh"];
export const maxClubGoals = 20;
// Slugs are the club's stable identity in URLs and seeds; the database enforces the shape.
export const clubSlugPattern = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const maxClubText = 4000;

export interface ClubSummary {
  id: string; slug: string; name: string; tagline: string; published: boolean; archived: boolean;
  membership: ClubRole | null; canManage: boolean; canAdmin: boolean; mentors: number; members: number; courses: number;
}
export interface ClubGoal { position: number; title: string; description: string }
export interface ClubPerson { userId: string; name: string; role: ClubRole; joinedAt: string }
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
  studentId: string; studentName: string; role: ClubRole; xp: number; level: number; badges: number;
  lessonsCompleted: number; projectsApproved: number;
}
