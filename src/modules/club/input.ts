import { idField, invalid, textField } from "../../core/validation";
import { clubRoles, clubSlugPattern, maxClubGoals, maxClubText, type ClubGoal, type ClubRole } from "../../shared/club";

function optionalText(body: Record<string, unknown>, key: string, max: number, label: string) {
  const value = body[key] ?? "";
  if (typeof value !== "string" || value.trim().length > max) invalid(`${label} maksimal ${max} karakter.`);
  return value.trim();
}

// The club profile is the overview copy: name plus the three narrative blocks mentors edit.
export function clubProfileInput(body: Record<string, unknown>) {
  return {
    name: textField(body, "name", 100),
    tagline: optionalText(body, "tagline", 200, "Tagline"),
    purpose: optionalText(body, "purpose", maxClubText, "Tujuan klub"),
    direction: optionalText(body, "direction", maxClubText, "Arah belajar"),
    program: optionalText(body, "program", maxClubText, "Program berjalan"),
  };
}
// Creating a club adds the profile plus the slug that identifies it. An empty slug is
// derived from the name, so an administrator only types one field in the common case.
export function clubCreateInput(body: Record<string, unknown>) {
  const profile = clubProfileInput(body);
  const raw = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : slugify(profile.name);
  const slug = raw.toLowerCase();
  if (!clubSlugPattern.test(slug)) invalid("Slug klub harus 3–40 karakter huruf kecil, angka, atau tanda hubung.");
  return { ...profile, slug };
}
function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}
// Goals are replaced as one ordered list, like assessment items; positions are assigned here.
export function clubGoalsInput(body: Record<string, unknown>): ClubGoal[] {
  const goals = body.goals;
  if (!Array.isArray(goals) || goals.length > maxClubGoals) invalid(`Tujuan klub maksimal ${maxClubGoals} butir.`);
  return goals.map((goal, index) => {
    if (!goal || typeof goal !== "object" || Array.isArray(goal)) invalid("Isi tujuan klub yang valid.");
    const row = goal as Record<string, unknown>;
    return { position: index + 1, title: textField(row, "title", 100), description: optionalText(row, "description", 500, "Keterangan tujuan") };
  });
}
// One membership change per request: adding, changing a role, and removing are idempotent.
export function clubMemberInput(body: Record<string, unknown>) {
  const role = body.role;
  if (!clubRoles.includes(role as ClubRole)) invalid("Pilih peran mentor atau anggota.");
  const removed = body.removed ?? false;
  if (typeof removed !== "boolean") invalid("Status keanggotaan tidak valid.");
  return { userId: idField(body, "userId"), role: role as ClubRole, removed };
}
export function clubArchivedInput(body: Record<string, unknown>) {
  if (typeof body.archived !== "boolean") invalid("Status arsip klub tidak valid.");
  return body.archived;
}
export function clubCourseInput(body: Record<string, unknown>) {
  const linked = body.linked;
  if (typeof linked !== "boolean") invalid("Status tautan course tidak valid.");
  return { courseId: idField(body, "courseId"), linked };
}
