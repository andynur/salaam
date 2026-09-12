# Phase 13 — Academic operations

Phase 13 delivers the first deferred workflows that are safe for the single-server pilot:
administrator-controlled student import and bounded recurring classroom sessions.

## Scope decisions

- CSV import is administrator-only, previews every row on the server, accepts at most 500 rows,
  and commits all valid rows in one transaction.
- Import requires `nama,email,identifier,password`; existing matching student accounts are reused
  and enrollment is idempotent. Attendance history is never changed.
- A recurring template creates 1–52 real sessions immediately, each with its own roster snapshot.
- Recurrence uses UTC timestamps supplied by the browser after local-time conversion. Each series
  is idempotent by creator and request key.
- A generated session opens its configured QR window when the teacher opens the session.

## Delivered

- `POST /api/admin/imports/students` with `preview` and atomic `commit` modes.
- `/admin/import` screen with CSV input, server validation results, and save action.
- `POST /api/attendance/courses/:courseId/sessions/series` for bounded recurrence.
- Recurring meeting form with interval, occurrence count, QR rotation, and late threshold.
- Migration `0011_roster_meeting_series.sql` with a matching down script.

## Rules and limits

The import is limited to 500 rows per request. Recurrence is limited to 52 occurrences and 365
days between sessions. A generated session retains the existing session lifecycle, roster snapshot,
append-only attendance chain, course scope checks, idempotency, and audit events.

## Out of scope

Attendance XP and reversal policy, external notification providers, calendar synchronization,
online-code execution, multi-instance realtime, roster editing after a session is created, and
hard deletion remain deferred.

## Validation

Unit validation covers recurrence bounds and QR defaults. PostgreSQL integration coverage covers
atomic import preview/commit, idempotent retries, recurrence materialization, roster snapshots,
and automatic QR configuration. School hardware/WLAN validation remains an environment task.
