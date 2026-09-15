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
| 2 extension | Course certification | Delivered — [record](phases/course-certification.md) |
| 3 | Assessment engine | Delivered for choice questions — [record](phases/03-assessment-engine.md) |
| 4 | Project learning | Delivered — [record](phases/04-project-learning.md) |
| 5 | Gamification | Delivered — [record](phases/05-gamification.md) |
| 6 | Attendance and classroom sessions | Delivered — [record](phases/06-attendance.md) |
| 7 | QR attendance | Delivered — [record](phases/07-qr-attendance.md) |
| 8 | Calendar and notifications | Delivered — [record](phases/08-calendar-notifications.md) |
| 9 | Reporting | Delivered — [record](phases/09-reporting.md) |
| 10 | Advanced IT learning boundary | Delivered — [record](phases/10-advanced-it-learning.md) |
| 11 | Advanced attendance operations | Delivered — [record](phases/11-advanced-attendance.md) |
| 12 | Pilot readiness and operational hardening | In progress — [record](phases/12-pilot-readiness.md) |
| 13 | Academic operations | Delivered — [record](phases/13-academic-operations.md) |
| 14 | Academic lifecycle | Delivered — [record](phases/14-academic-lifecycle.md) |
| 15 | Submission lifecycle | Delivered — [record](phases/15-submission-lifecycle.md) |
| 16 | Written assessment grading | Delivered — [record](phases/16-written-assessment-grading.md) |
| 17 | Assessment rubrics | Delivered — [record](phases/17-assessment-rubrics.md) |
| 18 | Surveys and questionnaires | Delivered — [record](phases/18-surveys-questionnaires.md) |
| 19 | Assessment marking | Delivered — [record](phases/19-assessment-marking.md) |
| 20 | Assessment accommodations | Delivered — [record](phases/20-assessment-accommodations.md) |
| 21 | Question bank import and export | Delivered — [record](phases/21-question-import-export.md) |
| 22 | Assessment question pools | Delivered — [record](phases/22-assessment-question-pools.md) |
| 23 | Question statistics | Delivered — [record](phases/23-question-statistics.md) |
| 24 | Project task metadata | Delivered — [record](phases/24-project-task-metadata.md) |
| 25 | Project task comments | Delivered — [record](phases/25-project-task-comments.md) |
| 26 | Project file deliverables | Delivered — [record](phases/26-project-file-deliverables.md) |
| 27 | Reporting trends | Delivered — [record](phases/27-report-trends.md) |
| 28 | Attendance roster adjustments | Delivered — [record](phases/28-attendance-roster-adjustments.md) |
| 29 | QR attendance breakdown | Delivered — [record](phases/29-qr-attendance-breakdown.md) |
| 30 | QR check-in import | Delivered — [record](phases/30-qr-checkin-import.md) |
| 31 | Lesson documents | Delivered — [record](phases/31-lesson-documents.md) |
| 31 | Student-visible leaderboard | Delivered — [record](phases/31-student-leaderboard.md) |
| 32 | Club management | Delivered — [record](phases/32-club-management.md) |
| 34 | Curriculum map | Delivered — [record](phases/34-curriculum-map.md) |
| 36 | Navigation, account page, and administration layout | Delivered — [record](phases/36-navigation-account.md) |
| 37 | Attendance agenda | Delivered — [record](phases/37-attendance-agenda.md) |
| 38 | Role-specific dashboard | Delivered — [record](phases/38-role-specific-dashboard.md) |

## Delivered

### Phase 0 — Repository and identity foundation

Bun, TypeScript, and PostgreSQL repository, migration runner, secure sessions,
authentication, role and permission checks, health endpoints, a web shell, and baseline
tests.

### Phase 1 — Core identity and academic foundation

Role-linked profiles, first-admin bootstrap, academic years, terms, classes, student
enrollment, subjects, courses, teacher assignments, audit records, administrator-driven
account recovery, and the responsive administration UI.

### Phase 2 — Learning core

Course modules, lessons, materials, publishing, archiving, assignments, submissions,
grading, and student progress on the shared Activity Engine.

### Phase 3 — Assessment engine

Question banks, quizzes and exams, attempts, timers, randomization, autosave, reconnect
recovery, automatic scoring, idempotent final submission, and written-answer manual grading
(Phase 16). Rubrics (Phase 17), surveys/questionnaires (Phase 18), and assessment marking
(Phase 19) extend the engine.

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

### Phase 8 — Calendar and notifications

Scoped academic events and a live agenda of activity deadlines, assessment windows, and
classroom sessions; in-app reminders, level-up and QR-opening notifications, personal
preferences, delivery status and read receipts. A bounded PostgreSQL-backed worker runs
inside Bun. Calendar entries reference their sources rather than duplicate deadlines.

### Phase 9 — Reporting

Cross-course operational reporting for administrators and teachers behind the new
`reports.view` capability: an operational overview, per-course rows, per-santri attendance
and learning-progress summaries, a filtered audit view, and a CSV export of each. Reporting
only reads; every figure is derived in one read-only transaction from the rows the earlier
phases already own.

### Phase 10 — Advanced IT learning boundary

An isolated coding execution contract, fail-closed runner configuration, bounded source and
result handling, an explicit no-network policy, and an operational review gate. The
application never runs untrusted student code directly.

### Phase 11 — Advanced attendance operations

Bulk marking for open sessions and manager-only, paginated session history. Both operations
reuse the existing roster snapshot, append-only attendance chain, lifecycle events, and
course authorization rules.

### Phase 13 — Academic operations

Administrator-only student import with preview and atomic writes, plus recurring meeting
series generation with bounded QR attendance windows.

### Phase 14 — Academic lifecycle

Administrator profile editing with safe role and last-admin guards, reversible academic-year,
term, and class archiving, and auditable student class transfers.

### Phase 15 — Submission lifecycle

Assignment submissions can be returned with a reason, resubmitted as numbered revisions, and
graded against the current revision. Teachers can grant student-specific deadline exceptions;
all actions preserve history and are audited.

### Phase 16 — Written assessment grading

Quiz and exam question banks accept short-answer and essay questions. Answers are autosaved
separately from choice selections, and teachers manually grade each written answer with
append-only corrections.

### Phase 17 — Assessment rubrics

Written assessment questions can carry bounded criteria. Teachers grade each criterion and the
system stores the breakdown with the append-only manual grade history.

### Phase 38 — Role-specific dashboard

The shared dashboard becomes a focused workspace for administrators, teachers, Asisten
Mentor, and students. Each role gets relevant KPIs, priority language, empty states, and
capability-filtered quick actions while reusing the existing scoped dashboard data.

## Planned

### Phase 12 and later

Local-server migration and other [post-V1 items](product.md#after-v1), only with a measured
operational need and an approved privacy and security review.

## Deferred from delivered phases

Items explicitly left out so far. Consider them when scoping later phases; each record's
Boundaries section has the details.

- **Phase 1:** Account recovery is delivered: an administrator resets a password and every
  session of that account ends with it. Profile editing, role reassignment, class transfers,
  and academic archive states are delivered in Phase 14.
- **Phase 2:** hard deletion and bulk reordering; moving materials between lessons; malware
  scanning and inline previews. Markdown documents, cover images, autosave, and public
  lesson pages are delivered in Phase 31; collaborative editing, revision history, document
  comments, and document export remain deferred.
- **Phase 3:** proctoring; live monitoring over
  WebSocket.
- **Phase 4:** student-formed teams; custom columns and attachments on cards; realtime board
  sync; rubrics, peer review, and
  multiple reviewers; portfolio browsing, public pages, and export; project templates.
- **Phase 5–7:** XP for attendance (deferred pending a correction/reversal policy); XP decay,
  penalties, and manual grants; streaks, seasons, and resets;
  badge artwork beyond built-in icons; recurring check-in windows; geofencing, device binding, proctoring,
  and biometric identification. Multi-instance realtime delivery remains unsupported.
- **Phase 6:** bulk import and recurring meetings are delivered in Phase 13. Roster adjustments
  after session creation are delivered in Phase 28. Exports and cross-course reports are
  delivered in Phase 9.
- **Phase 7:** the QR-specific breakdown is delivered in Phase 29 and verified offline scan
  import in Phase 30. Cross-course attendance reporting and exports are delivered in Phase 9.
- **Phase 8:** external delivery providers, calendar sync, recurring events, custom reminder
  lead times, notification attachments, and scheduled report delivery.
- **Phase 9:** scheduled, emailed, or subscribed reports (delivery belongs to Phase 8); PDF
  and spreadsheet exports; per-activity, per-question, and cohort
  analytics; saved report definitions and custom columns; an audit retention policy and
  exports beyond 5,000 rows.
- **Operations:** school hardware/WLAN load testing, scheduled backup execution and alerting,
  and repeatable restore drills. Local HTTPS proxy behavior and one backup/restore drill passed
  on 2026-09-12; [operations](operations.md) records the limits of that validation.

### Phase 32 — Club management

A `Club` directory and workspace that orchestrate delivered modules for the school's three
clubs — Coders Club, Builders Club, and Multimedia Club: a club profile, goals, membership
over existing accounts, and linked courses, with tabs that read the existing learning,
challenge, project, meeting, and gamification rows. Administrators create, archive, and
restore clubs; mentors run the club they lead. No club-owned engine is added, and membership
never widens course access.

### Phase 33 — Club mentoring groups and learning tracks

Small mentoring circles inside a club — one mentor, a topic, a level, and a handful of
santri — plus the learning tracks a club splits its members across (`Olympiad Track` and
`Product Track` for Coders Club). A senior santri can be named as a group's mentor, which
stays a label on the card: every group and track write still goes through `club.manage`, and
no new capability was added.

### Phase 34 — Curriculum map

A `Kurikulum` menu with the weekly roadmap for kelas X and XI — phases, objectives, materi,
praktik, asesmen, and milestones — with search, semester and phase filters, and expandable
weeks; kelas XII shows "Segera hadir". `curriculum.csv` is only the first import: the
curriculum tables are the source of truth, administrators revise weeks and grades in place
or re-import a corrected CSV, and every change is versioned and audited. No new capability.
