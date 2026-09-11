import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { archivedInput } from "../learning/input";
import { questionInput } from "./input";
import type { Question } from "../../shared/assessment";

// Answer keys are only ever returned to course managers.
export async function listQuestions(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number, includeArchived: boolean) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await courseAccess(tx, actor, courseId, "manage");
    return tx<Question[]>`SELECT q.id, q.type, q.prompt, q.options, q.correct, q.explanation, q.archived_at IS NOT NULL AS archived,
      (SELECT count(*)::int FROM assessment_questions aq WHERE aq.question_id = q.id) AS usage, q.created_at::text AS "createdAt"
      FROM questions q WHERE q.course_id = ${courseId} AND (${includeArchived} OR q.archived_at IS NULL) AND q.prompt ILIKE ${pattern}
      ORDER BY q.created_at DESC, q.id DESC LIMIT 51 OFFSET ${offset}`;
  });
}

export async function saveQuestion(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string, id?: string) {
  const input = questionInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let rows: { id: string }[];
    if (id) {
      // Every student of an assessment must see the same wording and answer key.
      if ((await tx`SELECT 1 FROM assessment_questions aq JOIN attempts a ON a.activity_id = aq.activity_id WHERE aq.question_id = ${id} LIMIT 1`).length) {
        throw new HttpError(409, "QUESTION_LOCKED", "Soal sudah dikerjakan santri dan tidak dapat diubah. Buat soal baru untuk revisi.");
      }
      rows = await tx`UPDATE questions SET type = ${input.type}, prompt = ${input.prompt}, options = ${JSON.stringify(input.options)}::text::jsonb,
          correct = ${JSON.stringify(input.correct)}::text::jsonb, explanation = ${input.explanation}
        WHERE id = ${id} AND course_id = ${courseId} AND archived_at IS NULL RETURNING id`;
    } else {
      rows = await tx`INSERT INTO questions (course_id, type, prompt, options, correct, explanation, created_by)
        VALUES (${courseId}, ${input.type}, ${input.prompt}, ${JSON.stringify(input.options)}::text::jsonb, ${JSON.stringify(input.correct)}::text::jsonb, ${input.explanation}, ${actor.id})
        RETURNING id`;
    }
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `assessment.question.${id ? "updated" : "created"}`, "questions", rows[0]!.id, requestId);
    return rows[0]!;
  });
}

// Archiving hides a question from the bank picker; assessments that already use it keep it.
export async function archiveQuestion(db: SQL, actor: Actor, courseId: string, id: string, body: Record<string, unknown>, requestId: string) {
  const archived = archivedInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const rows = await tx<{ id: string }[]>`UPDATE questions SET archived_at = CASE WHEN ${archived} THEN COALESCE(archived_at, clock_timestamp()) END
      WHERE id = ${id} AND course_id = ${courseId} RETURNING id`;
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `assessment.question.${archived ? "archived" : "restored"}`, "questions", rows[0]!.id, requestId);
    return rows[0]!;
  });
}
