# Phase 17 — Assessment rubrics

Phase 17 adds bounded, reusable criteria to written assessment questions.

## Delivered scope

- Teachers can create or update a rubric for a short-answer or essay question before the first
  attempt. The criteria total cannot exceed the question's points.
- Each criterion has a stable ID, label, description, and maximum points. Duplicate IDs and
  malformed or oversized criteria are rejected.
- Manual written grading accepts one score per criterion, requires the breakdown to cover the
  rubric exactly, and verifies its sum against the final score.
- Attempt details show the rubric and the latest breakdown; prior manual grade rows remain
  append-only and stale corrections return 409.
- Migration `0015_assessment_rubrics.sql` has a matching down script.

## Boundaries

Surveys/questionnaires, partial or negative marking outside rubric scoring, time accommodations,
proctoring, question import/export, pools/statistics, and live monitoring remain deferred.

## Validation

- Unit, PostgreSQL integration, migration rollback, typecheck, and build checks pass.
- Browser smoke passed at 1440, 820, and 390 px for rubric authoring; no horizontal overflow or
  unexpected alerts appeared.
