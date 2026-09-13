import { idField, invalid, textField } from "../../core/validation";
import { sessionLabels } from "../../shared/attendance";
import { clubGroupCapacity, clubGroupLevels, clubRoles, clubSlugPattern, maxClubGoals, maxClubText, maxClubTracks, type ClubGoal, type ClubRole } from "../../shared/club";

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
// Tab filters follow the report filter bar: an empty value is "Semua", and a value outside
// the known set is rejected instead of silently listing everything.
export function clubMeetingFilter(url: URL) {
  const status = url.searchParams.get("status") ?? "";
  if (status && !(status in sessionLabels)) invalid("Filter status pertemuan tidak valid.");
  return status;
}
export function clubMemberFilter(url: URL) {
  const role = url.searchParams.get("role") ?? "";
  if (role && !clubRoles.includes(role as ClubRole)) invalid("Filter peran anggota tidak valid.");
  return role;
}

// An optional reference: an empty value means "none", anything else must be a real id. It
// keeps "no track" and "no mentor" expressible without a second endpoint.
function optionalId(body: Record<string, unknown>, key: string) {
  const value = body[key] ?? "";
  if (typeof value !== "string") invalid("Pilihan tidak valid.");
  return value.trim() ? idField(body, key) : null;
}
// Tracks and groups are saved through one upsert body each, the shape clubMemberInput and
// clubCourseInput already use: an id present means "change that row", absent means "create".
export function clubTrackInput(body: Record<string, unknown>) {
  const name = textField(body, "name", 100);
  const raw = (typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : slugify(name)).toLowerCase();
  if (!clubSlugPattern.test(raw)) invalid("Slug track harus 3–40 karakter huruf kecil, angka, atau tanda hubung.");
  const position = Number(body.position ?? 1);
  if (!Number.isSafeInteger(position) || position < 1 || position > maxClubTracks) invalid(`Urutan track harus 1–${maxClubTracks}.`);
  const archived = body.archived ?? false;
  if (typeof archived !== "boolean") invalid("Status arsip track tidak valid.");
  return {
    trackId: optionalId(body, "trackId"), slug: raw, name, position, archived,
    tagline: optionalText(body, "tagline", 200, "Tagline track"),
    description: optionalText(body, "description", maxClubText, "Keterangan track"),
  };
}
export function clubGroupInput(body: Record<string, unknown>) {
  const level = Number(body.level ?? 1);
  if (!(level in clubGroupLevels)) invalid("Level kelompok harus 1–4.");
  const capacity = Number(body.capacity ?? clubGroupCapacity.default);
  if (!Number.isSafeInteger(capacity) || capacity < clubGroupCapacity.min || capacity > clubGroupCapacity.max) {
    invalid(`Kapasitas kelompok harus ${clubGroupCapacity.min}–${clubGroupCapacity.max} santri.`);
  }
  const archived = body.archived ?? false;
  if (typeof archived !== "boolean") invalid("Status arsip kelompok tidak valid.");
  return {
    groupId: optionalId(body, "groupId"), trackId: optionalId(body, "trackId"), mentorId: optionalId(body, "mentorId"),
    name: textField(body, "name", 100), level, capacity, archived,
    topic: optionalText(body, "topic", 200, "Tema kelompok"),
    schedule: optionalText(body, "schedule", 100, "Jadwal kelompok"),
    note: optionalText(body, "note", 2000, "Catatan kelompok"),
  };
}
export function clubGroupMemberInput(body: Record<string, unknown>) {
  const removed = body.removed ?? false;
  if (typeof removed !== "boolean") invalid("Status keanggotaan kelompok tidak valid.");
  return { groupId: idField(body, "groupId"), userId: idField(body, "userId"), removed };
}
export function clubGroupFilter(url: URL) {
  const trackId = (url.searchParams.get("trackId") ?? "").trim();
  if (trackId) idField({ trackId }, "trackId");
  const raw = (url.searchParams.get("level") ?? "").trim();
  if (raw && !(Number(raw) in clubGroupLevels)) invalid("Filter level kelompok tidak valid.");
  return { trackId, level: raw ? Number(raw) : 0 };
}
