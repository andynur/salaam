# Phase 18 — Surveys and questionnaires

## Delivered behavior

SALAAM can create survey and questionnaire activities in a lesson. Teachers define a
title, instructions, and an initial short-answer question, then publish the activity
through the existing Activity Engine. Publication follows the existing course, module,
and lesson cascade.

Students can answer required or optional short-answer, single-choice, and multiple-choice
questions. The server validates question IDs, option IDs, required answers, and answer
lengths. Each student has one immutable response; retrying the same request is idempotent,
while a different second response returns a conflict. Responses are audited and count as
submitted activity progress, but do not count as graded work.

## Verification

Migration `0016_survey_questionnaires.sql` has a reversible down script. Unit validation,
typecheck, production build, and PostgreSQL integration suites are required before the
phase is marked delivered.

## Out of scope

Anonymous responses, response editing, analytics dashboards, exports, branching logic,
question banks, file uploads, and external survey providers remain deferred.
