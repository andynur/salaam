import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField, invalid } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { adjustmentInput, manualGradeInput } from "./input";
import { finalizeExpired } from "./attempts";
import type { AttemptRow, ScoreAdjustment } from "../../shared/assessment";

export async function listAttempts(db: SQL, actor: Actor, courseId: string, activityId: string, pattern: string, offset: number, requestId: string) {
  await finalizeExpired(db, { activityId }, requestId);
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await courseAccess(tx, actor, courseId, "manage");
    if (!(await tx`SELECT 1 FROM activities WHERE id = ${activityId} AND course_id = ${courseId} AND kind IN ('quiz', 'exam')`).length) notFound();
    return tx<AttemptRow[]>`SELECT t.id, t.student_id AS "studentId", u.display_name AS "studentName", t.number, t.started_at AS "startedAt",
        t.deadline_at AS "deadlineAt", t.submitted_at AS "submittedAt", t.submission_reason AS "submissionReason", t.max_score::float8 AS "maxScore",
        COALESCE((SELECT adj.score FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id ORDER BY adj.created_at DESC, adj.id DESC LIMIT 1), t.score)::float8 AS score,
        EXISTS (SELECT 1 FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id) AS adjusted
      FROM attempts t JOIN users u ON u.id = t.student_id
      WHERE t.activity_id = ${activityId} AND u.display_name ILIKE ${pattern}
      ORDER BY u.display_name, u.id, t.number LIMIT 51 OFFSET ${offset}`;
  });
}

export async function adjustScore(db: SQL, actor: Actor, courseId: string, attemptId: string, body: Record<string, unknown>, requestId: string) {
  const { score, reason } = adjustmentInput(body);
  // The editor supplies the adjustment it read, like assignment grade corrections.
  const previousAdjustmentId = body.previousAdjustmentId === null ? null : idField(body, "previousAdjustmentId");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const attempt = (await tx<{ submitted: boolean; maxScore: number }[]>`SELECT t.submitted_at IS NOT NULL AS submitted, t.max_score::float8 AS "maxScore"
      FROM attempts t JOIN activities a ON a.id = t.activity_id WHERE t.id = ${attemptId} AND a.course_id = ${courseId} FOR UPDATE OF t`)[0];
    if (!attempt) notFound();
    if (!attempt.submitted) throw new HttpError(409, "ATTEMPT_OPEN", "Nilai hanya dapat dikoreksi setelah attempt selesai.");
    if (score > attempt.maxScore) invalid(`Nilai maksimal ${attempt.maxScore}.`);
    const latest = (await tx<{ id: string; score: number; reason: string }[]>`SELECT id, score::float8 AS score, reason FROM attempt_score_adjustments
      WHERE attempt_id = ${attemptId} ORDER BY created_at DESC, id DESC LIMIT 1`)[0];
    if (latest && latest.score === score && latest.reason === reason) return { id: latest.id };
    if ((latest?.id ?? null) !== previousAdjustmentId) throw new HttpError(409, "SCORE_CHANGED", "Nilai sudah dikoreksi. Muat ulang sebelum mengoreksi kembali.");
    const rows = await tx<{ id: string }[]>`INSERT INTO attempt_score_adjustments (attempt_id, grader_id, score, reason)
      VALUES (${attemptId}, ${actor.id}, ${score}, ${reason}) RETURNING id`;
    await recordAudit(tx, actor.id, "assessment.attempt.adjusted", "attempts", attemptId, requestId);
    return rows[0]!;
  });
}

export async function adjustmentHistory(db: SQL, actor: Actor, courseId: string, attemptId: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await courseAccess(tx, actor, courseId, "manage");
    if (!(await tx`SELECT 1 FROM attempts t JOIN activities a ON a.id = t.activity_id WHERE t.id = ${attemptId} AND a.course_id = ${courseId}`).length) notFound();
    return tx<ScoreAdjustment[]>`SELECT adj.id, adj.score::float8 AS score, adj.reason, u.display_name AS "graderName", adj.created_at AS "createdAt"
      FROM attempt_score_adjustments adj JOIN users u ON u.id = adj.grader_id
      WHERE adj.attempt_id = ${attemptId} ORDER BY adj.created_at DESC, adj.id DESC LIMIT 51 OFFSET ${offset}`;
  });
}

export async function gradeWrittenAnswer(db: SQL, actor: Actor, courseId: string, attemptId: string, questionId: string, body: Record<string, unknown>, requestId: string) {
  const { score, feedback, breakdown } = manualGradeInput(body);
  const previousGradeId = body.previousGradeId === null ? null : idField(body, "previousGradeId");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const [answer] = await tx<{ studentId: string; points: number; type: string; submitted: boolean }[]>`SELECT t.student_id AS "studentId", q.points::float8 AS points, q.type, t.submitted_at IS NOT NULL AS submitted
      FROM attempts t JOIN attempt_questions q ON q.attempt_id = t.id JOIN activities a ON a.id = t.activity_id
      LEFT JOIN attempt_answers ans ON ans.attempt_id = q.attempt_id AND ans.question_id = q.question_id
      WHERE t.id = ${attemptId} AND q.question_id = ${questionId} AND a.course_id = ${courseId} FOR UPDATE OF t`;
    if (!answer) notFound();
    if (!answer.submitted) throw new HttpError(409, "ATTEMPT_OPEN", "Jawaban hanya dapat dinilai setelah attempt selesai.");
    if (answer.type !== "short_answer" && answer.type !== "essay") throw new HttpError(409, "NOT_WRITTEN", "Soal pilihan tidak memerlukan penilaian manual.");
    if (score > answer.points) invalid(`Nilai maksimal ${answer.points}.`);
    const rubric = (await tx<{ criteria: { id: string; maxPoints: number }[] }[]>`SELECT criteria FROM assessment_rubrics WHERE activity_id = (SELECT activity_id FROM attempts WHERE id = ${attemptId}) AND question_id = ${questionId}`)[0];
    if (rubric) {
      const valid = new Map(rubric.criteria.map(criterion => [criterion.id, Number(criterion.maxPoints)]));
      if (breakdown.length !== valid.size || breakdown.some(item => !valid.has(item.criterionId) || item.score > valid.get(item.criterionId)!)) invalid("Breakdown rubric harus mencakup setiap kriteria dan tidak melebihi poin maksimal.");
      const total = breakdown.reduce((sum, item) => sum + item.score, 0);
      if (Math.abs(total - score) > 0.000001) invalid("Jumlah poin rubric harus sama dengan nilai akhir.");
    } else if (breakdown.length) invalid("Soal ini belum memiliki rubric.");
    const latest = (await tx<{ id: string; score: number; feedback: string }[]>`SELECT id, score::float8 AS score, feedback FROM attempt_question_grades WHERE attempt_id = ${attemptId} AND question_id = ${questionId} ORDER BY created_at DESC, id DESC LIMIT 1`)[0];
    if (latest && latest.score === score && latest.feedback === feedback) return { id: latest.id };
    if ((latest?.id ?? null) !== previousGradeId) throw new HttpError(409, "GRADE_CHANGED", "Nilai sudah diperbarui. Muat ulang sebelum menilai kembali.");
    const [grade] = await tx`INSERT INTO attempt_question_grades (attempt_id, question_id, grader_id, score, feedback, breakdown) VALUES (${attemptId}, ${questionId}, ${actor.id}, ${score}, ${feedback}, ${JSON.stringify(breakdown)}::text::jsonb) RETURNING id`;
    await tx`UPDATE attempt_answers SET awarded = ${score} WHERE attempt_id = ${attemptId} AND question_id = ${questionId}`;
    await tx`UPDATE attempts SET score = (SELECT COALESCE(sum(awarded), 0) FROM attempt_answers WHERE attempt_id = ${attemptId}) WHERE id = ${attemptId}`;
    await recordAudit(tx, actor.id, "assessment.answer.graded", "attempts", attemptId, requestId);
    return grade!;
  });
}
