# Phase 28 — Attendance roster adjustments

## Scope decisions

- Teachers with `learning.manage` can add, remove, and restore enrolled active students
  after a session is created while it is scheduled or open.
- A recurring-session change can target the selected session and future scheduled/open
  occurrences in the same series; closed and cancelled sessions are never rewritten.
- Roster rows are soft-removed so attendance records and their correction chains remain
  valid and auditable.

## Delivered

- `GET /api/attendance/courses/:courseId/sessions/:sessionId/roster-options` lists active
  enrolled students not currently in the session roster.
- `PATCH /api/attendance/courses/:courseId/sessions/:sessionId/roster` applies a version-
  checked session or future-series adjustment, updates the manager UI, increments affected
  session versions, and emits `roster` session events plus an audit record.
- Student visibility and QR check-in now require an active roster row; reports, close-session
  validation, counts, and bulk/manual marking use the active roster only.

## Validation

- Input unit tests cover version, student, status, and scope bounds.
- PostgreSQL integration covers soft removal/restoration, series propagation, stale versions,
  access control, event history, and the roster foreign-key history invariant.
- Typecheck and the attendance integration suite pass.

## Boundaries

- Roster changes are limited to students actively enrolled in the course class.
- Closed/cancelled sessions and past series occurrences require a separate correction policy.
- No automated enrollment synchronization, bulk CSV roster adjustment, or geofencing is added.
