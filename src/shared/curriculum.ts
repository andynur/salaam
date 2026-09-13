export const curriculumGrades = ["X", "XI", "XII"] as const;
export type CurriculumGrade = (typeof curriculumGrades)[number];
export type CurriculumSemester = 1 | 2;

export const curriculumLimits = { program: 100, goal: 1000, theme: 150, phase: 100, title: 150, objective: 500, practice: 300, source: 300, item: 150, items: 12, week: 30, rows: 500, csvBytes: 512 * 1024 } as const;

export interface CurriculumWeekFields { phase: string; title: string; objective: string; content: string[]; practice: string; assessment: string[]; source: string }
export interface CurriculumWeek extends CurriculumWeekFields { id: string; grade: CurriculumGrade; semester: CurriculumSemester; week: number; version: number; updatedAt: string }
export interface CurriculumSemesterSummary { semester: CurriculumSemester; theme: string; weeks: number }
export interface CurriculumGradeSummary { grade: CurriculumGrade; program: string; goal: string; published: boolean; version: number; weeks: number; phases: number; semesters: CurriculumSemesterSummary[]; updatedAt: string }
export interface CurriculumOverview { canManage: boolean; grades: CurriculumGradeSummary[] }
export interface CurriculumDetail { grade: CurriculumGradeSummary; weeks: CurriculumWeek[] }
export interface CurriculumImportResult { created: number; updated: number; unchanged: number }

// A grade opens only once it is published and has weeks; otherwise it reads "Segera hadir".
export const curriculumAvailable = (grade: Pick<CurriculumGradeSummary, "published" | "weeks">) => grade.published && grade.weeks > 0;

// RFC 4180 subset: quoted cells may hold commas, doubled quotes, and line breaks. Blank lines
// are skipped. Spreadsheet exports quote cells this way, so revisions survive a round trip.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const source = text.replace(/^﻿/, "");
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => { row.push(cell); cell = ""; if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && !cell.trim()) { cell = ""; quoted = true; }
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n" || character === "\r") { if (character === "\r" && source[index + 1] === "\n") index++; endRow(); }
    else cell += character;
  }
  if (quoted) throw new Error("Unterminated quoted CSV cell");
  endRow();
  return rows;
}
export const splitList = (value: string) => value.split(/[;\n]/).map(item => item.trim()).filter(Boolean);

// Assessments that close a phase rather than a single week.
const milestonePattern = /milestone|capstone|demo day|\bskl\b|mini project|monthly challenge|final|defense|semester \d review/i;
export const isMilestone = (week: Pick<CurriculumWeekFields, "assessment">) => week.assessment.some(item => milestonePattern.test(item));

// Consecutive weeks sharing a phase form one group; the input is already in week order.
export function groupPhases<T extends { phase: string }>(weeks: readonly T[]) {
  const groups: { name: string; weeks: T[] }[] = [];
  for (const week of weeks) {
    const last = groups.at(-1);
    if (last?.name === week.phase) last.weeks.push(week);
    else groups.push({ name: week.phase, weeks: [week] });
  }
  return groups;
}

// Every whitespace-separated term must appear somewhere in the week.
export function searchCurriculum<T extends CurriculumWeekFields & { week: number }>(weeks: readonly T[], query: string) {
  const terms = query.toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
  if (!terms.length) return [...weeks];
  return weeks.filter(week => {
    const text = [week.phase, `pekan ${week.week}`, week.title, week.objective, week.practice, ...week.content, ...week.assessment].join(" ").toLocaleLowerCase("id");
    return terms.every(term => text.includes(term));
  });
}
