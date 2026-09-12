# Phase 8 — Calendar and notifications validation

Validated locally on 2026-09-12 with Bun 1.4.2 and PostgreSQL 17.9. The product owner
approved the [scope proposal](08-calendar-notifications-proposal.md) before implementation.

## Workflow

1. Administrators open Calendar and create school-wide academic events. Teachers choose
   one of their managed courses when creating a course event.
2. Students open the agenda or a dashboard shortcut to see school events, published
   course events, activity deadlines, assessment windows, and rostered classroom sessions.
3. Event managers open an event to edit or archive it. Edits retain the version originally
   loaded; a conflicting edit asks them to reload. Archiving requires confirmation.
4. Students and staff open Notifications for reminders. Students also receive a level-up
   notification when new XP crosses a threshold and a session link when QR check-in opens.
5. Users mark delivered notifications read and adjust reminder, level-up, and QR
   preferences. A delivery timestamp means delivery to the inbox, not proof of reading.

## Scope decisions

- Delivery is in-app only. Reminder lead time is fixed at 24 hours; UI times are WIB
  (Asia/Jakarta), while API timestamps are canonical UTC ISO strings.
- Agenda ranges and manual event durations are at most 93 days; titles are 150 characters
  and descriptions 2,000 characters. Lists use 50-item pages and literal text search.
- The existing untracked reporting migration had reserved `0009`, so this phase uses
  `0010_calendar_notifications.sql`. Reporting work is separate from this phase.
- A reminder is keyed by recipient, source kind, source ID, and source time. Rescheduling
  creates a new reminder and hides the stale one. Preferences affect future delivery;
  suppressed notifications are not replayed after re-enabling a preference.
- Notifications are resolved against current source access. Archived events, unpublished
  student content, lost enrollment, and closed QR windows cannot disclose old content.
- Only new XP awards generate level notifications. Existing XP is not backfilled. An
  award crossing several thresholds produces one idempotent notification per crossed level.

## Delivered scope

- Migration `0010_calendar_notifications.sql` with a matching down script: `academic_events`,
  `notification_preferences`, `notifications`, and live `calendar_sources`/`calendar_audience`
  views. Source uniqueness, event duration, status/read consistency, and source-kind
  constraints are enforced in PostgreSQL. No new capability or dependency.
- School-event management uses `academic.manage`; course-event management uses
  `learning.manage` and `courseAccess`. Personal endpoints require `dashboard:view`, with
  additional learning capability, publication, enrollment, and roster checks for sources.
- Calendars derive dates from activities, assessment settings, and sessions; none is an
  independently editable duplicate deadline. Cancelled sessions and archived content are
  excluded. Managers can see drafts in their own courses.
- Event creation is idempotent through an actor/request key. Course scope is immutable.
  Updates and archive requests are versioned; exact operation retries return the result.
- **Locking:** course mutation locks first, then event locks; actor/request advisory locks
  serialize school-event creation retries. Per-student XP advisory locks serialize awards
  from different sources. Source notification inserts share the source transaction.
- **Worker:** runs at startup and every 15 seconds in the existing process. Each tick
  generates at most 250 reminders and delivers/suppresses at most 250 pending rows. An
  advisory lock prevents overlapping workers; delivery rows use `FOR UPDATE SKIP LOCKED`.
  Statements have a five-second timeout. Failed ticks roll back and retry later; restart
  recovers pending rows. Expired, completed, cancelled, inaccessible, and opted-out work
  is suppressed or excluded. The database clock decides eligibility.
- **Audit events:** `calendar.event.created`, `calendar.event.updated`,
  `calendar.event.archived`, `notification.preferences.updated`. Source XP and QR audit
  behavior remains in the same transaction; read receipts are personal delivery state.
- **UI:** calendar agenda, academic event detail/editor, archive confirmation, personal
  inbox with unread filter and delivery status, preference form, navigation and dashboard
  shortcuts. Existing loading, empty, error/retry, pending, and form primitives are reused.
- **Annual academic calendar:** migration `0027_academic_calendar.sql` adds scoped date-range
  events for one academic year. The Calendar screen now separates the live learning agenda
  from a 12-month academic view with semester grouping, event tooltips, and administrator
  filters for academic year and class. Demo seeding includes the 2026/2027 sample schedule.

## API additions

Mutations require the application Origin. Out-of-scope sources return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/calendar?from=…&to=…&q=…&offset=…` | Scoped live agenda; exclusive upper date bound |
| GET | `/api/calendar/academic?yearId=…&classId=…` | Scoped annual academic calendar and admin filter options |
| GET | `/api/calendar/events/:id` | Current academic event detail |
| POST | `/api/calendar/events` | Create event with `requestKey` |
| PATCH | `/api/calendar/events/:id` | Versioned edit, or `action: "archive"` |
| GET | `/api/notifications?unread=true&offset=…` | Personal inbox; default also shows pending/suppressed state |
| POST | `/api/notifications/:id/read` | Idempotent read receipt for a visible delivered notification |
| GET | `/api/notifications/preferences` | Personal preferences, defaulting to enabled |
| PATCH | `/api/notifications/preferences` | Save `reminders`, `levelUp`, and `checkin` booleans |

## Verified behavior

- Phase 8 unit and PostgreSQL integration: **17 passed, 0 failed, 472 assertions**
  (4 unit and 13 integration tests).
- Covers validation, 403/404 isolation and capability revocation, same-origin protection,
  the full publication cascade, source rescheduling, assessment opening/closing, completed
  attempts, preferences, concurrent worker ticks, expired pending recovery, stale edits,
  retry keys, constraints, pagination, literal search, read receipts, and audit rollback.
- XP crossing from concurrent source awards produces one threshold notification. QR
  opening retries produce one notification per roster member; a failed source transaction
  leaves neither a window nor its notifications. No check-in code is carried in a notice.
- **Load:** 125 students concurrently fetch their own inbox and each send two identical
  read receipts. All 125 receive distinct recipient-owned notifications and identical
  repeat receipt timestamps. This is a local correctness test, not a school WLAN benchmark.
- Real-browser smoke tests against a prebuilt bundle and disposable QA database:
  **73 of 73 checks passed**. Admin event creation, validation recovery, editing, keyboard
  activation and archive/cancel; teacher course event creation; student agenda and source
  visibility, inbox kinds, read receipts, saved preferences and empty search; dashboard links.
- Layout and alert checks pass for admin agenda/detail/editor, teacher and student agendas,
  all three roles’ inboxes, and preferences at 1440, 820 and 390 px. Desktop, tablet and phone screenshots were inspected,
  including the event editor and phone preference form. No document-level horizontal scroll.
- QA databases, server/Chrome processes, browser profiles, storage and generated credentials
  were removed after the run.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test tests/calendar.test.ts tests/calendar.integration.test.ts`:
  17 passed, 0 failed, 472 assertions.
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  162 passed, 0 failed, 2,160 assertions across 24 files in the worktree at validation.
  The worktree also contains concurrent reporting changes; these totals are not a claim
  that Phase 9 is delivered by this record.
- `bun test` without a test database: 75 passed, 107 skipped, 0 failed, 706 assertions.
  These are the counts reported by Bun in the respective test modes.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `DATABASE_URL=postgres://localhost:5432/salaam bun run db:migrate`: applied the already
  pending `0009_reporting.sql` and `0010_calendar_notifications.sql` to the local application
  database. A second run reported “Database is up to date.” Applied files are now immutable.

## Findings resolved

- Browser form payloads now convert WIB input to canonical UTC before submission, matching
  the existing timestamp validator.
- Course search is outside the event mutation form, avoiding nested HTML forms. Changing
  course-search pages clears the selected scope rather than submitting an invisible choice.
- Source deduplication uses epoch-based time keys plus a source/time unique index, avoiding
  dependence on a database connection's display timezone.
- API date fields are formatted as ISO UTC, so clients never depend on PostgreSQL display
  formats or fractional-second parsing differences.
- The sidebar hides its future group once no unavailable pages remain.
- Level-up notices are enqueued inside the transaction that awards XP, and the `level`
  column only accepts 2–12. Extending `levelThresholds` — which the gamification design
  says may change without a backfill — would have turned a level-up into a failed grade or
  lesson completion. `enqueueLevel` now skips levels outside the stored range, and
  `tests/calendar.test.ts` asserts `maxLevel <= maxNotifiableLevel` so the mismatch is
  caught before it ships instead of silently dropping notices.

## Post-delivery verification

Phase 9 shared the same working tree. With both phases in place, the combined application
was re-checked in headless Chrome on 2026-09-12: **73 of 73 checks passed** across
administrator, teacher, and santri at 1440, 820, and 390 px, including creating an academic
event through the UI, the calendar and inbox for every role, and every report tab. Reminder
generation and delivery were confirmed end to end against the QA database: deadline and
session reminders reached exactly the users who still had work to do, and the santri who had
already submitted received none.

## Boundaries

This is local validation, not a school production deployment. No external delivery provider,
email, WhatsApp, web push, calendar synchronization, recurring events, custom reminder lead
times, attachments, or reporting is included in this phase.

A stopped server cannot deliver in-app notices. On restart, pending rows are retried and
expired reminders are suppressed; agenda sources already past the reminder deadline are
not backfilled. Large backlogs may span multiple 15-second ticks. Keep the existing
single-instance operational model and measure capacity on school hardware before rollout.
