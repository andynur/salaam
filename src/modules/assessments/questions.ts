import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { archivedInput } from "../learning/input";
import { questionImportInput, questionInput } from "./input";
import type { Question } from "../../shared/assessment";

// Answer keys are only ever returned to course managers.
export async function listQuestions(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number, includeArchived: boolean) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await courseAccess(tx, actor, courseId, "manage");
    return tx<Question[]>`SELECT q.id, q.type, q.prompt, q.options, q.correct, q.explanation, q.archived_at IS NOT NULL AS archived,
      (SELECT count(*)::int FROM assessment_questions aq WHERE aq.question_id = q.id) AS usage,
      (SELECT count(*) FILTER (WHERE a.submitted_at IS NOT NULL)::int FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id WHERE aq.question_id = q.id) AS "attemptCount",
      (SELECT count(*) FILTER (WHERE a.submitted_at IS NOT NULL AND aa.awarded IS NOT NULL)::int
        FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id LEFT JOIN attempt_answers aa ON aa.attempt_id = aq.attempt_id AND aa.question_id = aq.question_id
        WHERE aq.question_id = q.id) AS "responseCount",
      (SELECT CASE WHEN q.type IN ('single_choice', 'multiple_choice', 'true_false') AND count(*) FILTER (WHERE a.submitted_at IS NOT NULL AND aa.awarded IS NOT NULL) > 0
        THEN round(100.0 * count(*) FILTER (WHERE a.submitted_at IS NOT NULL AND aa.awarded >= aq.points) / count(*) FILTER (WHERE a.submitted_at IS NOT NULL AND aa.awarded IS NOT NULL), 2)::float8 END
        FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id LEFT JOIN attempt_answers aa ON aa.attempt_id = aq.attempt_id AND aa.question_id = aq.question_id
        WHERE aq.question_id = q.id) AS "correctRate",
      q.created_at::text AS "createdAt"
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

function csvCell(value: string) { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
export async function exportQuestions(db: SQL, actor: Actor, courseId: string, includeArchived: boolean) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await courseAccess(tx, actor, courseId, "manage");
    const rows = await tx<{ type: string; prompt: string; options: { text: string }[]; correct: string[]; explanation: string }[]>`SELECT type, prompt, options, correct, explanation FROM questions
      WHERE course_id = ${courseId} AND (${includeArchived} OR archived_at IS NULL) ORDER BY created_at, id`;
    return ["type,prompt,options,correct,explanation", ...rows.map(row => [row.type, row.prompt, row.options.map(option => option.text).join("|"), row.correct.join("|"), row.explanation].map(csvCell).join(","))].join("\r\n") + "\r\n";
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function importQuestions(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string) {
  const input = questionImportInput(body);
  const hash = await sha256(input.csv);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const existing = (await tx<{ id: string; payloadSha256: string; questionIds: string[] }[]>`SELECT id, payload_sha256 AS "payloadSha256", question_ids AS "questionIds" FROM question_imports WHERE course_id = ${courseId} AND request_key = ${input.requestKey} FOR UPDATE`)[0];
    if (existing) {
      if (existing.payloadSha256 !== hash) throw new HttpError(409, "IMPORT_CHANGED", "Request key sudah digunakan untuk CSV yang berbeda.");
      return { importId: existing.id, questionIds: existing.questionIds };
    }
    const questionIds: string[] = [];
    for (const question of input.questions) {
      const row = (await tx<{ id: string }[]>`INSERT INTO questions (course_id, type, prompt, options, correct, explanation, created_by)
        VALUES (${courseId}, ${question.type}, ${question.prompt}, ${JSON.stringify(question.options)}::text::jsonb, ${JSON.stringify(question.correct)}::text::jsonb, ${question.explanation}, ${actor.id}) RETURNING id`)[0]!;
      questionIds.push(row.id);
    }
    const imported = (await tx<{ id: string }[]>`INSERT INTO question_imports (course_id, request_key, payload_sha256, question_ids, created_by)
      VALUES (${courseId}, ${input.requestKey}, ${hash}, ${JSON.stringify(questionIds)}::text::jsonb, ${actor.id}) RETURNING id`)[0]!;
    await recordAudit(tx, actor.id, "assessment.questions.imported", "question_imports", imported.id, requestId);
    return { importId: imported.id, questionIds };
  });
}
