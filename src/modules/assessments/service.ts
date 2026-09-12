import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField, invalid, textField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, lessonAccess, notFound } from "../learning/access";
import { assessmentKindInput, itemsInput, rubricInput, settingsInput } from "./input";
import type { Assessment } from "../../shared/assessment";

async function lockedByAttempts(db: SQL, activityId: string) {
  if ((await db`SELECT 1 FROM attempts WHERE activity_id = ${activityId} LIMIT 1`).length) {
    throw new HttpError(409, "ASSESSMENT_LOCKED", "Penilaian sudah dikerjakan santri. Pengaturan dan daftar soal tidak dapat diubah.");
  }
}
async function assessmentRow(db: SQL, courseId: string, activityId: string) {
  const row = (await db<{ kind: "quiz" | "exam" }[]>`SELECT kind FROM activities
    WHERE id = ${activityId} AND course_id = ${courseId} AND kind IN ('quiz', 'exam') AND archived_at IS NULL`)[0];
  if (!row) notFound();
  return row;
}

export async function saveAssessment(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string, id?: string) {
  const kind = assessmentKindInput(body);
  const title = textField(body, "title", 150);
  const instructions = textField(body, "instructions", 20000);
  const settings = settingsInput(body, kind);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let activityId: string;
    if (id) {
      const current = await assessmentRow(tx, courseId, id);
      if (current.kind !== kind) throw new HttpError(409, "KIND_LOCKED", "Jenis penilaian tidak dapat diubah.");
      await lockedByAttempts(tx, id);
      await tx`UPDATE activities SET title = ${title}, instructions = ${instructions}, due_at = ${settings.closesAt} WHERE id = ${id}`;
      await tx`UPDATE assessment_settings SET opens_at = ${settings.opensAt}, closes_at = ${settings.closesAt}, time_limit_minutes = ${settings.timeLimitMinutes},
          max_attempts = ${settings.maxAttempts}, shuffle_questions = ${settings.shuffleQuestions}, shuffle_options = ${settings.shuffleOptions},
          results_visibility = ${settings.resultsVisibility}, scoring_mode = ${settings.scoringMode}, selection_count = ${settings.selectionCount}
        WHERE activity_id = ${id}`;
      if (settings.selectionCount !== null) {
        const points = await tx<{ points: number }[]>`SELECT DISTINCT points::float8 AS points FROM assessment_questions WHERE activity_id = ${id}`;
        if (points.length > 1) invalid("Semua soal dalam pool harus memiliki poin yang sama agar nilai maksimum konsisten.");
      }
      activityId = id;
    } else {
      const lessonId = idField(body, "lessonId");
      await lessonAccess(tx, courseId, lessonId, true);
      // due_at mirrors the closing time so deadline-aware views need no assessment join.
      activityId = (await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at)
        VALUES (${courseId}, ${lessonId}, ${kind}, ${title}, ${instructions}, ${settings.closesAt}) RETURNING id`)[0]!.id;
      await tx`INSERT INTO assessment_settings (activity_id, kind, opens_at, closes_at, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, results_visibility, scoring_mode, selection_count)
        VALUES (${activityId}, ${kind}, ${settings.opensAt}, ${settings.closesAt}, ${settings.timeLimitMinutes}, ${settings.maxAttempts},
          ${settings.shuffleQuestions}, ${settings.shuffleOptions}, ${settings.resultsVisibility}, ${settings.scoringMode}, ${settings.selectionCount})`;
    }
    await recordAudit(tx, actor.id, `assessment.${id ? "updated" : "created"}`, "activities", activityId, requestId);
    return { id: activityId };
  });
}

export async function setAssessmentItems(db: SQL, actor: Actor, courseId: string, activityId: string, body: Record<string, unknown>, requestId: string) {
  const items = itemsInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    await assessmentRow(tx, courseId, activityId);
    await lockedByAttempts(tx, activityId);
    // IDs are validated UUIDs, so a comma-joined array literal is safe to bind.
    const found = await tx`SELECT id FROM questions WHERE course_id = ${courseId} AND archived_at IS NULL
      AND id = ANY(string_to_array(${items.map(item => item.questionId).join(",")}, ',')::uuid[])`;
    if (found.length !== items.length) notFound();
    const settings = (await tx<{ selectionCount: number | null }[]>`SELECT selection_count AS "selectionCount" FROM assessment_settings WHERE activity_id = ${activityId}`)[0];
    if (settings && settings.selectionCount !== null && settings.selectionCount > items.length) invalid("Jumlah soal acak tidak boleh melebihi isi pool.");
    if (settings && settings.selectionCount !== null && new Set(items.map(item => item.points)).size !== 1) invalid("Semua soal dalam pool harus memiliki poin yang sama agar nilai maksimum konsisten.");
    await tx`DELETE FROM assessment_questions WHERE activity_id = ${activityId}`;
    await tx`INSERT INTO assessment_questions (activity_id, course_id, question_id, position, points)
      SELECT ${activityId}, ${courseId}, item."questionId", item.position, item.points
      FROM jsonb_to_recordset(${JSON.stringify(items)}::text::jsonb) AS item("questionId" uuid, position integer, points numeric)`;
    await recordAudit(tx, actor.id, "assessment.items.updated", "activities", activityId, requestId);
    return { id: activityId, questionCount: items.length };
  });
}

export async function saveRubric(db: SQL, actor: Actor, courseId: string, activityId: string, body: Record<string, unknown>, requestId: string) {
  const questionId = idField(body, "questionId");
  const input = rubricInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    if ((await tx`SELECT 1 FROM attempts WHERE activity_id = ${activityId} LIMIT 1`).length) throw new HttpError(409, "ASSESSMENT_LOCKED", "Rubric terkunci setelah penilaian dikerjakan.");
    const question = (await tx<{ type: string; points: number }[]>`SELECT q.type, aq.points::float8 AS points FROM assessment_questions aq JOIN questions q ON q.id = aq.question_id
      JOIN activities a ON a.id = aq.activity_id WHERE aq.activity_id = ${activityId} AND aq.question_id = ${questionId} AND a.course_id = ${courseId}`)[0];
    if (!question) notFound();
    if (question.type !== "short_answer" && question.type !== "essay") throw new HttpError(409, "NOT_WRITTEN", "Rubric hanya tersedia untuk jawaban tertulis.");
    const total = input.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    if (total <= 0 || total > question.points) invalid(`Total poin rubric harus antara 0 dan ${question.points}.`);
    const [row] = await tx`INSERT INTO assessment_rubrics (course_id, activity_id, question_id, title, criteria, created_by)
      VALUES (${courseId}, ${activityId}, ${questionId}, ${input.title}, ${JSON.stringify(input.criteria)}::text::jsonb, ${actor.id})
      ON CONFLICT (activity_id, question_id) DO UPDATE SET title = EXCLUDED.title, criteria = EXCLUDED.criteria, updated_at = clock_timestamp()
      RETURNING id, question_id AS "questionId", title, criteria`;
    await recordAudit(tx, actor.id, "assessment.rubric.saved", "activities", activityId, requestId);
    return row!;
  });
}

export async function listRubrics(db: SQL, actor: Actor, courseId: string, activityId: string) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await courseAccess(tx, actor, courseId, "manage");
    return tx`SELECT id, question_id AS "questionId", title, criteria FROM assessment_rubrics WHERE course_id = ${courseId} AND activity_id = ${activityId}`;
  });
}

// Managers see drafts, archived items, and the question list; students see visible
// assessments with their own attempts and only the scores their settings allow.
export async function listAssessments(db: SQL, actor: Actor, courseId: string, manager: boolean) {
  return db<Assessment[]>`SELECT a.id, a.lesson_id AS "lessonId", a.kind, a.title, a.instructions, a.published, a.archived_at IS NOT NULL AS archived,
      json_build_object('opensAt', s.opens_at, 'closesAt', s.closes_at, 'timeLimitMinutes', s.time_limit_minutes, 'maxAttempts', s.max_attempts,
        'shuffleQuestions', s.shuffle_questions, 'shuffleOptions', s.shuffle_options, 'resultsVisibility', s.results_visibility, 'scoringMode', s.scoring_mode, 'selectionCount', s.selection_count) AS settings,
      (SELECT count(*)::int FROM assessment_questions aq WHERE aq.activity_id = a.id) AS "questionCount",
      (SELECT COALESCE(CASE WHEN s.selection_count IS NULL THEN sum(aq.points) ELSE s.selection_count * min(aq.points) END, 0)::float8 FROM assessment_questions aq WHERE aq.activity_id = a.id) AS "maxScore",
      EXISTS (SELECT 1 FROM attempts t WHERE t.activity_id = a.id) AS locked,
      CASE WHEN ${manager} THEN (SELECT COALESCE(json_agg(json_build_object('questionId', aq.question_id, 'position', aq.position, 'points', aq.points) ORDER BY aq.position), '[]'::json)
        FROM assessment_questions aq WHERE aq.activity_id = a.id) END AS items,
      (SELECT COALESCE(json_agg(json_build_object('id', t.id, 'number', t.number, 'startedAt', t.started_at, 'deadlineAt', t.deadline_at,
          'submittedAt', t.submitted_at, 'submissionReason', t.submission_reason, 'maxScore', t.max_score,
          'adjusted', EXISTS (SELECT 1 FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id),
          'score', CASE WHEN ${manager} OR s.results_visibility IN ('after_submit', 'score_only')
              OR (s.results_visibility = 'after_close' AND (s.closes_at IS NULL OR s.closes_at <= clock_timestamp()))
            THEN COALESCE((SELECT adj.score FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id ORDER BY adj.created_at DESC, adj.id DESC LIMIT 1), t.score) END
        ) ORDER BY t.number), '[]'::json)
        FROM attempts t WHERE t.activity_id = a.id AND t.student_id = ${actor.id}) AS attempts
    FROM activities a JOIN assessment_settings s ON s.activity_id = a.id
    JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    WHERE a.course_id = ${courseId}
      AND (${manager} OR (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))
    ORDER BY a.created_at, a.id`;
}
