import { idField, invalid, textField } from "../../core/validation";
import { httpUrlInput, timestampInput } from "../learning/input";
import { projectStatuses, taskStatuses, type ProjectStatus, type ReviewDecision, type TaskStatus, type TeamMode } from "../../shared/project";

function optionalText(body: Record<string, unknown>, key: string, max: number, label: string) {
  const value = body[key] ?? "";
  if (typeof value !== "string" || value.trim().length > max) invalid(`${label} maksimal ${max} karakter.`);
  return value.trim();
}
function integer(value: unknown, min: number, max: number, message: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) invalid(message);
  return value;
}

export function challengeInput(body: Record<string, unknown>) {
  const title = textField(body, "title", 150);
  const instructions = textField(body, "instructions", 20000);
  const dueAt = timestampInput(body, "dueAt", "Tenggat");
  const teamMode = body.teamMode;
  if (teamMode !== "individual" && teamMode !== "team") invalid("Pilih mode challenge: individu atau tim.");
  const maxTeamSize = teamMode === "individual"
    ? integer(body.maxTeamSize ?? 1, 1, 1, "Challenge individu hanya untuk satu santri.")
    : integer(body.maxTeamSize, 2, 10, "Ukuran tim harus 2–10 santri.");
  return { title, instructions, dueAt, teamMode: teamMode as TeamMode, maxTeamSize };
}
export function projectInput(body: Record<string, unknown>) {
  const title = textField(body, "title", 150);
  const summary = optionalText(body, "summary", 5000, "Ringkasan");
  const link = optionalText(body, "deliverableUrl", 2000, "Tautan hasil karya");
  return { title, summary, deliverableUrl: link ? httpUrlInput(link) : null };
}
export function memberIdsInput(body: Record<string, unknown>) {
  const values = body.memberIds;
  if (!Array.isArray(values) || values.length < 1 || values.length > 10) invalid("Pilih 1–10 anggota tim.");
  const ids = values.map((value, index) => idField({ [`Anggota ${index + 1}`]: value }, `Anggota ${index + 1}`).toLowerCase());
  if (new Set(ids).size !== ids.length) invalid("Setiap santri hanya boleh dipilih sekali.");
  return ids;
}
function assigneeInput(body: Record<string, unknown>) {
  if (body.assigneeId === null || body.assigneeId === undefined || body.assigneeId === "") return null;
  return idField(body, "assigneeId").toLowerCase();
}
export function taskStatusInput(value: unknown): TaskStatus {
  if (!taskStatuses.includes(value as TaskStatus)) invalid("Kolom board tidak valid.");
  return value as TaskStatus;
}
export function versionInput(body: Record<string, unknown>) {
  return integer(body.version, 1, 1000000, "Versi kartu tidak valid. Muat ulang board.");
}
export function taskInput(body: Record<string, unknown>) {
  const rawLabels = body.labels ?? [];
  if (!Array.isArray(rawLabels) || rawLabels.some(label => typeof label !== "string")) invalid("Label kartu tidak valid.");
  const labels = [...new Set((rawLabels as string[]).map(label => label.trim()).filter(Boolean))];
  if (labels.length > 10 || labels.some(label => label.length > 40)) invalid("Kartu boleh memiliki maksimal 10 label, masing-masing 40 karakter.");
  return {
    title: textField(body, "title", 150),
    description: optionalText(body, "description", 5000, "Deskripsi"),
    assigneeId: assigneeInput(body),
    dueAt: timestampInput(body, "dueAt", "Tenggat"),
    labels,
    status: body.status === undefined ? "todo" as TaskStatus : taskStatusInput(body.status),
  };
}
export function moveInput(body: Record<string, unknown>) {
  return { status: taskStatusInput(body.status), position: integer(body.position, 0, 1000, "Posisi kartu tidak valid."), version: versionInput(body) };
}
export function reviewInput(body: Record<string, unknown>) {
  const decision = body.decision;
  if (decision !== "approved" && decision !== "changes_requested") invalid("Pilih keputusan review: setujui atau minta revisi.");
  const feedback = textField(body, "feedback", 5000);
  let score: number | null = null;
  if (decision === "approved") {
    const value = body.score;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) invalid("Nilai proyek harus 0–100, maksimal dua desimal.");
    score = value;
  } else if (body.score !== null && body.score !== undefined && body.score !== "") invalid("Nilai hanya diberikan saat proyek disetujui.");
  return { decision: decision as ReviewDecision, score, feedback };
}
export function showcaseInput(body: Record<string, unknown>) {
  if (typeof body.showcased !== "boolean") invalid("Status showcase tidak valid.");
  return body.showcased;
}
export function reflectionInput(body: Record<string, unknown>) {
  return textField(body, "reflection", 5000);
}
export function commentInput(body: Record<string, unknown>) {
  return textField(body, "body", 2000);
}
export function projectFilters(url: URL) {
  const status = url.searchParams.get("status") || null;
  if (status !== null && !projectStatuses.includes(status as ProjectStatus)) invalid("Filter status tidak valid.");
  const activity = url.searchParams.get("activityId") || null;
  return { status: status as ProjectStatus | null, activityId: activity === null ? null : idField({ activityId: activity }, "activityId").toLowerCase() };
}
