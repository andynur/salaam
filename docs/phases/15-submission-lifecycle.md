# Phase 15 — Submission lifecycle

Phase 15 adds the first operational revision workflow for assignment submissions while
preserving immutable history and the existing Activity Engine contract.

## Delivered scope

- A teacher can return a submitted assignment with a required reason. The return is audited
  and idempotent.
- A student can submit a new revision after a return. The current submission row is updated
  only as the current pointer; revision number, return reason, and grade history remain
  inspectable.
- Grades are scoped to the current revision, so an old grade cannot appear as the grade for a
  newly returned revision.
- A teacher can grant or replace one student-specific deadline exception per assignment.
  The effective deadline is checked using the database clock.
- Migration `0013_submission_lifecycle.sql` has a matching down script.

## Boundaries

Bulk content reordering, material moves, malware scanning, inline previews, and rich text or
Markdown remain deferred. Deadline exceptions are manager-only and do not alter the activity's
published deadline for other students.

## Validation

- PostgreSQL integration covers return idempotency, revision history, current-revision grades,
  deadline exceptions, and the existing concurrent submission contract.
- Unit validation covers bounded return and deadline-exception input.
- `bun run typecheck` and `bun run build` pass.

Browser smoke for the revised learning workspace remains the final close-out check for this
phase.
