# Roadmap

SALAAM ships in independently testable and reviewable phases. Validate a phase before
expanding scope. Every phase delivers focused behavior tests, a passing typecheck and build,
updated documentation, a record in [`phases/`](phases/), and an explicit out-of-scope list.
Coding agents follow skill `deliver-phase`.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Repository and identity foundation | Delivered — [record](phases/00-foundation.md) |
| 1 | Core identity and academic foundation | Delivered — [record](phases/01-identity-academic.md) |
| 2 | Learning core | Delivered — [record](phases/02-learning-core.md) |
| 3 | Assessment engine | Delivered for choice questions — [record](phases/03-assessment-engine.md) |
| 4 | Project learning | Delivered — [record](phases/04-project-learning.md) |
| 5 | Gamification | Delivered — [record](phases/05-gamification.md) |
| 6 | Attendance and classroom sessions | Delivered — [record](phases/06-attendance.md) |
| 7 | QR attendance | Delivered — [record](phases/07-qr-attendance.md) |
| 8 | Calendar and notifications | Next |
| 9 | Reporting | Planned |
| 10 | Advanced IT learning | Planned |
| 11+ | Later evaluation | Backlog |

## Delivered

### Phase 0 — Repository and identity foundation

Bun, TypeScript, and PostgreSQL repository, migration runner, secure sessions,
authentication, role and permission checks, health endpoints, a web shell, and baseline
tests.

### Phase 1 — Core identity and academic foundation

Role-linked profiles, first-admin bootstrap, academic years, terms, classes, student
enrollment, subjects, courses, teacher assignments, audit records, and the responsive
administration UI.

### Phase 2 — Learning core

Course modules, lessons, materials, publishing, archiving, assignments, submissions,
grading, and student progress on the shared Activity Engine.

### Phase 3 — Assessment engine

Question banks, quizzes and exams, attempts, timers, randomization, autosave, reconnect
recovery, automatic scoring, and idempotent final submission. Delivered for single-choice,
multiple-choice, and true/false questions; the product owner deferred essays, rubrics, and
surveys.

### Phase 4 — Project learning

Challenges, projects, teams, Kanban boards, reviews, showcases, and portfolio entries.

### Phase 5 — Gamification

An append-only XP ledger, derived levels, a badge catalogue with automatic awards, and
administrator-configurable reward rules. XP is awarded in the same transaction as the event
that earns it: lesson completion (the Phase 2 hook), assignment grading, a finished quiz or
exam, and an approved project (the Phase 4 hook).

### Phase 6 — Attendance and classroom sessions

Course meeting sessions with snapshotted rosters, manual attendance and private notes,
append-only corrections, session lifecycle controls, course/personal reports, dashboard
shortcuts, and authenticated realtime status. Attendance always references a defined session.

### Phase 7 — QR attendance

Per-session check-in windows with rotating short-lived codes, stored only as SHA-256
digests. A santri scans the QR with the device camera or types the code; the server
validates the code, the roster, the session, and the window, then writes the first
attendance record for that santri. Codes are proofs of presence, never authentication
credentials, and a teacher's correction always wins.

## Planned

### Phase 8 — Calendar and notifications

Academic events, deadlines, reminders, notification preferences, and delivery status.
Calendar entries reference their source entity instead of duplicating deadlines.

### Phase 9 — Reporting

Operational dashboards, attendance summaries, learning progress reports, exports, and
audit-friendly administrative views.

### Phase 10 — Advanced IT learning

Isolated coding challenges, only once a separate execution boundary, resource limits, a
network policy, and a review process exist. The application never runs untrusted student
code directly.

### Phase 11 and later

Local-server migration, advanced attendance improvements, and other
[post-V1 items](product.md#after-v1), only with a measured operational need and an approved
privacy and security review.

## Deferred from delivered phases

Items explicitly left out so far. Consider them when scoping later phases; each record's
Boundaries section has the details.

- **Phase 1:** profile editing, role reassignment, account recovery, class transfers, and
  academic archive states.
- **Phase 2:** hard deletion and bulk reordering; moving materials between lessons;
  resubmission, returned work, late exceptions, and deadline extensions; malware scanning
  and inline previews; rich text or Markdown.
- **Phase 3:** essay and short-answer questions, manual grading, and rubrics; surveys and
  questionnaires; partial credit and negative marking; time extensions and accommodations;
  proctoring; question import, export, pools, and statistics; live monitoring over
  WebSocket.
- **Phase 4:** student-formed teams; custom columns, labels, due dates, comments, and
  attachments on cards; realtime board sync; file deliverables; rubrics, peer review, and
  multiple reviewers; portfolio browsing, public pages, and export; project templates.
- **Phase 5:** XP decay, penalties, and manual XP grants; streaks, seasons, and resets;
  leaderboards visible to students; badge artwork beyond the built-in icons; level-up
  notifications (Phase 8); XP for attendance (deferred pending a correction/reversal policy).
- **Phase 6:** attendance XP; recurring meetings, bulk marking/import, roster adjustments
  after creation, history browsing, exports, and cross-course reports; multi-instance
  realtime delivery.
- **Phase 7:** attendance XP (still deferred); geofencing, device binding, proctoring, and
  biometric identification; recurring check-in windows and bulk check-in import;
  notifications when a window opens (Phase 8); cross-course QR reporting and exports
  (Phase 9).
- **Operations:** HTTPS proxy validation, backup and restore drills, and load testing on
  school hardware.
