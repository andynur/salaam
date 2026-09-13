import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { curriculumGrades, type CurriculumDetail, type CurriculumGrade, type CurriculumGradeSummary, type CurriculumImportResult, type CurriculumOverview, type CurriculumWeek, type CurriculumWeekFields } from "../../shared/curriculum";
import { curriculumCsvInput, curriculumGradeInput, curriculumWeekInput, type CurriculumImportRow } from "./input";

// The curriculum is school-wide reference data, not course content: every learning.view
// holder reads published grades, and academic.manage revises or re-imports them. Kelas that
// are unpublished stay hidden from readers so a draft never leaks as the official roadmap.

const manages = (actor: Actor) => actor.permissions.includes("academic.manage");
function curriculumNotFound(): never { throw new HttpError(404, "NOT_FOUND", "Kurikulum tidak ditemukan."); }
function stale(): never { throw new HttpError(409, "STALE_VERSION", "Kurikulum sudah diubah pengguna lain. Muat ulang lalu ulangi perubahan Anda."); }

function gradeSummaries(tx: SQL, grade: CurriculumGrade | null) {
  return tx<CurriculumGradeSummary[]>`SELECT g.grade, g.program, g.goal, g.published, g.version, g.updated_at AS "updatedAt",
      (SELECT count(*)::int FROM curriculum_weeks w WHERE w.grade = g.grade) AS weeks,
      (SELECT count(DISTINCT w.semester::text || ':' || w.phase)::int FROM curriculum_weeks w WHERE w.grade = g.grade) AS phases,
      COALESCE((SELECT json_agg(json_build_object('semester', s.semester, 'theme', s.theme,
          'weeks', (SELECT count(*) FROM curriculum_weeks w WHERE w.grade = s.grade AND w.semester = s.semester)) ORDER BY s.semester)
        FROM curriculum_semesters s WHERE s.grade = g.grade), '[]') AS semesters
    FROM curriculum_grades g WHERE (${grade}::text IS NULL OR g.grade = ${grade}) ORDER BY g.position`;
}

export async function curriculumOverview(db: SQL, actor: Actor): Promise<CurriculumOverview> {
  const grades = await db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", tx => gradeSummaries(tx, null));
  return { canManage: manages(actor), grades };
}

// A grade holds at most 60 weeks (two semesters of 30), so the detail is one bounded list
// rather than a paginated one; the map needs every week to group phases and filter locally.
export async function curriculumDetail(db: SQL, actor: Actor, grade: CurriculumGrade): Promise<CurriculumDetail> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const [summary] = await gradeSummaries(tx, grade);
    if (!summary || (!summary.published && !manages(actor))) curriculumNotFound();
    const weeks = await tx<CurriculumWeek[]>`SELECT id, grade, semester, week, phase, title, objective, content, practice, assessment, source, version, updated_at AS "updatedAt"
      FROM curriculum_weeks WHERE grade = ${grade} ORDER BY semester, week LIMIT 60`;
    return { grade: summary, weeks };
  });
}

const sameWeek = (a: CurriculumWeekFields, b: CurriculumWeekFields) => a.phase === b.phase && a.title === b.title && a.objective === b.objective &&
  a.practice === b.practice && a.source === b.source && JSON.stringify(a.content) === JSON.stringify(b.content) && JSON.stringify(a.assessment) === JSON.stringify(b.assessment);

// A retry of an edit that already landed returns the row; any other edit on an older version is 409.
export async function updateCurriculumWeek(db: SQL, actor: Actor, weekId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "academic.manage");
  const input = curriculumWeekInput(body);
  return db.begin(async tx => {
    const [current] = await tx<CurriculumWeek[]>`SELECT id, grade, semester, week, phase, title, objective, content, practice, assessment, source, version, updated_at AS "updatedAt"
      FROM curriculum_weeks WHERE id = ${weekId} FOR UPDATE`;
    if (!current) curriculumNotFound();
    if (sameWeek(current, input)) return current;
    if (current.version !== input.version) stale();
    const [updated] = await tx<CurriculumWeek[]>`UPDATE curriculum_weeks SET phase = ${input.phase}, title = ${input.title}, objective = ${input.objective},
        content = ${JSON.stringify(input.content)}::text::jsonb, practice = ${input.practice},
        assessment = ${JSON.stringify(input.assessment)}::text::jsonb, source = ${input.source},
        version = version + 1, updated_at = clock_timestamp()
      WHERE id = ${weekId}
      RETURNING id, grade, semester, week, phase, title, objective, content, practice, assessment, source, version, updated_at AS "updatedAt"`;
    await recordAudit(tx, actor.id, "curriculum.week.updated", "curriculum_weeks", weekId, requestId);
    return updated!;
  });
}

export async function updateCurriculumGrade(db: SQL, actor: Actor, grade: CurriculumGrade, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "academic.manage");
  const input = curriculumGradeInput(body);
  return db.begin(async tx => {
    const [current] = await tx<{ version: number; program: string; goal: string; published: boolean }[]>`SELECT version, program, goal, published
      FROM curriculum_grades WHERE grade = ${grade} FOR UPDATE`;
    if (!current) curriculumNotFound();
    const themes = await tx<{ theme: string }[]>`SELECT theme FROM curriculum_semesters WHERE grade = ${grade} ORDER BY semester`;
    const same = current.program === input.program && current.goal === input.goal && current.published === input.published &&
      themes.map(row => row.theme).join("\n") === input.themes.join("\n");
    if (!same) {
      if (current.version !== input.version) stale();
      await tx`UPDATE curriculum_grades SET program = ${input.program}, goal = ${input.goal}, published = ${input.published},
        version = version + 1, updated_at = clock_timestamp() WHERE grade = ${grade}`;
      for (const [index, theme] of input.themes.entries()) {
        await tx`INSERT INTO curriculum_semesters (grade, semester, theme) VALUES (${grade}, ${index + 1}, ${theme})
          ON CONFLICT (grade, semester) DO UPDATE SET theme = EXCLUDED.theme`;
      }
      const event = current.published === input.published ? "updated" : input.published ? "published" : "unpublished";
      await recordAudit(tx, actor.id, `curriculum.grade.${event}`, "curriculum_grades", null, requestId);
    }
    return (await gradeSummaries(tx, grade))[0]!;
  });
}

// Upserts by (grade, semester, week): new weeks are created, changed weeks get a new version,
// identical weeks are left alone, and weeks missing from the file are kept. Locking the
// affected grade rows first serializes concurrent imports, so a retried upload is a no-op.
export async function importCurriculum(db: SQL, actorId: string | null, rows: CurriculumImportRow[], requestId: string): Promise<CurriculumImportResult> {
  return db.begin(async tx => {
    for (const grade of curriculumGrades) {
      if (rows.some(row => row.grade === grade)) await tx`SELECT grade FROM curriculum_grades WHERE grade = ${grade} FOR UPDATE`;
    }
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const [result] = await tx<{ created: boolean }[]>`INSERT INTO curriculum_weeks (grade, semester, week, phase, title, objective, content, practice, assessment, source)
        VALUES (${row.grade}, ${row.semester}, ${row.week}, ${row.phase}, ${row.title}, ${row.objective}, ${JSON.stringify(row.content)}::text::jsonb,
          ${row.practice}, ${JSON.stringify(row.assessment)}::text::jsonb, ${row.source})
        ON CONFLICT (grade, semester, week) DO UPDATE SET phase = EXCLUDED.phase, title = EXCLUDED.title, objective = EXCLUDED.objective,
          content = EXCLUDED.content, practice = EXCLUDED.practice, assessment = EXCLUDED.assessment, source = EXCLUDED.source,
          version = curriculum_weeks.version + 1, updated_at = clock_timestamp()
        WHERE (curriculum_weeks.phase, curriculum_weeks.title, curriculum_weeks.objective, curriculum_weeks.content, curriculum_weeks.practice, curriculum_weeks.assessment, curriculum_weeks.source)
          IS DISTINCT FROM (EXCLUDED.phase, EXCLUDED.title, EXCLUDED.objective, EXCLUDED.content, EXCLUDED.practice, EXCLUDED.assessment, EXCLUDED.source)
        RETURNING (xmax = 0) AS created`;
      if (result) { if (result.created) created++; else updated++; }
    }
    if (created || updated) await recordAudit(tx, actorId, "curriculum.imported", "curriculum_weeks", null, requestId);
    return { created, updated, unchanged: rows.length - created - updated };
  });
}

export async function importCurriculumCsv(db: SQL, actor: Actor, csv: string, requestId: string) {
  requirePermission(actor, "academic.manage");
  return importCurriculum(db, actor.id, curriculumCsvInput(csv), requestId);
}
