import { describe, expect, test } from "bun:test";
import { HttpError } from "../src/core/errors";
import { curriculumCsvInput, curriculumGradeInput, curriculumWeekInput } from "../src/modules/curriculum/input";
import { curriculumAvailable, groupPhases, isMilestone, parseCsv, searchCurriculum, type CurriculumWeek } from "../src/shared/curriculum";

const header = "grade,semester,phase,week,title,objectives,content,practice,assessment,source";
const csv = (...rows: string[]) => [header, ...rows].join("\n");
function rejects(run: () => unknown, message: string) {
  let caught: unknown;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(HttpError);
  expect((caught as HttpError).message).toContain(message);
}
const week = (overrides: Partial<CurriculumWeek>): CurriculumWeek => ({ id: crypto.randomUUID(), grade: "X", semester: 1, week: 1, phase: "Digital Fluency", title: "Inside My Computer", objective: "", content: [], practice: "", assessment: [], source: "", version: 1, updatedAt: "", ...overrides });

describe("curriculum CSV parsing", () => {
  test("handles quoted commas, doubled quotes, line breaks, CRLF, a BOM, and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n\n"multi\nline",z\n')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["multi\nline", "z"]]);
    expect(() => parseCsv('a,"open')).toThrow();
  });
  test("maps columns by header name and splits list cells", () => {
    const rows = curriculumCsvInput("title,week,grade,semester,phase,objective,content,practice,assessment\nInside My Computer , 1,X,1,Digital Fluency,Memahami perangkat,Hardware; software;;file,Audit,Weekly Quest; evidence checklist");
    expect(rows).toEqual([{ grade: "X", semester: 1, week: 1, phase: "Digital Fluency", title: "Inside My Computer", objective: "Memahami perangkat", content: ["Hardware", "software", "file"], practice: "Audit", assessment: ["Weekly Quest", "evidence checklist"], source: "" }]);
  });
  test("names the CSV line of each problem and rejects incomplete files", () => {
    rejects(() => curriculumCsvInput("grade,semester\nX,1"), "Kolom CSV tidak lengkap");
    rejects(() => curriculumCsvInput(header), "tidak memiliki baris");
    rejects(() => curriculumCsvInput('grade,"open'), "tanda kutip");
    rejects(() => curriculumCsvInput(csv("X,1,Fase,1,Judul,,,,,", "XIII,1,Fase,2,Judul,,,,,")), "Baris 3: kelas harus X, XI, atau XII");
    rejects(() => curriculumCsvInput(csv("X,3,Fase,1,Judul,,,,,")), "semester harus 1 atau 2");
    rejects(() => curriculumCsvInput(csv("X,1,Fase,31,Judul,,,,,")), "pekan harus 1–30");
    rejects(() => curriculumCsvInput(csv("X,1,Fase,1,Judul,,,,,", "X,1,Fase lain,1,Judul lain,,,,,")), "Baris 3: pekan 1 kelas X semester 1 muncul lebih dari sekali");
    rejects(() => curriculumCsvInput(csv("X,1,Fase,1,,,,,,")), "Judul pekan wajib diisi");
    rejects(() => curriculumCsvInput(csv(`X,1,Fase,1,${"a".repeat(151)},,,,,`)), "Judul pekan maksimal 150");
    rejects(() => curriculumCsvInput(csv(`X,1,Fase,1,Judul,,${Array.from({ length: 13 }, (_, index) => `m${index}`).join(";")},,,`)), "Materi maksimal 12 butir");
  });
});

describe("curriculum edit input", () => {
  const body = { version: 2, phase: "Fase", title: " Judul ", objective: "", content: ["A", " ", "B"], practice: "", assessment: [], source: "" };
  test("a week edit needs a version, a title, and string lists", () => {
    expect(curriculumWeekInput(body)).toMatchObject({ version: 2, title: "Judul", content: ["A", "B"] });
    rejects(() => curriculumWeekInput({ ...body, version: "2" }), "Versi data");
    rejects(() => curriculumWeekInput({ ...body, content: [1] }), "Materi tidak valid");
    rejects(() => curriculumWeekInput({ ...body, phase: "" }), "Fase wajib diisi");
  });
  test("a grade edit needs two semester themes and a boolean publish flag", () => {
    const grade = { version: 1, program: "Program", goal: "", themes: ["Satu", ""], published: true };
    expect(curriculumGradeInput(grade)).toEqual({ version: 1, program: "Program", goal: "", themes: ["Satu", ""], published: true });
    rejects(() => curriculumGradeInput({ ...grade, themes: ["Satu"] }), "tema semester");
    rejects(() => curriculumGradeInput({ ...grade, published: "true" }), "Status terbit");
  });
});

describe("curriculum map helpers", () => {
  const weeks = [
    week({ week: 1, phase: "Python Fundamental", title: "Program dan Python", content: ["Instalasi Python"] }),
    week({ week: 2, phase: "Python Fundamental", title: "Operator", assessment: ["01 Programming Package", "Milestone 1"] }),
    week({ week: 3, phase: "Web Foundation", title: "HTML Dasar", content: ["Struktur HTML"] }),
  ];
  test("groups consecutive weeks into phases in order", () => {
    expect(groupPhases(weeks).map(group => [group.name, group.weeks.map(item => item.week)])).toEqual([["Python Fundamental", [1, 2]], ["Web Foundation", [3]]]);
  });
  test("search matches every term across title, content, assessment, and week number", () => {
    expect(searchCurriculum(weeks, "python instalasi").map(item => item.week)).toEqual([1]);
    expect(searchCurriculum(weeks, "MILESTONE").map(item => item.week)).toEqual([2]);
    expect(searchCurriculum(weeks, "pekan 3").map(item => item.week)).toEqual([3]);
    expect(searchCurriculum(weeks, "  ")).toHaveLength(3);
  });
  test("milestones and grade availability", () => {
    expect(weeks.map(isMilestone)).toEqual([false, true, false]);
    expect(isMilestone({ assessment: ["SKL 2"] })).toBe(true);
    expect(isMilestone({ assessment: ["Weekly Quest; skills"] })).toBe(false);
    expect([curriculumAvailable({ published: true, weeks: 3 }), curriculumAvailable({ published: false, weeks: 3 }), curriculumAvailable({ published: true, weeks: 0 })]).toEqual([true, false, false]);
  });
});
