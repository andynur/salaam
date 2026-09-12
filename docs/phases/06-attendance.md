# Phase 6 — Attendance and classroom sessions validation

Validated locally on 2026-09-12 with Bun 1.4.2 and PostgreSQL 17.9. The product owner
approved the proposed scope with “iya lanjut kerjakan”, including deferring attendance XP.

## Workflow

1. A teacher opens **Kehadiran**, chooses an assigned course, and creates a meeting with a
   title, start/end time, and optional private note. The active enrollment roster is saved.
2. The teacher opens the session and records Hadir, Terlambat, Izin, Sakit, or Alpa for
   each santri, optionally adding a private attendance note.
3. Santri open their own session view. Attendance and session status refresh through
   authenticated WebSocket invalidations; classmates and private notes stay hidden.
4. The teacher closes the session after every roster entry is marked. Corrections require
   reopening with a reason, and previous attendance revisions remain stored.
5. Managers and santri review course or personal attendance reports. Scheduled/open sessions
   may be cancelled with a reason; cancelled meetings do not affect reports.

## Scope decisions

- **Attendance XP is deferred.** No rewards are emitted. A future reward design must handle
  corrections without leaving incorrect awards in the append-only XP ledger.
- **Roster snapshots.** Creation stores up to 500 active enrolled students and their names
  and identifiers. Later enrollment/profile changes do not rewrite the meeting. Students
  still require current published-course access and an entry in the original roster.
- **Private notes.** Both session and per-student notes, and lifecycle reasons, are for
  course managers. Students receive only their own status, timestamp, and personal counts.
- **History.** `classroom_session_events` complements append-only attendance revisions so
  lifecycle reasons and note changes remain recorded. Browsing old revisions is deferred.
- **Classroom status.** Scheduled/open/closed/cancelled is an explicitly managed meeting
  state. A connected browser is not evidence that a santri physically attended.

## Delivered scope

- Migration `0007_attendance.sql` with a matching down script creates `classroom_sessions`,
  `classroom_roster`, `attendance_records`, and `classroom_session_events`. Existing
  `learning.view`, `learning.manage`, and `learning.manage.all` capabilities are reused.
- **Lifecycle:** nonempty scheduled sessions can open; all entries must be recorded before
  closing; reopening and cancellation require reasons. Cancelled sessions are terminal.
- **Limits:** 150-character titles, 2,000-character notes, 500-character reasons, 24-hour
  maximum duration, 500 students, 16 KiB JSON requests, and 50-row pagination.
- **Reports:** cancelled sessions are excluded; present plus late over closed sessions is
  the attendance percentage. Status/unrecorded counts include noncancelled sessions.
- **Locking and retries:** course lock first, then session lock; writes and audit share one
  transaction. Creation compares the original payload under a unique creator/request key.
  Attendance uses unique predecessor chains and exact-retry detection. Session versions
  prevent stale transitions/notes, and every attendance change advances that version.
- **Audit events:** `classroom.session.created`, `.opened`, `.closed`, `.reopened`,
  `.cancelled`, `.note_updated`, and `classroom.attendance.recorded`. Audit rows identify
  the affected resource without duplicating private note text.
- **Realtime:** native Bun WebSocket, exact Origin and session/course authorization,
  authorization before every invalidation and every ten seconds, 512 connections per
  process/four per account, 256-byte input and 4 KiB backpressure limits. Clients refetch
  scoped HTTP state on reconnect. Incoming application messages close the read-only socket.
- **UI:** attendance course hub, session creation/list, manager roster and lifecycle
  controls, session and attendance note editors, personal attendance/history, and reports.
  Dashboard tasks link managers to open sessions and students to upcoming/current meetings.
  Existing layout/form/table components are reused; no dependency was added.

## API additions

All paths below are under `/api/attendance`. Mutations require the application Origin.
Missing capabilities return 403; resources outside course/session scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/courses/:courseId/sessions?q=&offset=` | Scoped session list |
| `POST` | `/courses/:courseId/sessions` | Create meeting and roster with request key |
| `GET` | `/courses/:courseId/sessions/:sessionId?q=&offset=` | Session, scoped counts, paginated roster |
| `PATCH` | `/courses/:courseId/sessions/:sessionId` | Open/close/reopen/cancel or edit note with version |
| `PATCH` | `/courses/:courseId/sessions/:sessionId/attendance/:studentId` | Append attendance revision with previous ID |
| `GET` | `/courses/:courseId/report?q=&offset=` | Manager or personal report |
| `GET` (upgrade) | `/live?courseId=&sessionId=` | Authorized session invalidations |

Creation accepts `title`, UTC `startsAt`/`endsAt`, `note`, and UUID `requestKey`. Attendance
accepts `status`, `note`, and an explicit `previousId` (null for the first record). Session
operations accept `action`, `version`, and the relevant `reason` or `note`.

## Verified behavior

- Three unit tests cover timestamp/duration/title/note limits, known attendance statuses,
  explicit predecessor validation, bounded versions, and mandatory correction reasons.
- Eight PostgreSQL integration tests cover roster snapshots, personal-data privacy,
  scope/permissions/origin, lifecycle, exact retries, stale and concurrent writes, private
  notes, correction history, reports, no attendance XP, empty sessions, cancellation,
  constraints, audit rollback, 500-student limits, pagination, and enrollment changes.
- Real WebSocket tests cover cross-origin/anonymous/out-of-scope denial, per-account
  limits, initial/change notifications, reconnect, course unpublishing, token revocation,
  and unexpected client messages. A 125-student run opens real sockets, reads personal
  rosters concurrently, and receives invalidations within a 15-second assertion bound;
  subsequent revocation is observed within the periodic authorization interval.
- Browser smoke uses the prebuilt bundle, a disposable QA database, and headless Chrome
  through CDP. Each role drives its own browser context, so the teacher and santri sessions
  are genuinely separate rather than sharing one cookie jar. Manager/student states are
  checked at 1440, 820, and 390 px for page overflow and unexpected alerts, with
  desktop/phone screenshots inspected. Flows include create/open/record/close/reopen/
  correct/cancel, student privacy/live updates/reports, administrator scope, and
  stale-note recovery.

## Commands and results

- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- Touched unit/integration/database tests: **16 passed, 0 failed, 125 assertions**.
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  **114 passed, 0 failed, 1,223 assertions**, 18 files.
- `env -u TEST_DATABASE_URL bun test`: **57 passed, 71 skipped, 0 failed**, 376 assertions.
  Database suites are explicitly skipped in this run; the full run above uses PostgreSQL.
- Browser QA: **66 of 66 checks passed** against a disposable `salaam_qa_p6` database.
  Covered the manager lifecycle (create, open, record, close, reopen, correct, cancel),
  append-only corrections reaching the report, santri privacy (classmates, private notes
  and lifecycle reasons all hidden), realtime refresh of a santri's own status, manager and
  personal reports, administrator scope, stale-note conflict and retry, editor focus
  handling, and the three viewport widths on every screen.
- Local migration: the `salaam` database was absent. Created it without seed/school data,
  then ran `bun run db:migrate` with explicit local `DATABASE_URL`, `APP_BASE_URL`, and
  `STORAGE_ROOT`: migrations 0001–0007 applied. A second run reported “Database is up to
  date.” Migration 0007 is now immutable.

## Findings resolved

- Live refresh originally allowed a note editor to use a newer version with older input.
  Editors now retain their opening version/predecessor, and conflict responses preserve
  input. Browser QA exercises this with a concurrent note change and a successful retry.
- Reused cards needed the existing `.lesson-card` padding and `.lesson-workspace` spacing.
  Desktop and phone screenshots were inspected after that adjustment.
- Keyboard QA needed a complete CDP Enter event including its character text. Attendance
  editors now focus their status field when opened and return focus to the row on exit.
- Initial migration failed because the expected local application database did not exist;
  it was created and all migrations were applied successfully.

## Boundaries

This is local validation, not a production deployment. Attendance XP, QR/camera check-in
(Phase 7), calendar/notifications (Phase 8), cross-course reports/exports (Phase 9), recurring
meetings, bulk attendance/import, roster changes after creation, revision-history browsing,
and biometric identification remain outside this phase. The QA databases, Chrome profiles,
private storage, generated credentials, and temporary script are removed after validation.

Realtime invalidation is process-local and supports one application instance. The local
125-student exercise does not validate school hardware, WLAN, HTTPS proxy behavior, backup
restore, or production resource budgets. Database administrators can still modify stored
history directly; append-only behavior is enforced by the application and chain constraints.
