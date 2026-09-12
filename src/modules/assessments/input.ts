import { idField, invalid, textField } from "../../core/validation";
import type { AssessmentKind, AssessmentSettings, QuestionOption, QuestionType, ResultsVisibility, RubricCriterion, ScoringMode } from "../../shared/assessment";

const optionIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) <= 0.000001;

export function questionInput(body: Record<string, unknown>) {
  const type = body.type;
  if (type !== "single_choice" && type !== "multiple_choice" && type !== "true_false" && type !== "short_answer" && type !== "essay") invalid("Pilih jenis soal yang valid.");
  const prompt = textField(body, "prompt", 5000);
  const explanation = body.explanation ?? "";
  if (typeof explanation !== "string" || explanation.trim().length > 2000) invalid("Pembahasan maksimal 2000 karakter.");
  let options: QuestionOption[];
  if (type === "short_answer" || type === "essay") options = [];
  else if (type === "true_false") options = [{ id: "a", text: "Benar" }, { id: "b", text: "Salah" }];
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
  if (type === "short_answer" || type === "essay") return { type: type as QuestionType, prompt, options, correct: [], explanation: explanation.trim() };
  const chosen = body.correct;
  if (!Array.isArray(chosen) || chosen.some(value => typeof value !== "string" || !options.some(option => option.id === value))) invalid("Pilih jawaban benar dari opsi yang tersedia.");
  const correct = [...new Set(chosen as string[])].sort();
  if (type === "multiple_choice" ? correct.length < 1 : correct.length !== 1) invalid(type === "multiple_choice" ? "Pilih minimal satu jawaban benar." : "Pilih tepat satu jawaban benar.");
  return { type: type as QuestionType, prompt, options, correct, explanation: explanation.trim() };
}

function csvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index]!;
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) invalid("CSV memiliki tanda kutip yang tidak berpasangan.");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(values => values.some(value => value.trim()));
}
export function questionImportInput(body: Record<string, unknown>) {
  const requestKey = idField(body, "requestKey");
  const csv = body.csv;
  if (typeof csv !== "string" || !csv.trim()) invalid("CSV soal wajib diisi.");
  if (csv.length > 512 * 1024) invalid("CSV maksimal 512 KiB.");
  const rows = csvRows(csv);
  if (!rows.length) invalid("CSV soal tidak memiliki data.");
  const header = rows.shift()!.map(value => value.trim().toLowerCase());
  if (header.join(",") !== "type,prompt,options,correct,explanation") invalid("Header CSV harus: type,prompt,options,correct,explanation.");
  if (!rows.length || rows.length > 100) invalid("Import harus berisi 1–100 soal.");
  const questions = rows.map((values, index) => {
    if (values.length !== 5) invalid(`Baris ${index + 2}: jumlah kolom harus 5.`);
    const [type, prompt, options, correct, explanation] = values;
    return questionInput({ type, prompt, options: options ? options.split("|") : undefined, correct: correct ? correct.split("|") : [], explanation: explanation ?? "" });
  });
  return { requestKey, csv, questions };
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
  const scoringMode = body.scoringMode ?? "all_or_nothing";
  if (scoringMode !== "all_or_nothing" && scoringMode !== "partial_credit" && scoringMode !== "negative_marking") invalid("Mode penilaian tidak valid.");
  const selectionCount = body.selectionCount ?? null;
  if (selectionCount !== null && (typeof selectionCount !== "number" || !Number.isInteger(selectionCount) || selectionCount < 1 || selectionCount > 100)) invalid("Jumlah soal acak harus 1–100.");
  return { opensAt, closesAt, timeLimitMinutes: timeLimitMinutes as number | null, maxAttempts, shuffleQuestions: flag(body, "shuffleQuestions", true), shuffleOptions: flag(body, "shuffleOptions", true), resultsVisibility: resultsVisibility as ResultsVisibility, scoringMode: scoringMode as ScoringMode, selectionCount: selectionCount as number | null };
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
  const selected = body.selected ?? [];
  if (!Array.isArray(selected) || selected.length > 10 || selected.some(value => typeof value !== "string" || !optionIds.includes(value))) invalid("Jawaban tidak valid.");
  const answerText = body.answerText ?? null;
  if (answerText !== null && (typeof answerText !== "string" || answerText.trim().length > 20000)) invalid("Jawaban tertulis maksimal 20000 karakter.");
  const revision = body.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || revision > 1000000) invalid("Revisi jawaban tidak valid.");
  return { questionId, selected: [...new Set(selected as string[])].sort(), answerText: typeof answerText === "string" ? answerText.trim() : null, revision };
}
export function adjustmentInput(body: Record<string, unknown>) {
  const score = body.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || !twoDecimals(score)) invalid("Nilai harus 0 atau lebih, maksimal dua desimal.");
  return { score, reason: textField(body, "reason", 2000) };
}
export function manualGradeInput(body: Record<string, unknown>) {
  const score = body.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || !twoDecimals(score)) invalid("Nilai harus 0 atau lebih, maksimal dua desimal.");
  const raw = body.breakdown ?? [];
  if (!Array.isArray(raw) || raw.length > 10 || raw.some(item => !item || typeof item !== "object" || Array.isArray(item))) invalid("Breakdown rubric tidak valid.");
  const breakdown = raw.map(item => {
    const row = item as Record<string, unknown>;
    const criterionId = textField(row, "criterionId", 50);
    const criterionScore = row.score;
    if (typeof criterionScore !== "number" || !Number.isFinite(criterionScore) || criterionScore < 0 || !twoDecimals(criterionScore)) invalid("Nilai kriteria rubric tidak valid.");
    return { criterionId, score: criterionScore };
  });
  return { score, feedback: textField(body, "feedback", 5000), breakdown };
}
export function rubricInput(body: Record<string, unknown>) {
  const title = textField(body, "title", 150);
  const raw = body.criteria;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) invalid("Rubric membutuhkan 1–10 kriteria.");
  const criteria = raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`Kriteria ${index + 1} tidak valid.`);
    const row = item as Record<string, unknown>;
    const id = textField(row, "id", 50).toLowerCase();
    const label = textField(row, "label", 150);
    const description = textField(row, "description", 1000);
    const maxPoints = row.maxPoints;
    if (typeof maxPoints !== "number" || !Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 1000 || !twoDecimals(maxPoints)) invalid(`Kriteria ${index + 1}: poin tidak valid.`);
    return { id, label, description, maxPoints } satisfies RubricCriterion;
  });
  if (new Set(criteria.map(item => item.id)).size !== criteria.length) invalid("ID kriteria rubric harus unik.");
  return { title, criteria };
}
export function surveyKindInput(body: Record<string, unknown>) {
  if (body.kind !== "survey" && body.kind !== "questionnaire") invalid("Pilih jenis survey atau questionnaire.");
  return body.kind as "survey" | "questionnaire";
}
export function surveyQuestionsInput(body: Record<string, unknown>) {
  const raw = body.questions;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) invalid("Survey membutuhkan 1–100 pertanyaan.");
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`Pertanyaan ${index + 1} tidak valid.`);
    const row = item as Record<string, unknown>;
    const prompt = textField(row, "prompt", 5000);
    const type = row.type;
    if (type !== "single_choice" && type !== "multiple_choice" && type !== "short_answer") invalid("Jenis pertanyaan survey tidak valid.");
    const required = row.required ?? true;
    if (typeof required !== "boolean") invalid("Status wajib pertanyaan tidak valid.");
    const options = type === "short_answer" ? [] : row.options;
    if (type !== "short_answer") {
      if (!Array.isArray(options) || options.length < 2 || options.length > 10 || options.some(option => typeof option !== "string" || !option.trim() || option.trim().length > 1000)) invalid("Pertanyaan pilihan membutuhkan 2–10 opsi.");
      if (new Set((options as string[]).map(option => option.trim().toLowerCase())).size !== options.length) invalid("Setiap opsi survey harus berbeda.");
    }
    const optionValues = options as string[];
    return { prompt, type, options: optionValues.map((option, optionIndex) => ({ id: String.fromCharCode(97 + optionIndex), text: option.trim() })), required, position: index };
  });
}
export function surveyAnswersInput(body: Record<string, unknown>) {
  const answers = body.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) invalid("Jawaban survey tidak valid.");
  return answers as Record<string, unknown>;
}
