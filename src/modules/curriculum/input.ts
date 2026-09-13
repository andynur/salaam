import { HttpError } from "../../core/errors";
import { invalid } from "../../core/validation";
import { curriculumGrades, curriculumLimits as limits, parseCsv, splitList, type CurriculumGrade, type CurriculumSemester, type CurriculumWeekFields } from "../../shared/curriculum";

export interface CurriculumImportRow extends CurriculumWeekFields { grade: CurriculumGrade; semester: CurriculumSemester; week: number }

export const curriculumGradeParam = (value: string) => curriculumGrades.includes(value as CurriculumGrade) ? value as CurriculumGrade : null;

function text(body: Record<string, unknown>, key: string, max: number, label: string, required = false) {
  const value = body[key] ?? "";
  if (typeof value !== "string") invalid(`${label} tidak valid.`);
  const trimmed = value.trim();
  if (required && !trimmed) invalid(`${label} wajib diisi.`);
  if (trimmed.length > max) invalid(`${label} maksimal ${max} karakter.`);
  return trimmed;
}
// Lists arrive as arrays from the editor and as ";"-separated cells from the CSV.
function list(value: unknown, label: string) {
  let items: string[];
  if (typeof value === "string") items = splitList(value);
  else if (Array.isArray(value) && value.every(item => typeof item === "string")) items = value.map(item => item.trim()).filter(Boolean);
  else invalid(`${label} tidak valid.`);
  if (items.length > limits.items) invalid(`${label} maksimal ${limits.items} butir.`);
  if (items.some(item => item.length > limits.item)) invalid(`Setiap butir ${label.toLowerCase()} maksimal ${limits.item} karakter.`);
  return items;
}
function version(body: Record<string, unknown>) {
  const value = body.version;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid("Versi data tidak valid. Muat ulang halaman.");
  return value;
}

export function curriculumWeekFieldsInput(body: Record<string, unknown>): CurriculumWeekFields {
  return {
    phase: text(body, "phase", limits.phase, "Fase", true),
    title: text(body, "title", limits.title, "Judul pekan", true),
    objective: text(body, "objective", limits.objective, "Tujuan"),
    content: list(body.content ?? [], "Materi"),
    practice: text(body, "practice", limits.practice, "Praktik"),
    assessment: list(body.assessment ?? [], "Asesmen"),
    source: text(body, "source", limits.source, "Sumber"),
  };
}
export const curriculumWeekInput = (body: Record<string, unknown>) => ({ version: version(body), ...curriculumWeekFieldsInput(body) });

export function curriculumGradeInput(body: Record<string, unknown>) {
  if (typeof body.published !== "boolean") invalid("Status terbit tidak valid.");
  const themes = body.themes;
  if (!Array.isArray(themes) || themes.length !== 2) invalid("Isi tema semester 1 dan semester 2.");
  return {
    version: version(body),
    program: text(body, "program", limits.program, "Nama program", true),
    goal: text(body, "goal", limits.goal, "Target kelas"),
    published: body.published,
    themes: themes.map((theme, index) => text({ theme }, "theme", limits.theme, `Tema semester ${index + 1}`)) as [string, string],
  };
}

const requiredColumns = ["grade", "semester", "phase", "week", "title", "objectives", "content", "practice", "assessment"];

// Columns are matched by header name, so a spreadsheet may reorder them; `source` is optional
// and `objective` is accepted for `objectives`. Every problem names its CSV line.
export function curriculumCsvInput(csv: string): CurriculumImportRow[] {
  let table: string[][];
  try { table = parseCsv(csv); } catch { invalid("Format CSV tidak valid: ada tanda kutip yang tidak ditutup."); }
  const [header = [], ...rows] = table;
  const names = header.map(name => name.trim().toLowerCase());
  const column = (name: string) => { const index = names.indexOf(name); return index >= 0 || name !== "objectives" ? index : names.indexOf("objective"); };
  const missing = requiredColumns.filter(name => column(name) < 0);
  if (missing.length) invalid(`Kolom CSV tidak lengkap: ${missing.join(", ")}.`);
  if (!rows.length) invalid("CSV tidak memiliki baris kurikulum.");
  if (rows.length > limits.rows) invalid(`CSV maksimal ${limits.rows} baris kurikulum.`);
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const line = index + 2;
    const cell = (name: string) => { const position = column(name); return position < 0 ? "" : (cells[position] ?? "").trim(); };
    try {
      const grade = curriculumGradeParam(cell("grade"));
      if (!grade) invalid("kelas harus X, XI, atau XII.");
      const semester = Number(cell("semester"));
      if (semester !== 1 && semester !== 2) invalid("semester harus 1 atau 2.");
      const week = Number(cell("week"));
      if (!Number.isInteger(week) || week < 1 || week > limits.week) invalid(`pekan harus 1–${limits.week}.`);
      const key = `${grade}-${semester}-${week}`;
      if (seen.has(key)) invalid(`pekan ${week} kelas ${grade} semester ${semester} muncul lebih dari sekali.`);
      seen.add(key);
      const fields = curriculumWeekFieldsInput({ phase: cell("phase"), title: cell("title"), objective: cell("objectives"), content: cell("content"), practice: cell("practice"), assessment: cell("assessment"), source: cell("source") });
      return { grade, semester, week, ...fields };
    } catch (error) {
      if (error instanceof HttpError) invalid(`Baris ${line}: ${error.message}`);
      throw error;
    }
  });
}
