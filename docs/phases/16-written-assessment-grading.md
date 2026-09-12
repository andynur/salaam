# Phase 16 — Written assessment grading

Phase 16 extends the shared Assessment Engine for answers that cannot be scored from an option
key.

## Delivered scope

- Question banks and assessment snapshots support `short_answer` and `essay` alongside the
  existing choice types.
- Written responses use `attempt_answers.answer_text`; choice selections remain in the
  existing bounded JSON array and cannot be mixed with written answers.
- Teachers manually grade each submitted written answer from zero up to that question's point
  value. Corrections append a new grade and require the grade ID the teacher read.
- Attempt totals include manually awarded written points while choice questions retain
  all-or-nothing automatic scoring.
- The student and teacher attempt screens show written answers, current points, and feedback.
- Migration `0014_assessment_written_answers.sql` has a matching down script.

## Boundaries

Rubrics, surveys/questionnaires, partial or negative marking, time accommodations, proctoring,
question import/export, pools/statistics, and live monitoring remain deferred.

## Validation

- Unit and PostgreSQL integration checks pass.
- Browser smoke passed at 1440, 820, and 390 px for student written-answer results and teacher
  manual grading; all screens had no horizontal overflow or unexpected alerts.
