import { idField, invalid, textField } from "../../core/validation";
import { badgeCriteria, badgeIcons, maxBadgeThreshold, maxRulePoints, rewardRuleKeys, type BadgeCriterion, type BadgeIcon, type RewardRuleKey } from "../../shared/gamification";

function integer(value: unknown, min: number, max: number, message: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) invalid(message);
  return value as number;
}

export function ruleKeyInput(value: string): RewardRuleKey {
  if (!rewardRuleKeys.includes(value as RewardRuleKey)) invalid("Aturan XP tidak dikenal.");
  return value as RewardRuleKey;
}
export function rulePointsInput(body: Record<string, unknown>) {
  return integer(body.points, 0, maxRulePoints, `XP harus bilangan bulat 0–${maxRulePoints}.`);
}

export function badgeInput(body: Record<string, unknown>) {
  const key = textField(body, "key", 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(key)) invalid("Kode lencana hanya huruf kecil, angka, dan tanda hubung, 3–40 karakter.");
  const name = textField(body, "name", 80);
  const description = textField(body, "description", 300);
  const icon = body.icon;
  if (!badgeIcons.includes(icon as BadgeIcon)) invalid("Ikon lencana tidak tersedia.");
  const criterion = body.criterion;
  if (!badgeCriteria.includes(criterion as BadgeCriterion)) invalid("Kriteria lencana tidak dikenal.");
  const threshold = integer(body.threshold, 1, maxBadgeThreshold, `Target lencana harus bilangan bulat 1–${maxBadgeThreshold}.`);
  const active = body.active === undefined ? true : body.active;
  if (typeof active !== "boolean") invalid("Status lencana tidak valid.");
  return { key, name, description, icon: icon as BadgeIcon, criterion: criterion as BadgeCriterion, threshold, active };
}

export function studentIdInput(value: string) {
  return idField({ studentId: value }, "studentId").toLowerCase();
}
export function leaderboardFilter(url: URL) {
  const classId = url.searchParams.get("classId") || null;
  return classId === null ? null : idField({ classId }, "classId").toLowerCase();
}
