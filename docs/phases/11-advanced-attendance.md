# Phase 11 — Advanced attendance operations

Validated locally on 2026-09-12 with Bun 1.4.2 and PostgreSQL 17. No scoping round was held;
the roadmap names advanced attendance as a post-V1 item, so this phase records the first
operationally useful slice: faster marking and auditable session history.

## Workflow

1. A teacher opens an attendance session.
2. The teacher marks the currently visible, unrecorded roster rows as present with one action.
3. The server validates every roster predecessor and commits the batch atomically.
4. The teacher can review the session's lifecycle history in a paginated table.
5. Students continue to see only their own attendance and cannot read manager history.

## Scope decisions

- **Bulk scope.** The UI submits only currently visible unrecorded rows; the API accepts at
  most 500 rows so a teacher can use search and pagination deliberately for larger rosters.
- **Status.** Bulk marking is intentionally present-only. Exceptions and corrections continue
  through the existing per-santri editor, preserving explicit teacher judgment.
- **History visibility.** Session history is manager-only because it contains staff identity,
  lifecycle reasons, and private operational context.
- **Schema.** No migration is needed: the phase reuses the existing append-only
  `classroom_session_events` and `attendance_records` tables.

## Delivered scope

- **Bulk attendance.** `POST /api/attendance/courses/:courseId/sessions/:sessionId/bulk-attendance`
  accepts 1–500 records, requires an open session, locks the session `FOR UPDATE`, checks
  roster membership and predecessor IDs, and rolls back the complete batch on a stale row.
- **Retry behavior.** A repeated row with the same predecessor, status, and note is skipped;
  successful new rows are appended to the existing correction chain.
- **History.** `GET /api/attendance/courses/:courseId/sessions/:sessionId/history` returns
  manager-scoped lifecycle events in 50-row pages.
- **Audit events:** `classroom.attendance.bulk_recorded` for a batch that writes rows.
- **UI.** Session detail adds a bounded “Penandaan massal” action and a “Riwayat sesi” table,
  both using existing cards, forms, loading/error/empty states, and pagination.

## API additions

Mutations require the same origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/attendance/courses/{courseId}/sessions/{sessionId}/bulk-attendance` | Mark selected unrecorded roster rows present atomically |
| `GET` | `/api/attendance/courses/{courseId}/sessions/{sessionId}/history` | Read manager-only lifecycle history |

## Verified behavior

- Unit tests (`tests/attendance.test.ts`, 6 tests): bulk record bounds, UUID/status/note
  validation, existing attendance validation, lifecycle validation, and QR input rules.
- PostgreSQL integration (`tests/attendance.integration.test.ts`, 9 tests): atomic bulk
  marking, retry safety, audit insertion, manager-only history, 403/404 scope behavior,
  existing attendance locking, lifecycle, rollback, and the existing 125-student realtime
  run.
- Browser smoke against a disposable QA database, driven through headless Chrome: 95 of 95
  checks passed, including the bulk action, manager/student visibility, and no horizontal
  overflow or unexpected alerts at 1440, 820, and 390 px. Desktop and phone screenshots of
  the session detail were inspected.

## Commands and results

- `bun test tests/attendance.test.ts tests/config.test.ts`: 16 passed, 0 failed, 60 assertions.
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test tests/attendance.integration.test.ts`:
  9 passed, 0 failed, 74 assertions.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `bun run db:migrate`: no migration added; existing schema is sufficient.

## Findings resolved

- The initial integration assertion queried a nonexistent `audit_logs.entity_id`; it was
  corrected to the actual actor/event contract.
- The scope assertion initially used a student/outside user without `learning.manage`, which
  correctly returns 403 before scope evaluation; it now uses an out-of-scope teacher to prove
  the required 404 behavior.

## Boundaries

This is local validation, not deployment to the school production environment. The phase does
not add roster editing, bulk import files, recurring meetings, attendance XP, geofencing,
biometrics, or multi-instance realtime delivery. Local load behavior remains bounded by the
existing 500-student session roster and school-hardware/WLAN validation is still open.
