# Phase 8 — Calendar and notifications proposal

Status: approved by the product owner on 2026-09-12; implemented and locally validated; see [delivery record](08-calendar-notifications.md).

## User workflows

- All authenticated users can browse an agenda by date range, open its source, read
  their own notification inbox, mark notifications read, and change preferences.
- Academic administrators can create, edit, and archive school-wide academic events.
- Teachers can manage academic events for courses they manage. Students see events
  only for published courses in which they are enrolled.
- The agenda also includes visible activity deadlines, assessment windows, and
  classroom sessions. These are queried from their source records, not copied into
  editable calendar entries.

## Data and permissions

- Add `academic_events` for manually authored events: optional course reference,
  title, description, start/end timestamps, author, version, creation key, and archive
  timestamp. School-wide management uses `academic.manage`; course management uses
  `learning.manage` and `courseAccess`.
- Add per-user `notification_preferences` for reminders, level-up notifications, and
  QR-window notifications. Delivery is in-app only in this phase.
- Add `notifications` with recipient, kind, source reference, deduplication key,
  scheduled/delivered/read timestamps, and delivery status. Source-derived titles,
  dates, and links are resolved with current access checks rather than trusted as
  permanently visible snapshots.
- Reuse `dashboard:view` for personal inbox/preferences and the school agenda;
  course sources additionally require existing learning capabilities and scope.
- Existing untracked reporting files are outside this phase. The calendar migration
  uses the next free migration number without modifying those files.

## Rules and delivery

- Date-range queries are bounded to 93 days, with 50-item pagination. All instants
  are stored as `timestamptz`; the UI displays school time in Asia/Jakarta.
- Event creation retries use a client-generated key. Updates and archiving use a
  version check; stale changes return 409. Course mutations lock the course first.
- In-app reminders use a fixed 24-hour lead time for upcoming events, activity
  deadlines, assessment closing times, and classroom starts. Completed student work
  and cancelled or inaccessible sources are excluded where applicable.
- A bounded periodic worker in the existing Bun process generates/delivers reminders.
  PostgreSQL uniqueness and transactional claims prevent duplicate delivery on retries
  or concurrent runs. Restart recovery rechecks upcoming sources; expired reminders
  are suppressed rather than delivered late.
- Level-up and QR-window notifications originate in the existing source transaction.
  QR notifications contain a link to the session, never a check-in code. A retried
  source mutation does not create another notification.
- Delivery status distinguishes pending, delivered to the in-app inbox, and suppressed.
  Delivered does not claim that a user has seen it; read time is tracked separately.
- Preferences affect future delivery. Every inbox read rechecks source visibility;
  withdrawal of course access cannot expose old course information.
- Audit event creation, updates, archiving, and preference changes in the mutation
  transaction. Notification creation is atomic with its triggering domain mutation.

## Screens and verification

- Responsive agenda with range filters, source links, and event management controls.
- Personal inbox with unread state, pagination, mark-read actions, and preferences.
- Navigation and dashboard shortcuts reuse the current UI kit.
- Unit and HTTP/PostgreSQL tests cover validation, access isolation, stale edits,
  retries, worker concurrency/recovery, preferences, source changes, audit rollback,
  and concurrent student inbox traffic.
- Complete typecheck, full database suite, no-database suite, production build, local
  migration, and browser QA at 1440, 820, and 390 px before recording delivery.

## Boundaries

Email, WhatsApp, push providers, external calendar sync, recurring events, custom
reminder offsets, notification attachments, and reporting are outside Phase 8.
No additional dependency or runtime service is proposed.
