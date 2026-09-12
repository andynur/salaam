export type TeamMode = "individual" | "team";
export type ProjectStatus = "in_progress" | "submitted" | "changes_requested" | "approved";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type ReviewDecision = "approved" | "changes_requested";
export const taskStatuses: TaskStatus[] = ["todo", "in_progress", "review", "done"];
export const projectStatuses: ProjectStatus[] = ["in_progress", "submitted", "changes_requested", "approved"];
export const maxActiveTasks = 200;

export interface ChallengeSettings { teamMode: TeamMode; maxTeamSize: number }
// `teamLocked` once any project exists; `locked` once any project was submitted.
// Students receive their own project only; managers receive the project count.
export interface Challenge {
  id: string; lessonId: string; kind: "challenge"; title: string; instructions: string; dueAt: string | null; published: boolean; archived: boolean;
  settings: ChallengeSettings; projectCount: number; teamLocked: boolean; locked: boolean;
  project: { id: string; title: string; status: ProjectStatus } | null;
}
export interface ProjectMember { id: string; name: string }
export interface ProjectRow {
  id: string; title: string; status: ProjectStatus; courseId: string; courseName: string; className: string; challengeId: string; challengeTitle: string;
  teamMode: TeamMode; dueAt: string | null; members: ProjectMember[]; taskCount: number; doneCount: number; showcased: boolean; updatedAt: string;
}
export interface ProjectTask { id: string; title: string; description: string; status: TaskStatus; position: number; assigneeId: string | null; assigneeName: string | null; dueAt: string | null; labels: string[]; version: number; updatedAt: string }
export interface ProjectReview { id: string; decision: ReviewDecision; score: number | null; feedback: string; reviewerName: string; createdAt: string }
export interface ProjectDetail {
  project: { id: string; title: string; summary: string; deliverableUrl: string | null; status: ProjectStatus; firstSubmittedAt: string | null; submittedAt: string | null; showcasedAt: string | null; updatedAt: string };
  course: { id: string; name: string; className: string };
  challenge: { id: string; lessonId: string; title: string; instructions: string; dueAt: string | null; closed: boolean; teamMode: TeamMode; maxTeamSize: number };
  members: ProjectMember[]; tasks: ProjectTask[]; reviews: ProjectReview[];
  canManage: boolean; isMember: boolean; canEdit: boolean;
  portfolio: { reflection: string; archived: boolean; updatedAt: string } | null;
}
export interface ShowcaseItem { id: string; title: string; summary: string; deliverableUrl: string | null; courseName: string; className: string; challengeTitle: string; members: ProjectMember[]; showcasedAt: string; canOpen: boolean }
export interface PortfolioEntry { id: string; projectId: string; projectTitle: string; summary: string; deliverableUrl: string | null; courseName: string; challengeTitle: string; reflection: string; score: number | null; members: ProjectMember[]; updatedAt: string; canOpen: boolean }
