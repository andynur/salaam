import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { archivedInput } from "../learning/input";
import { notFound } from "../learning/access";
import { reflectionInput } from "./input";
import { projectAccess } from "./service";
import type { PortfolioEntry, ShowcaseItem } from "../../shared/project";

const can = (actor: Actor, permission: string) => actor.permissions.includes(permission);

// The school showcase is readable by every signed-in user while the course and the
// challenge path stay published and unarchived. Scores and reviews are never included.
export async function listShowcase(db: SQL, actor: Actor, pattern: string, offset: number) {
  requirePermission(actor, "learning.view");
  return db<ShowcaseItem[]>`SELECT p.id, p.title, p.summary, p.deliverable_url AS "deliverableUrl", c.name AS "courseName", cl.name AS "className",
      a.title AS "challengeTitle", p.showcased_at::text AS "showcasedAt",
      (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.display_name) ORDER BY u.display_name, u.id), '[]'::json)
        FROM project_members pm JOIN users u ON u.id = pm.student_id WHERE pm.project_id = p.id) AS members,
      ((${can(actor, "learning.manage")} AND (${can(actor, "learning.manage.all")} OR EXISTS
          (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${actor.id})))
        OR (${can(actor, "learning.participate")} AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.student_id = ${actor.id})
          AND EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.class_id AND cm.student_id = ${actor.id}))) AS "canOpen"
    FROM projects p JOIN activities a ON a.id = p.activity_id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    JOIN courses c ON c.id = p.course_id JOIN classes cl ON cl.id = c.class_id
    WHERE p.showcased_at IS NOT NULL AND (p.title ILIKE ${pattern} OR c.name ILIKE ${pattern} OR a.title ILIKE ${pattern})
      AND c.published AND a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL
    ORDER BY p.showcased_at DESC, p.id LIMIT 51 OFFSET ${offset}`;
}

// Portfolio entries belong to the student: they stay listed after the class year ends or
// the challenge is archived. `canOpen` says whether the project page is still reachable.
export async function listPortfolio(db: SQL, actor: Actor, offset: number) {
  requirePermission(actor, "learning.participate");
  return db<PortfolioEntry[]>`SELECT e.id, p.id AS "projectId", p.title AS "projectTitle", p.summary, p.deliverable_url AS "deliverableUrl",
      c.name AS "courseName", a.title AS "challengeTitle", e.reflection, e.updated_at::text AS "updatedAt",
      (SELECT r.score::float8 FROM project_reviews r WHERE r.project_id = p.id AND r.decision = 'approved' ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS score,
      (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.display_name) ORDER BY u.display_name, u.id), '[]'::json)
        FROM project_members pm JOIN users u ON u.id = pm.student_id WHERE pm.project_id = p.id) AS members,
      (EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.class_id AND cm.student_id = ${actor.id})
        AND c.published AND a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL) AS "canOpen"
    FROM portfolio_entries e JOIN projects p ON p.id = e.project_id JOIN activities a ON a.id = p.activity_id
    JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = p.course_id
    WHERE e.student_id = ${actor.id} AND e.archived_at IS NULL
    ORDER BY e.updated_at DESC, e.id DESC LIMIT 51 OFFSET ${offset}`;
}

// Saving restores a removed entry, so adding back to the portfolio needs no separate path.
export async function savePortfolio(db: SQL, actor: Actor, projectId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.participate");
  const reflection = reflectionInput(body);
  return db.begin(async tx => {
    const access = await projectAccess(tx, actor, projectId, true);
    if (!access.isMember) notFound();
    if (access.status !== "approved") throw new HttpError(409, "NOT_APPROVED", "Proyek dapat masuk portfolio setelah disetujui guru.");
    const row = (await tx<{ id: string }[]>`INSERT INTO portfolio_entries (project_id, student_id, reflection) VALUES (${projectId}, ${actor.id}, ${reflection})
      ON CONFLICT (project_id, student_id) DO UPDATE SET reflection = EXCLUDED.reflection, archived_at = NULL, updated_at = clock_timestamp() RETURNING id`)[0]!;
    await recordAudit(tx, actor.id, "portfolio.saved", "portfolio_entries", row.id, requestId);
    return row;
  });
}

export async function archivePortfolio(db: SQL, actor: Actor, projectId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.participate");
  const archived = archivedInput(body);
  return db.begin(async tx => {
    const rows = await tx<{ id: string; changed: boolean }[]>`SELECT id, (archived_at IS NOT NULL) <> ${archived} AS changed FROM portfolio_entries
      WHERE project_id = ${projectId} AND student_id = ${actor.id} FOR UPDATE`;
    const entry = rows[0];
    if (!entry) notFound();
    if (entry.changed) {
      await tx`UPDATE portfolio_entries SET archived_at = CASE WHEN ${archived} THEN clock_timestamp() END, updated_at = clock_timestamp() WHERE id = ${entry.id}`;
      await recordAudit(tx, actor.id, archived ? "portfolio.archived" : "portfolio.restored", "portfolio_entries", entry.id, requestId);
    }
    return { id: entry.id, archived };
  });
}
