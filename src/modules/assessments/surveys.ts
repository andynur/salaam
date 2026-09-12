import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField, invalid, textField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, lessonAccess, notFound } from "../learning/access";
import { surveyAnswersInput, surveyKindInput, surveyQuestionsInput } from "./input";
import type { Survey, SurveyQuestion } from "../../shared/assessment";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function saveSurvey(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string, id?: string) {
  requirePermission(actor, "learning.manage");
  const kind = surveyKindInput(body);
  const title = textField(body, "title", 150);
  const instructions = textField(body, "instructions", 20000);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let surveyId = id;
    if (id) {
      if ((await tx`SELECT 1 FROM survey_responses WHERE activity_id = ${id} LIMIT 1`).length) throw new HttpError(409, "SURVEY_LOCKED", "Survey sudah memiliki respons dan tidak dapat diubah.");
      const current = (await tx<{ kind: string }[]>`SELECT kind FROM activities WHERE id = ${id} AND course_id = ${courseId} AND kind IN ('survey', 'questionnaire') AND archived_at IS NULL FOR UPDATE`)[0];
      if (!current) notFound();
      if (current.kind !== kind) throw new HttpError(409, "KIND_LOCKED", "Jenis survey tidak dapat diubah.");
      await tx`UPDATE activities SET title = ${title}, instructions = ${instructions} WHERE id = ${id}`;
    } else {
      const lessonId = idField(body, "lessonId");
      await lessonAccess(tx, courseId, lessonId, true);
      surveyId = (await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions) VALUES (${courseId}, ${lessonId}, ${kind}, ${title}, ${instructions}) RETURNING id`)[0]!.id;
      await tx`INSERT INTO survey_settings (activity_id, kind) VALUES (${surveyId}, ${kind})`;
    }
    await recordAudit(tx, actor.id, `survey.${id ? "updated" : "created"}`, "activities", surveyId!, requestId);
    return { id: surveyId! };
  });
}

export async function setSurveyQuestions(db: SQL, actor: Actor, courseId: string, activityId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const questions = surveyQuestionsInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    if (!(await tx`SELECT 1 FROM activities a JOIN survey_settings s ON s.activity_id = a.id WHERE a.id = ${activityId} AND a.course_id = ${courseId} FOR UPDATE`).length) notFound();
    if ((await tx`SELECT 1 FROM survey_responses WHERE activity_id = ${activityId} LIMIT 1`).length) throw new HttpError(409, "SURVEY_LOCKED", "Pertanyaan terkunci setelah respons pertama.");
    await tx`DELETE FROM survey_questions WHERE activity_id = ${activityId}`;
    for (const question of questions) await tx`INSERT INTO survey_questions (activity_id, course_id, prompt, type, options, required, position)
      VALUES (${activityId}, ${courseId}, ${question.prompt}, ${question.type}, ${JSON.stringify(question.options)}::text::jsonb, ${question.required}, ${question.position})`;
    await recordAudit(tx, actor.id, "survey.questions.updated", "activities", activityId, requestId);
    return { id: activityId, questionCount: questions.length };
  });
}

export async function listSurveys(db: SQL, actor: Actor, courseId: string, drafts: boolean) {
  return db<Survey[]>`SELECT a.id, a.lesson_id AS "lessonId", a.kind, a.title, a.instructions, a.published, a.archived_at IS NOT NULL AS archived,
    EXISTS (SELECT 1 FROM survey_responses sr WHERE sr.activity_id = a.id) AS locked,
    COALESCE((SELECT json_agg(json_build_object('id', q.id, 'prompt', q.prompt, 'type', q.type, 'options', q.options, 'required', q.required, 'position', q.position) ORDER BY q.position) FROM survey_questions q WHERE q.activity_id = a.id), '[]'::json) AS questions,
    EXISTS (SELECT 1 FROM survey_responses sr WHERE sr.activity_id = a.id AND sr.student_id = ${actor.id}) AS responded,
    (SELECT sr.answers FROM survey_responses sr WHERE sr.activity_id = a.id AND sr.student_id = ${actor.id}) AS response
    FROM activities a JOIN survey_settings s ON s.activity_id = a.id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    WHERE a.course_id = ${courseId} AND (${drafts} OR (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))
    ORDER BY a.created_at, a.id`;
}

export async function respondSurvey(db: SQL, actor: Actor, courseId: string, activityId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.participate");
  const rawAnswers = surveyAnswersInput(body);
  if (!Object.keys(rawAnswers).length) invalid("Semua pertanyaan wajib harus dijawab.");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "participate", "share");
    const questions = await tx<SurveyQuestion[]>`SELECT q.id, q.prompt, q.type, q.options, q.required, q.position FROM survey_questions q JOIN activities a ON a.id = q.activity_id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE q.activity_id = ${activityId} AND a.course_id = ${courseId} AND a.kind IN ('survey', 'questionnaire') AND a.published AND l.published AND m.published
        AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL ORDER BY q.position`;
    if (!questions.length) notFound();
    const known = new Set(questions.map(question => question.id));
    if (Object.keys(rawAnswers).some(id => !known.has(id))) invalid("Jawaban mengandung pertanyaan yang tidak tersedia.");
    const normalized: Record<string, string | string[]> = {};
    for (const question of questions) {
      const answer = rawAnswers[question.id];
      const missing = answer === undefined || answer === null || (typeof answer === "string" && !answer.trim()) || (Array.isArray(answer) && !answer.length);
      if (question.required && missing) throw new HttpError(400, "INVALID_INPUT", "Semua pertanyaan wajib harus dijawab.");
      if (missing) continue;
      const questionOptions = Array.isArray(question.options) ? question.options : JSON.parse(String(question.options)) as SurveyQuestion["options"];
      const options = new Set(questionOptions.map(option => option.id));
      if (question.type === "short_answer") {
        if (typeof answer !== "string" || answer.trim().length > 20000) invalid("Jawaban singkat maksimal 20000 karakter.");
        normalized[question.id] = answer.trim();
      } else if (question.type === "single_choice") {
        if (typeof answer !== "string" || !options.has(answer)) invalid("Pilihan jawaban tidak valid.");
        normalized[question.id] = answer;
      } else {
        if (!Array.isArray(answer) || answer.some(value => typeof value !== "string" || !options.has(value))) invalid("Pilihan jawaban tidak valid.");
        normalized[question.id] = [...new Set(answer as string[])].sort();
      }
    }
    const existing = (await tx<{ id: string; answers: Record<string, string | string[]> }[]>`SELECT id, answers FROM survey_responses WHERE activity_id = ${activityId} AND student_id = ${actor.id} FOR UPDATE`)[0];
    if (existing) {
      const previous = typeof existing.answers === "string" ? JSON.parse(existing.answers) as Record<string, string | string[]> : existing.answers;
      if (canonical(previous) !== canonical(normalized)) throw new HttpError(409, "ALREADY_RESPONDED", "Respons survey sudah dikirim dan tidak dapat diubah.");
      return { id: existing.id };
    }
    const [response] = await tx`INSERT INTO survey_responses (activity_id, course_id, student_id, answers) VALUES (${activityId}, ${courseId}, ${actor.id}, ${JSON.stringify(normalized)}::text::jsonb) RETURNING id`;
    await recordAudit(tx, actor.id, "survey.responded", "survey_responses", response!.id, requestId);
    return response!;
  });
}
