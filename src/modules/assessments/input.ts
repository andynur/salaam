import { idField, invalid, textField } from "../../core/validation";
import type { AssessmentKind, AssessmentSettings, QuestionOption, QuestionType, ResultsVisibility } from "../../shared/assessment";

const optionIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) <= 0.000001;

export function questionInput(body: Record<string, unknown>) {
  const type = body.type;
  if (type !== "single_choice" && type !== "multiple_choice" && type !== "true_false") invalid("Pilih jenis soal: pilihan ganda (satu atau banyak jawaban) atau benar/salah.");
  const prompt = textField(body, "prompt", 5000);
  const explanation = body.explanation ?? "";
  if (typeof explanation !== "string" || explanation.trim().length > 2000) invalid("Pembahasan maksimal 2000 karakter.");
  let options: QuestionOption[];
  if (type === "true_false") options = [{ id: "a", text: "Benar" }, { id: "b", text: "Salah" }];
  else {
    const values = body.options;
    if (!Array.isArray(values) || values.length < 2 || values.length > 10) invalid("Soal pilihan ganda membutuhkan 2–10 opsi.");
    // Option IDs follow display order when authored; attempts shuffle a snapshot, not the bank.
    options = values.map((value, index) => {
      if (typeof value !== "string" || !value.trim() || value.trim().length > 1000) invalid(`Opsi ${index + 1}: isi 1–1000 karakter.`);
      return { id: optionIds[index]!, text: value.trim() };
    });
    if (new Set(options.map(option => option.text.toLowerCase())).size !== options.length) invalid("Setiap opsi harus berbeda.");
  }
  const chosen = body.correct;
  if (!Array.isArray(chosen) || chosen.some(value => typeof value !== "string" || !options.some(option => option.id === value))) invalid("Pilih jawaban benar dari opsi yang tersedia.");
  const correct = [...new Set(chosen as string[])].sort();
  if (type === "multiple_choice" ? correct.length < 1 : correct.length !== 1) invalid(type === "multiple_choice" ? "Pilih minimal satu jawaban benar." : "Pilih tepat satu jawaban benar.");
  return { type: type as QuestionType, prompt, options, correct, explanation: explanation.trim() };
}

function timestamp(body: Record<string, unknown>, key: string, label: string): string | null {
  const value = body[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) invalid(`${label} tidak valid.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z") || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2200) invalid(`${label} tidak valid (1900–2200).`);
  return date.toISOString();
}
function flag(body: Record<string, unknown>, key: string, fallback: boolean) {
  const value = body[key] ?? fallback;
  if (typeof value !== "boolean") invalid("Pengaturan acak soal/opsi tidak valid.");
  return value;
}
export function assessmentKindInput(body: Record<string, unknown>): AssessmentKind {
  if (body.kind !== "quiz" && body.kind !== "exam") invalid("Pilih jenis penilaian: quiz atau ujian.");
  return body.kind;
}
export function settingsInput(body: Record<string, unknown>, kind: AssessmentKind): AssessmentSettings {
  const opensAt = timestamp(body, "opensAt", "Waktu buka");
  const closesAt = timestamp(body, "closesAt", "Waktu tutup");
  if (opensAt && closesAt && closesAt <= opensAt) invalid("Waktu tutup harus setelah waktu buka.");
  const timeLimitMinutes = body.timeLimitMinutes ?? null;
  if (timeLimitMinutes !== null && (typeof timeLimitMinutes !== "number" || !Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 600)) invalid("Batas waktu harus 1–600 menit.");
  const maxAttempts = body.maxAttempts ?? 1;
  if (typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) invalid("Jumlah percobaan harus 1–10.");
  const resultsVisibility = body.resultsVisibility ?? "after_submit";
  if (!["after_submit", "after_close", "score_only", "hidden"].includes(String(resultsVisibility)) || typeof resultsVisibility !== "string") invalid("Pengaturan tampilan hasil tidak valid.");
  if (kind === "exam" && (maxAttempts !== 1 || timeLimitMinutes === null || !closesAt)) invalid("Ujian wajib satu kali percobaan, memiliki batas waktu, dan waktu tutup.");
  return { opensAt, closesAt, timeLimitMinutes: timeLimitMinutes as number | null, maxAttempts, shuffleQuestions: flag(body, "shuffleQuestions", true), shuffleOptions: flag(body, "shuffleOptions", true), resultsVisibility: resultsVisibility as ResultsVisibility };
}
export function itemsInput(body: Record<string, unknown>) {
  const items = body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) invalid("Pilih 1–100 soal.");
  const parsed = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`Soal ${index + 1} tidak valid.`);
    const record = item as Record<string, unknown>;
    const points = record.points;
    if (typeof points !== "number" || !Number.isFinite(points) || points <= 0 || points > 1000 || !twoDecimals(points)) invalid(`Soal ${index + 1}: poin harus lebih dari 0 sampai 1000, maksimal dua desimal.`);
    return { questionId: idField(record, "questionId"), position: index, points };
  });
  if (new Set(parsed.map(item => item.questionId)).size !== parsed.length) invalid("Setiap soal hanya boleh dipilih sekali.");
  return parsed;
}
export function answerInput(body: Record<string, unknown>) {
  const questionId = idField(body, "questionId");
  const selected = body.selected;
  if (!Array.isArray(selected) || selected.length > 10 || selected.some(value => typeof value !== "string" || !optionIds.includes(value))) invalid("Jawaban tidak valid.");
  const revision = body.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || revision > 1000000) invalid("Revisi jawaban tidak valid.");
  return { questionId, selected: [...new Set(selected as string[])].sort(), revision };
}
export function adjustmentInput(body: Record<string, unknown>) {
  const score = body.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || !twoDecimals(score)) invalid("Nilai harus 0 atau lebih, maksimal dua desimal.");
  return { score, reason: textField(body, "reason", 2000) };
}
