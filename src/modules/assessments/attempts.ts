import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { invalid } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { awardXp } from "../gamification/awards";
import { courseAccess, notFound } from "../learning/access";
import { answerInput } from "./input";
import type { AttemptDetail, AttemptQuestion, QuestionOption, QuestionType, ResultsVisibility } from "../../shared/assessment";

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = crypto.getRandomValues(new Uint32Array(1))[0]! % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

// Choice answers are all-or-nothing: the sorted selection must equal the sorted key.
async function finalizeAttempt(tx: SQL, attemptId: string, reason: "student" | "expired", requestId: string) {
  await tx`UPDATE attempt_answers ans SET awarded = CASE WHEN ans.selected = q.correct THEN q.points ELSE 0 END
    FROM attempt_questions q WHERE q.attempt_id = ans.attempt_id AND q.question_id = ans.question_id AND ans.attempt_id = ${attemptId}`;
  const finalized = await tx<{ studentId: string; activityId: string; courseId: string }[]>`UPDATE attempts SET submission_reason = ${reason},
      submitted_at = CASE WHEN ${reason} = 'expired' THEN deadline_at ELSE clock_timestamp() END,
      score = (SELECT COALESCE(sum(ans.awarded), 0) FROM attempt_answers ans WHERE ans.attempt_id = attempts.id)
    WHERE id = ${attemptId} AND submitted_at IS NULL
    RETURNING student_id AS "studentId", activity_id AS "activityId",
      (SELECT a.course_id FROM activities a WHERE a.id = attempts.activity_id) AS "courseId"`;
  // The assessment itself is the source, so only the first finished attempt earns XP,
  // however many attempts the settings allow.
  for (const done of finalized) await awardXp(tx, done.studentId, "assessment.completed", "activities", done.activityId, done.courseId, requestId);
}

// Attempts past their server deadline are finalized lazily by whoever reads or writes them next.
export async function finalizeExpired(db: SQL, scope: { attemptId?: string; activityId?: string }, requestId: string) {
  const attemptId = scope.attemptId ?? null;
  const activityId = scope.activityId ?? null;
  await db.begin(async tx => {
    const rows = await tx<{ id: string }[]>`SELECT id FROM attempts WHERE submitted_at IS NULL AND deadline_at <= clock_timestamp()
      AND (${attemptId}::uuid IS NULL OR id = ${attemptId}::uuid) AND (${activityId}::uuid IS NULL OR activity_id = ${activityId}::uuid)
      FOR UPDATE SKIP LOCKED`;
    for (const row of rows) {
      await finalizeAttempt(tx, row.id, "expired", requestId);
      await recordAudit(tx, null, "assessment.attempt.expired", "attempts", row.id, requestId);
    }
  });
}

type Settings = { timeLimitMinutes: number | null; closesAt: Date | null; opened: boolean; maxAttempts: number; shuffleQuestions: boolean; shuffleOptions: boolean };
export async function startAttempt(db: SQL, actor: Actor, courseId: string, activityId: string, requestId: string) {
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "participate", "share");
    const settings = (await tx<Settings[]>`SELECT s.time_limit_minutes AS "timeLimitMinutes", s.closes_at AS "closesAt", s.max_attempts AS "maxAttempts",
        s.shuffle_questions AS "shuffleQuestions", s.shuffle_options AS "shuffleOptions", (s.opens_at IS NULL OR s.opens_at <= clock_timestamp()) AS opened
      FROM activities a JOIN assessment_settings s ON s.activity_id = a.id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE a.id = ${activityId} AND a.course_id = ${courseId} AND a.published AND l.published AND m.published
        AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL`)[0];
    if (!settings) notFound();
    // Serializes one student's starts for this assessment, so retries resume the same attempt.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`attempt:${activityId}:${actor.id}`}, 0))`;
    const open = (await tx<{ id: string; expired: boolean }[]>`SELECT id, (deadline_at IS NOT NULL AND deadline_at <= clock_timestamp()) AS expired
      FROM attempts WHERE activity_id = ${activityId} AND student_id = ${actor.id} AND submitted_at IS NULL FOR UPDATE`)[0];
    if (open && !open.expired) return { id: open.id, resumed: true };
    if (open) {
      await finalizeAttempt(tx, open.id, "expired", requestId);
      await recordAudit(tx, null, "assessment.attempt.expired", "attempts", open.id, requestId);
    }
    if (!settings.opened) throw new HttpError(409, "NOT_OPEN", "Penilaian belum dibuka.");
    const used = (await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM attempts WHERE activity_id = ${activityId} AND student_id = ${actor.id}`)[0]!.count;
    if (used >= settings.maxAttempts) throw new HttpError(409, "NO_ATTEMPTS_LEFT", "Kesempatan mengerjakan sudah habis.");
    const questions = await tx<{ questionId: string; type: QuestionType; prompt: string; options: QuestionOption[]; correct: string[]; explanation: string; points: string }[]>`
      SELECT q.id AS "questionId", q.type, q.prompt, q.options, q.correct, q.explanation, aq.points
      FROM assessment_questions aq JOIN questions q ON q.id = aq.question_id WHERE aq.activity_id = ${activityId} ORDER BY aq.position, q.id`;
    if (!questions.length) throw new HttpError(409, "NO_QUESTIONS", "Penilaian belum memiliki soal.");
    const snapshot = (settings.shuffleQuestions ? shuffled(questions) : questions).map((question, position) => ({
      ...question, position, options: settings.shuffleOptions ? shuffled(question.options) : question.options,
    }));
    const maxScore = questions.reduce((total, question) => total + Number(question.points), 0);
    // One clock reading fixes the start, the window check, and the deadline together.
    const created = await tx<{ id: string }[]>`INSERT INTO attempts (activity_id, student_id, number, started_at, deadline_at, max_score)
      SELECT ${activityId}, ${actor.id}, ${used + 1}, now.at,
        LEAST(now.at + ${settings.timeLimitMinutes}::integer * interval '1 minute', ${settings.closesAt}::timestamptz), ${maxScore}
      FROM (SELECT clock_timestamp() AS at) now WHERE ${settings.closesAt}::timestamptz IS NULL OR ${settings.closesAt}::timestamptz > now.at
      RETURNING id`;
    if (!created[0]) throw new HttpError(409, "CLOSED", "Penilaian sudah ditutup.");
    await tx`INSERT INTO attempt_questions (attempt_id, question_id, position, type, prompt, options, correct, explanation, points)
      SELECT ${created[0].id}, item."questionId", item.position, item.type, item.prompt, item.options, item.correct, item.explanation, item.points
      FROM jsonb_to_recordset(${JSON.stringify(snapshot)}::text::jsonb)
        AS item("questionId" uuid, position integer, type text, prompt text, options jsonb, correct jsonb, explanation text, points numeric)`;
    await recordAudit(tx, actor.id, "assessment.attempt.started", "attempts", created[0].id, requestId);
    return { id: created[0].id, resumed: false };
  });
}

type AttemptRow = Omit<AttemptDetail, "questions" | "resultsVisible" | "scoreVisible" | "score" | "adjusted"> & {
  autoScore: number | null; adjustedScore: number | null; visibility: ResultsVisibility; closed: boolean; visible: boolean;
};
export async function attemptDetail(db: SQL, actor: Actor, courseId: string, attemptId: string, requestId: string): Promise<AttemptDetail> {
  await finalizeExpired(db, { attemptId }, requestId);
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course } = await courseAccess(tx, actor, courseId, "view");
    const row = (await tx<AttemptRow[]>`SELECT t.id, t.activity_id AS "activityId", t.student_id AS "studentId", u.display_name AS "studentName", t.number,
        t.started_at AS "startedAt", t.deadline_at AS "deadlineAt", t.submitted_at AS "submittedAt", t.submission_reason AS "submissionReason",
        t.score::float8 AS "autoScore", t.max_score::float8 AS "maxScore", clock_timestamp() AS "serverNow",
        (SELECT adj.score::float8 FROM attempt_score_adjustments adj WHERE adj.attempt_id = t.id ORDER BY adj.created_at DESC, adj.id DESC LIMIT 1) AS "adjustedScore",
        s.results_visibility AS visibility, (s.closes_at IS NULL OR s.closes_at <= clock_timestamp()) AS closed,
        (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL) AS visible
      FROM attempts t JOIN users u ON u.id = t.student_id JOIN activities a ON a.id = t.activity_id JOIN assessment_settings s ON s.activity_id = a.id
      JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
      WHERE t.id = ${attemptId} AND a.course_id = ${courseId}`)[0];
    if (!row || !(course.canManage || (row.studentId === actor.id && row.visible))) notFound();
    const submitted = row.submittedAt !== null;
    const resultsVisible = course.canManage || (submitted && (row.visibility === "after_submit" || (row.visibility === "after_close" && row.closed)));
    const scoreVisible = resultsVisible || (submitted && row.visibility === "score_only");
    const questions = await tx<AttemptQuestion[]>`SELECT q.question_id AS "questionId", q.position, q.type, q.prompt, q.options, q.points::float8 AS points,
        q.correct, q.explanation, COALESCE(ans.selected, '[]'::jsonb) AS selected, COALESCE(ans.revision, 0) AS revision, ans.awarded::float8 AS awarded
      FROM attempt_questions q LEFT JOIN attempt_answers ans ON ans.attempt_id = q.attempt_id AND ans.question_id = q.question_id
      WHERE q.attempt_id = ${attemptId} ORDER BY q.position`;
    const { autoScore, adjustedScore, visibility, closed, visible, ...summary } = row;
    return {
      ...summary, resultsVisible, scoreVisible, adjusted: adjustedScore !== null, canAnswer: row.studentId === actor.id && !submitted,
      score: scoreVisible ? adjustedScore ?? autoScore : null,
      questions: questions.map(question => resultsVisible
        ? { ...question, awarded: submitted ? question.awarded ?? 0 : null }
        : { ...question, correct: null, explanation: null, awarded: null }),
    };
  });
}

async function ownOpenAttempt(tx: SQL, actor: Actor, courseId: string, attemptId: string) {
  await courseAccess(tx, actor, courseId, "participate", "share");
  const attempt = (await tx<{ id: string; submitted: boolean; expired: boolean }[]>`SELECT t.id, t.submitted_at IS NOT NULL AS submitted,
      (t.submitted_at IS NULL AND t.deadline_at IS NOT NULL AND t.deadline_at <= clock_timestamp()) AS expired
    FROM attempts t JOIN activities a ON a.id = t.activity_id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    WHERE t.id = ${attemptId} AND t.student_id = ${actor.id} AND a.course_id = ${courseId}
      AND a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL
    FOR UPDATE OF t`)[0];
  if (!attempt) notFound();
  return attempt;
}

export async function saveAnswer(db: SQL, actor: Actor, courseId: string, attemptId: string, body: Record<string, unknown>) {
  const input = answerInput(body);
  return db.begin(async tx => {
    const attempt = await ownOpenAttempt(tx, actor, courseId, attemptId);
    if (attempt.submitted) throw new HttpError(409, "ATTEMPT_SUBMITTED", "Jawaban sudah dikumpulkan.");
    if (attempt.expired) throw new HttpError(409, "ATTEMPT_EXPIRED", "Waktu mengerjakan sudah habis. Jawaban terakhir yang tersimpan akan dinilai.");
    const question = (await tx<{ type: QuestionType; options: QuestionOption[] }[]>`SELECT type, options FROM attempt_questions
      WHERE attempt_id = ${attemptId} AND question_id = ${input.questionId}`)[0];
    if (!question) notFound();
    if (input.selected.some(id => !question.options.some(option => option.id === id)) || (question.type !== "multiple_choice" && input.selected.length > 1)) {
      invalid("Pilihan jawaban tidak sesuai dengan soal.");
    }
    // Autosave only moves forward; an older revision arriving late is ignored.
    await tx`INSERT INTO attempt_answers (attempt_id, question_id, selected, revision) VALUES (${attemptId}, ${input.questionId}, ${JSON.stringify(input.selected)}::text::jsonb, ${input.revision})
      ON CONFLICT (attempt_id, question_id) DO UPDATE SET selected = EXCLUDED.selected, revision = EXCLUDED.revision, saved_at = clock_timestamp()
      WHERE attempt_answers.revision < EXCLUDED.revision`;
    const stored = (await tx<{ revision: number; selected: string[] }[]>`SELECT revision, selected FROM attempt_answers WHERE attempt_id = ${attemptId} AND question_id = ${input.questionId}`)[0]!;
    return { questionId: input.questionId, revision: stored.revision, selected: stored.selected };
  });
}

export async function submitAttempt(db: SQL, actor: Actor, courseId: string, attemptId: string, requestId: string) {
  return db.begin(async tx => {
    const attempt = await ownOpenAttempt(tx, actor, courseId, attemptId);
    // Final submit is idempotent: repeated or concurrent requests all see one submission.
    if (!attempt.submitted) {
      const reason = attempt.expired ? "expired" : "student";
      await finalizeAttempt(tx, attemptId, reason, requestId);
      await recordAudit(tx, reason === "expired" ? null : actor.id, `assessment.attempt.${reason === "expired" ? "expired" : "submitted"}`, "attempts", attemptId, requestId);
    }
    return (await tx<{ id: string; submittedAt: string; submissionReason: "student" | "expired" }[]>`SELECT id, submitted_at AS "submittedAt", submission_reason AS "submissionReason"
      FROM attempts WHERE id = ${attemptId}`)[0]!;
  });
}
