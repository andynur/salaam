import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import type { ClubCourseRow, ClubRole } from "../../shared/club";

export function notFound(): never { throw new HttpError(404, "NOT_FOUND", "Klub tidak ditemukan atau Anda bukan anggotanya."); }

interface ClubRow {
  id: string; slug: string; name: string; tagline: string; purpose: string; direction: string; program: string;
  published: boolean; archived: boolean; membership: ClubRole | null; mentors: number; members: number; courses: number;
}

// Creating, archiving, and restoring a club is directory work: it needs club.manage plus
// learning.manage.all, the capability pair an administrator holds. Mentors manage the club
// they lead, not the list of clubs the school runs.
export function requireClubAdmin(actor: Actor) {
  requirePermission(actor, "club.manage");
  requirePermission(actor, "learning.manage.all");
}

// A club is managed by club.manage holders who mentor it, and by learning.manage.all
// (administrators). Everyone else needs an active membership in a published club; anything
// else is 404, like every other scope check. Mutations lock the club row first. An archived
// club is read-only until an administrator restores it, so "manage" refuses one and the
// directory's own "admin" mode does not.
export async function clubAccess(db: SQL, actor: Actor, clubId: string, mode: "view" | "manage" | "admin" = "view", lock = false) {
  if (mode === "admin") requireClubAdmin(actor);
  else requirePermission(actor, mode === "manage" ? "club.manage" : "club.view");
  if (lock) await db`SELECT id FROM clubs WHERE id = ${clubId} FOR UPDATE`;
  const row = (await db<ClubRow[]>`SELECT c.id, c.slug, c.name, c.tagline, c.purpose, c.direction, c.program, c.published,
      c.archived_at IS NOT NULL AS archived,
      (SELECT m.role FROM club_members m WHERE m.club_id = c.id AND m.user_id = ${actor.id} AND m.removed_at IS NULL) AS membership,
      (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id AND m.removed_at IS NULL AND m.role = 'mentor') AS mentors,
      (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id AND m.removed_at IS NULL AND m.role = 'member') AS members,
      (SELECT count(*)::int FROM club_courses cc WHERE cc.club_id = c.id) AS courses
    FROM clubs c WHERE c.id = ${clubId}`)[0];
  if (!row) notFound();
  const canAdmin = actor.permissions.includes("club.manage") && actor.permissions.includes("learning.manage.all");
  const canManage = actor.permissions.includes("club.manage") && (canAdmin || row.membership === "mentor");
  if (mode === "view" ? !(canManage || (row.membership !== null && row.published && !row.archived)) : !canManage) notFound();
  if (mode === "manage" && row.archived) throw new HttpError(409, "CLUB_ARCHIVED", "Klub sudah diarsipkan. Pulihkan klub terlebih dahulu.");
  return { club: { ...row, canAdmin }, canManage, canAdmin, membership: row.membership, archived: row.archived };
}

// Linked courses seen through the actor's own course scope: a manager sees the courses they
// teach (or all, with learning.manage.all), a student only the published courses of a class
// they belong to. Club membership never widens course access on its own.
export async function clubCourseRows(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  const manage = actor.permissions.includes("learning.manage");
  const all = actor.permissions.includes("learning.manage.all");
  return db<ClubCourseRow[]>`SELECT c.id, c.name, cl.name AS "className", t.name AS term, y.name AS year, c.published,
      (${manage} AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) AS "canManage",
      cc.linked_at::text AS "linkedAt",
      (SELECT count(*)::int FROM lessons l JOIN course_modules m ON m.id = l.module_id
        WHERE l.course_id = c.id AND l.archived_at IS NULL AND m.archived_at IS NULL) AS lessons,
      (SELECT count(*)::int FROM activities a WHERE a.course_id = c.id AND a.archived_at IS NULL) AS activities,
      (SELECT count(*)::int FROM activities a WHERE a.course_id = c.id AND a.kind = 'challenge' AND a.archived_at IS NULL) AS challenges
    FROM club_courses cc JOIN courses c ON c.id = cc.course_id JOIN classes cl ON cl.id = c.class_id
    JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
    WHERE cc.club_id = ${clubId} AND (c.name ILIKE ${pattern} OR cl.name ILIKE ${pattern}) AND (
      (${manage} AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) OR
      (c.published AND cl.archived_at IS NULL AND t.archived_at IS NULL AND y.archived_at IS NULL
        AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.class_id AND m.student_id = ${actor.id})))
    ORDER BY y.starts_on DESC, c.name, c.id LIMIT 51 OFFSET ${offset}`;
}
