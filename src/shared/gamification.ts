export type RewardRuleKey = "lesson.completed" | "assignment.graded" | "assessment.completed" | "project.approved";
export type XpSourceType = "lessons" | "submissions" | "activities" | "projects";
export type BadgeCriterion = "xp_total" | "lessons_completed" | "assignments_graded" | "assessments_completed" | "projects_approved";
export type BadgeIcon = "star" | "academic" | "book" | "board" | "assignment" | "quiz" | "layers" | "briefcase";

export const rewardRuleKeys: RewardRuleKey[] = ["lesson.completed", "assignment.graded", "assessment.completed", "project.approved"];
export const badgeCriteria: BadgeCriterion[] = ["xp_total", "lessons_completed", "assignments_graded", "assessments_completed", "projects_approved"];
export const badgeIcons: BadgeIcon[] = ["star", "academic", "book", "board", "assignment", "quiz", "layers", "briefcase"];
export const maxRulePoints = 1000;
export const maxBadgeThreshold = 100000;

// Cumulative XP needed to reach each level. Levels are derived, never stored, so changing
// this table re-levels everyone on the next read without a backfill.
export const levelThresholds = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000] as const;
export const maxLevel = levelThresholds.length;

export interface Level { level: number; total: number; levelAt: number; nextAt: number | null }
// `levelAt` is the total that opened the current level and `nextAt` the one that opens the
// next, so a progress bar needs no extra arithmetic. `nextAt` is null at the top level.
export function levelFor(total: number): Level {
  const points = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  let level = 1;
  while (level < maxLevel && points >= levelThresholds[level]!) level++;
  return { level, total: points, levelAt: levelThresholds[level - 1]!, nextAt: level < maxLevel ? levelThresholds[level]! : null };
}

export interface RewardRule { key: RewardRuleKey; description: string; points: number; updatedAt: string }
export interface Badge {
  id: string; key: string; name: string; description: string; icon: BadgeIcon;
  criterion: BadgeCriterion; threshold: number; active: boolean;
  earnedAt: string | null; progress: number;
}
export interface XpEntry { id: string; ruleKey: RewardRuleKey; points: number; sourceType: XpSourceType; sourceId: string; courseName: string | null; awardedAt: string }
export interface GrowthCounters { lessonsCompleted: number; assignmentsGraded: number; assessmentsCompleted: number; projectsApproved: number }
export interface GrowthSummary {
  student: { id: string; name: string };
  level: Level;
  counters: GrowthCounters;
  badges: Badge[];
  entries: XpEntry[];
  canManageRules: boolean;
}
export interface LeaderboardRow { studentId: string; studentName: string; className: string; total: number; level: number; badges: number }
