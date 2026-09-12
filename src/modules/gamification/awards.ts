import { enqueueLevel } from "../calendar/notifications";
import { levelFor } from "../../shared/gamification";
import type { SQL } from "bun";
import { recordAudit } from "../../core/audit/repository";
import type { RewardRuleKey, XpSourceType } from "../../shared/gamification";

// XP is awarded inside the transaction that records the event it rewards, so a rolled back
// grade, completion, attempt, or review leaves no XP behind. Every award is idempotent:
// the ledger holds at most one row per student and source, so retries, regrades, repeated
// attempts, and concurrent requests add nothing.
//
// Counters come from the ledger itself rather than from the learning tables, so badges
// count rewarded events and there is one source of truth for both XP and badges.
//
// Awards every active badge whose criterion has reached its threshold. Concurrent awards
// for one student race safely: the primary key makes a duplicate insert a no-op.
async function evaluateBadges(tx: SQL, studentId: string, requestId: string) {
  const earned = await tx<{ id: string }[]>`WITH counters AS (
      SELECT COALESCE(sum(points), 0)::int AS xp_total,
        count(*) FILTER (WHERE rule_key = 'lesson.completed')::int AS lessons_completed,
        count(*) FILTER (WHERE rule_key = 'assignment.graded')::int AS assignments_graded,
        count(*) FILTER (WHERE rule_key = 'assessment.completed')::int AS assessments_completed,
        count(*) FILTER (WHERE rule_key = 'project.approved')::int AS projects_approved
      FROM xp_entries WHERE student_id = ${studentId}
    )
    INSERT INTO badge_awards (badge_id, student_id)
    SELECT b.id, ${studentId} FROM badges b, counters c
    WHERE b.active AND b.threshold <= CASE b.criterion
      WHEN 'xp_total' THEN c.xp_total
      WHEN 'lessons_completed' THEN c.lessons_completed
      WHEN 'assignments_graded' THEN c.assignments_graded
      WHEN 'assessments_completed' THEN c.assessments_completed
      ELSE c.projects_approved END
    ON CONFLICT DO NOTHING RETURNING badge_id AS id`;
  // A badge is earned by the system, not by the actor who triggered the award.
  for (const badge of earned) await recordAudit(tx, null, "gamification.badge.awarded", "badge_awards", badge.id, requestId);
  return earned.length;
}

export async function awardXp(tx: SQL, studentId: string, ruleKey: RewardRuleKey, sourceType: XpSourceType, sourceId: string, courseId: string | null, requestId: string) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${"xp:" + studentId}, 0))`;
  const inserted = await tx<{ id: string; points: number }[]>`INSERT INTO xp_entries (student_id, rule_key, source_type, source_id, course_id, points)
    SELECT ${studentId}, ${ruleKey}, ${sourceType}, ${sourceId}, ${courseId}::uuid, r.points FROM reward_rules r WHERE r.key = ${ruleKey}
    ON CONFLICT (student_id, source_type, source_id) DO NOTHING RETURNING id, points`;
  // Nothing changed on a repeat, so badges do not need re-evaluating.
  if (!inserted.length) return { awarded: false, badges: 0 };
  const [total] = await tx<{ total: number }[]>`SELECT COALESCE(sum(points), 0)::int AS total FROM xp_entries WHERE student_id = ${studentId}`;
  const previousLevel = levelFor(total!.total - inserted[0]!.points).level;
  for (let level = previousLevel + 1; level <= levelFor(total!.total).level; level++) await enqueueLevel(tx, studentId, level);
  return { awarded: true, badges: await evaluateBadges(tx, studentId, requestId) };
}

// Every member of an approved project is rewarded.
export async function awardProjectApproval(tx: SQL, projectId: string, courseId: string, requestId: string) {
  const members = await tx<{ studentId: string }[]>`SELECT student_id AS "studentId" FROM project_members WHERE project_id = ${projectId} ORDER BY student_id`;
  for (const member of members) await awardXp(tx, member.studentId, "project.approved", "projects", projectId, courseId, requestId);
  return members.length;
}
