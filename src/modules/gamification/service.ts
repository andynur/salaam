import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { recordAudit } from "../../core/audit/repository";
import { notFound } from "../learning/access";
import { badgeInput, rulePointsInput, ruleKeyInput } from "./input";
import { levelFor, type Badge, type GrowthCounters, type GrowthSummary, type LeaderboardRow, type RewardRule, type XpEntry } from "../../shared/gamification";

const can = (actor: Actor, permission: string) => actor.permissions.includes(permission);

// A student reads their own growth. A teacher reads a student in a class they teach, and
// learning.manage.all reads anyone; anything else is 404, like every other scope check.
async function studentScope(db: SQL, actor: Actor, studentId: string | null) {
  requirePermission(actor, "learning.view");
  const target = studentId ?? actor.id;
  if (target !== actor.id) {
    if (!can(actor, "learning.manage")) notFound();
    if (!can(actor, "learning.manage.all")) {
      const rows = await db`SELECT 1 FROM class_members cm JOIN courses c ON c.class_id = cm.class_id
        JOIN teaching_assignments ta ON ta.course_id = c.id
        WHERE cm.student_id = ${target} AND ta.teacher_id = ${actor.id} LIMIT 1`;
      if (!rows.length) notFound();
    }
  }
  const student = (await db<{ id: string; name: string }[]>`SELECT id, display_name AS name FROM users WHERE id = ${target} AND is_active`)[0];
  if (!student) notFound();
  return student;
}

export async function growthSummary(db: SQL, actor: Actor, studentId: string | null): Promise<GrowthSummary> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const student = await studentScope(tx, actor, studentId);
    const counters = (await tx<(GrowthCounters & { xpTotal: number })[]>`SELECT COALESCE(sum(points), 0)::int AS "xpTotal",
        count(*) FILTER (WHERE rule_key = 'lesson.completed')::int AS "lessonsCompleted",
        count(*) FILTER (WHERE rule_key = 'assignment.graded')::int AS "assignmentsGraded",
        count(*) FILTER (WHERE rule_key = 'assessment.completed')::int AS "assessmentsCompleted",
        count(*) FILTER (WHERE rule_key = 'project.approved')::int AS "projectsApproved"
      FROM xp_entries WHERE student_id = ${student.id}`)[0]!;
    const { xpTotal, ...rest } = counters;
    // Locked badges are listed too, with the student's progress toward each threshold.
    const badges = await tx<Badge[]>`SELECT b.id, b.key, b.name, b.description, b.icon, b.criterion, b.threshold, b.active,
        ba.awarded_at::text AS "earnedAt",
        CASE b.criterion
          WHEN 'xp_total' THEN ${xpTotal}::int
          WHEN 'lessons_completed' THEN ${rest.lessonsCompleted}::int
          WHEN 'assignments_graded' THEN ${rest.assignmentsGraded}::int
          WHEN 'assessments_completed' THEN ${rest.assessmentsCompleted}::int
          ELSE ${rest.projectsApproved}::int END AS progress
      FROM badges b LEFT JOIN badge_awards ba ON ba.badge_id = b.id AND ba.student_id = ${student.id}
      WHERE b.active OR ba.student_id IS NOT NULL
      ORDER BY ba.awarded_at IS NULL, ba.awarded_at DESC, b.criterion, b.threshold, b.key`;
    const entries = await tx<XpEntry[]>`SELECT x.id, x.rule_key AS "ruleKey", x.points, x.source_type AS "sourceType", x.source_id AS "sourceId",
        c.name AS "courseName", x.awarded_at::text AS "awardedAt"
      FROM xp_entries x LEFT JOIN courses c ON c.id = x.course_id
      WHERE x.student_id = ${student.id} ORDER BY x.awarded_at DESC, x.id DESC LIMIT 50`;
    return { student, level: levelFor(xpTotal), counters: rest, badges, entries, canManageRules: can(actor, "academic.manage") };
  });
}

// Teachers compare their own classes. Students see only the current active class they belong
// to; arbitrary class filters from a student client are ignored.
export async function leaderboard(db: SQL, actor: Actor, classId: string | null, pattern: string, offset: number) {
  const manager = can(actor, "learning.manage");
  if (manager) requirePermission(actor, "learning.manage");
  else requirePermission(actor, "learning.participate");
  let scopedClassId = classId;
  if (!manager) {
    const [membership] = await db<{ classId: string }[]>`SELECT cm.class_id AS "classId" FROM class_members cm JOIN classes c ON c.id = cm.class_id
      JOIN academic_years y ON y.id = c.academic_year_id WHERE cm.student_id = ${actor.id} AND c.archived_at IS NULL
      AND y.archived_at IS NULL AND y.starts_on <= CURRENT_DATE AND y.ends_on >= CURRENT_DATE
      ORDER BY y.starts_on DESC, c.id LIMIT 1`;
    scopedClassId = membership?.classId ?? null;
  }
  const rows = await db<Omit<LeaderboardRow, "level">[]>`SELECT u.id AS "studentId", u.display_name AS "studentName", cl.name AS "className",
      COALESCE((SELECT sum(x.points)::int FROM xp_entries x WHERE x.student_id = u.id), 0) AS total,
      (SELECT count(*)::int FROM badge_awards ba WHERE ba.student_id = u.id) AS badges
    FROM class_members cm JOIN users u ON u.id = cm.student_id JOIN classes cl ON cl.id = cm.class_id
    WHERE u.is_active AND u.display_name ILIKE ${pattern}
      AND (${manager || scopedClassId !== null} AND (${scopedClassId}::uuid IS NULL OR cl.id = ${scopedClassId}::uuid))
      AND (${!manager || can(actor, "learning.manage.all")} OR EXISTS (SELECT 1 FROM courses c JOIN teaching_assignments ta ON ta.course_id = c.id
        WHERE c.class_id = cl.id AND ta.teacher_id = ${actor.id}))
    ORDER BY total DESC, u.display_name, u.id LIMIT 51 OFFSET ${offset}`;
  return rows.map(row => ({ ...row, level: levelFor(row.total).level }));
}

export async function listRules(db: SQL, actor: Actor) {
  requirePermission(actor, "academic.manage");
  return db<RewardRule[]>`SELECT key, description, points, updated_at::text AS "updatedAt" FROM reward_rules ORDER BY key`;
}

export async function updateRule(db: SQL, actor: Actor, key: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "academic.manage");
  const ruleKey = ruleKeyInput(key);
  const points = rulePointsInput(body);
  return db.begin(async tx => {
    // Existing ledger rows keep the points they were awarded with; a rule change only
    // affects later awards, so past totals stay explainable.
    const rows = await tx<{ id: string }[]>`UPDATE reward_rules SET points = ${points}, updated_at = clock_timestamp() WHERE key = ${ruleKey} RETURNING id`;
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, "gamification.rule.updated", "reward_rules", rows[0]!.id, requestId);
    return { key: ruleKey, points };
  });
}

export async function listBadges(db: SQL, actor: Actor, pattern: string, offset: number) {
  requirePermission(actor, "academic.manage");
  return db<Badge[]>`SELECT b.id, b.key, b.name, b.description, b.icon, b.criterion, b.threshold, b.active,
      NULL::text AS "earnedAt", (SELECT count(*)::int FROM badge_awards ba WHERE ba.badge_id = b.id) AS progress
    FROM badges b WHERE b.name ILIKE ${pattern} OR b.key ILIKE ${pattern}
    ORDER BY b.criterion, b.threshold, b.key LIMIT 51 OFFSET ${offset}`;
}

export async function saveBadge(db: SQL, actor: Actor, badgeId: string | null, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "academic.manage");
  const input = badgeInput(body);
  return db.begin(async tx => {
    const rows = badgeId
      ? await tx<{ id: string }[]>`UPDATE badges SET key = ${input.key}, name = ${input.name}, description = ${input.description}, icon = ${input.icon},
          criterion = ${input.criterion}, threshold = ${input.threshold}, active = ${input.active}, updated_at = clock_timestamp()
        WHERE id = ${badgeId} RETURNING id`
      : await tx<{ id: string }[]>`INSERT INTO badges (key, name, description, icon, criterion, threshold, active)
        VALUES (${input.key}, ${input.name}, ${input.description}, ${input.icon}, ${input.criterion}, ${input.threshold}, ${input.active}) RETURNING id`;
    if (!rows.length) notFound();
    const saved = rows[0]!;
    await recordAudit(tx, actor.id, `gamification.badge.${badgeId ? "updated" : "created"}`, "badges", saved.id, requestId);
    return saved;
  });
}

export async function studentGrowthCard(db: SQL, actor: Actor) {
  if (!can(actor, "learning.participate")) return null;
  const row = (await db<{ total: number; badges: number }[]>`SELECT COALESCE((SELECT sum(points)::int FROM xp_entries WHERE student_id = ${actor.id}), 0) AS total,
    (SELECT count(*)::int FROM badge_awards WHERE student_id = ${actor.id}) AS badges`)[0]!;
  return { level: levelFor(row.total), badges: row.badges };
}
