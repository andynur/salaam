# Phase 3 — Assessment Engine validation

Validated locally on 2026-09-11 with Bun 1.4.2 and the local PostgreSQL server.
Phase 3 is implemented for choice-based assessment. Before implementation, the product
owner scoped the question types to single choice, multiple choice, and true/false, and
left surveys out of this phase.

## Delivered scope

- Migration `0004_assessment_engine.sql`. It reuses `learning.manage` for authoring and
  grading and `learning.participate` for attempts; no new capabilities are added.
- **Question bank per course.**
  - Types: single choice (2–10 options, one key), multiple choice (2–10 options, one or
    more keys), and true/false.
  - Each question has a prompt, an answer key, and an optional explanation.
  - Questions can be archived. Answer keys are returned only to course managers.
- **Quizzes and exams** are `quiz` and `exam` activities on the shared activities table,
  with one settings row each:
  - optional opening and closing times
  - optional time limit (1–600 minutes)
  - 1–10 attempts
  - per-attempt shuffling of questions and options
  - result visibility: after submit, after close, score only, or hidden
- **Exam integrity** is enforced by a database constraint: an exam always has one
  attempt, a time limit, and a closing time. An assessment without questions cannot be
  published.
- **Locking.** After the first attempt, the assessment's settings and question list are
  locked (409), and so is every question it uses. All students of an assessment see
  the same content.
- **Attempts snapshot** their questions, options, keys, explanations, and points when
  they start:
  - Shuffling uses a cryptographic random source.
  - A partial unique index plus a per-student advisory lock guarantee at most one open
    attempt, so repeated or concurrent starts resume it.
  - The start time, window check, and deadline share one server clock reading. The
    deadline is the earlier of start plus the time limit and the closing time.
- **Autosave** stores one answer per question with a client revision. Only a higher
  revision replaces the stored answer, so delayed retries after a reconnect never
  overwrite newer choices. Answers must match the attempt's options, with at most one
  choice for single-choice and true/false questions.
- **Final submission** is idempotent: repeated and concurrent submits return the same
  result and write one audit event.
- **Expiry.** An attempt past its deadline accepts no further answers. It is finalized
  with its last saved answers the next time it is started, read, submitted, or listed by
  a teacher. `submitted_at` is set to the deadline and the audit event has no actor.
- **Scoring.** Each question is all-or-nothing: the selection must equal the key
  exactly. The attempt score is the sum of awarded points.
- **Results.** Students see scores, marks, and explanations only as allowed by the
  visibility setting. Teachers always see them.
- **Score adjustments** append a row with score (0 to maximum), reason, and grader, use
  the same stale-edit check as assignment grades (`previousAdjustmentId`), are audited,
  and replace the automatic score in all views.
- **Progress** counts a quiz or exam as done and graded once any attempt is submitted.
  The student dashboard lists open, unfinished quizzes and exams alongside assignments.
- **Load.** Attempt traffic takes a shared (`FOR SHARE`) course lock. Publishing still
  waits for in-flight attempt writes, but students do not serialize on each other.
- **UI:**
  - a Bank soal tab for teachers
  - a quiz/exam card per lesson with editor, question picker, publish, archive, results
    table, and score adjustment
  - an attempt page with server-corrected countdown, autosave status, offline answer
    queue in `localStorage`, automatic submission at the deadline, and result view
  - a read-only attempt view for teachers

## API additions

All routes are under `/api/learning/courses/{courseId}`; mutations require the same
origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` / `POST` | `/questions` (`?archived=1`) | List or create bank questions (managers) |
| `PATCH` | `/questions/{id}` | Update an unlocked question |
| `POST` | `/questions/{id}/archive` | Archive or restore a question |
| `POST` / `PATCH` | `/assessments[/{id}]` | Create or update a quiz or exam and its settings |
| `POST` | `/assessments/{id}/items` | Replace the question list and points |
| `POST` | `/assessments/{id}/attempts` | Start or resume an attempt (201 new, 200 resumed) |
| `GET` | `/assessments/{id}/attempts` | Attempts for managers |
| `GET` | `/attempts/{id}` | Attempt detail with visibility-filtered results |
| `POST` | `/attempts/{id}/answers` | Autosave one answer with a revision |
| `POST` | `/attempts/{id}/submit` | Idempotent final submission |
| `POST` | `/attempts/{id}/adjust` | Append a score adjustment |
| `GET` | `/attempts/{id}/adjustments` | Adjustment history |

Publishing and archiving use `/activities/{id}/publish` and `/activities/{id}/archive`.
The course workspace response includes `assessments`.

## Verified behavior

- PostgreSQL integration (`tests/assessment.integration.test.ts`, 7 tests):
  - **Question bank:** manager-only access, validation, archiving, archived questions
    refused for new assessments, and editing locked after an attempt.
  - **Quiz flow:**
    - Publishing without questions is refused.
    - Students never receive answer keys before results are allowed.
    - Starts resume, and a late lower revision is ignored.
    - Invalid choices and other students' attempts are rejected.
    - The definition locks after the first attempt.
    - Concurrent submits produce one audit event, and saving after submit returns 409.
    - Scores are automatic (5 of 6 with the expected per-question points).
    - The attempt limit holds, and progress counts the quiz.
  - **Exam flow:**
    - Exam integrity rules hold, and early starts are refused.
    - The 30-minute deadline is fixed by the server.
    - After expiry, answers are refused and the attempt finalizes with the saved answer
      and a system audit event.
    - Results stay hidden until close, while the teacher sees them.
    - Starting after close is refused.
  - **Concurrency:** five concurrent starts produce one attempt; twenty autosaves in
    random order leave the highest revision.
  - **Score adjustments:** the maximum and permission checks, idempotent retry, stale
    conflict, history, score-only visibility, refusal on open attempts, and audit
    events.
  - **Boundaries:** cross-course question IDs and attempts are refused, hidden results
    stay hidden, and archiving an assessment hides it and its attempts from students.
  - **Load:** 125 students each start, answer, and submit one exam concurrently. All 125
    attempts are submitted and scored correctly.
- Unit tests (`tests/assessment.test.ts`, 3 tests): question, settings, item, answer,
  and adjustment validation, including exam rules and option limits.
- The two Phase 3 test files (10 tests, including the 125-student run) finish in
  0.85 s locally.
- Browser smoke on the prebuilt bundle against a disposable QA database, driven through
  headless Chrome with the DevTools protocol. 31 of 31 checks passed:
  - The teacher creates a question through the Bank soal form, then builds a quiz
    through the picker and publishes it.
  - The student dashboard lists the open quiz and exam, and the student never sees the
    question bank or keys.
  - Answers autosave. An answer chosen while offline is kept in `localStorage`, resent
    after reconnect and reload, and confirmed stored on the server.
  - Submitting shows the score, correct/incorrect marks, and the explanation.
  - A timed exam counts down from the server deadline and submits automatically when it
    reaches zero, with results hidden until close.
  - The teacher sees the attempt, adjusts the score, and opens the exam attempt
    read-only. The student sees the adjusted score and that no attempts remain.
  - Phone (390 px) attempt and result pages have no page-level horizontal scroll.
- Desktop and phone screenshots of the question bank, quiz editor, attempt page,
  results, and teacher results table were inspected visually.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost/hsi_learning_os_test bun test`:
  **64 passed, 0 failed, 794 assertions** across Phases 0–3.
- `bun run typecheck`: passed.
- `bun run build`: passed, five production output files.
- `bun run db:migrate`: applied `0004_assessment_engine.sql` to the local application
  database; the file is now immutable.

## Findings resolved

- `Bun.SQL` stored `${JSON.stringify(value)}::jsonb` as a JSON string, which failed
  the array constraints. All JSON parameters now bind as `::text::jsonb`, and a direct
  query confirmed the difference.
- Opening a student's open attempt as a teacher would have shown answer controls. The
  attempt detail now returns `canAnswer`, so the page is read-only unless the viewer
  owns an unsubmitted attempt.
- Browser checks that use `innerText` failed on labels styled with `text-transform`.
  The smoke run reads `textContent` instead.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, and generated credentials were removed after validation.

Phase 3 does not include:

- essay or short-answer questions, manual per-question grading, or rubrics (deferred by
  the question-type scope decision)
- surveys and questionnaires
- partial credit for multiple choice, negative marking, or question weighting beyond
  points
- time extensions, attempt resets, or per-student accommodations
- proctoring, tab-switch detection, or lockdown browsers
- question import/export, question pools with random subsets, or item statistics
- WebSocket live monitoring; autosave uses HTTP

Expired attempts are finalized lazily. Until a student, teacher list, or retry touches
an expired attempt, course progress and the dashboard may still count it as open. The
stored score is unaffected, because finalization always uses the server deadline and
the answers saved before it. The 125-student exam run shared one four-connection pool
locally; production hardware, WLAN latency, and autosave frequency still need load
testing.
