# Master Roadmap

The roadmap keeps Learning OS in independently testable, reviewable phases. Complete a
phase and validate it before expanding scope.

## Phase 0 — Repository and identity foundation

Establish the Bun/TypeScript/PostgreSQL repository, migration runner, secure sessions,
authentication, role/permission checks, health endpoints, a web shell, and baseline
tests.

## Phase 1 — Core identity and academic foundation

Deliver role-linked profiles, first-admin bootstrap, academic years, terms, classes,
student enrollment, subjects, courses, teacher assignments, audit records, and the
responsive administration UI. This phase is implemented and locally validated.

## Phase 2 — Learning core

Add course modules, lessons, materials, publishing, activities, submissions, grading,
and student progress using the shared Activity Engine. This phase is implemented and
locally validated; see `13_PHASE2_VALIDATION.md`.

## Phase 3 — Assessment engine

Add question banks, attempts, answers, grading workflows, rubrics, timers,
randomization, autosave, reconnect recovery, and idempotent final submission. This phase
is implemented and locally validated for choice-based questions; essays and rubrics are
deferred (see `14_PHASE3_VALIDATION.md`).

## Phase 4 — Project learning

Add challenges, projects, teams, Kanban workflows, reviews, showcases, and portfolio
entries. This phase is implemented and locally validated; see
`15_PHASE4_VALIDATION.md` for the scope decisions and out-of-scope items.

## Phase 5 — Gamification

Add XP, levels, badges, achievements, reward rules, and an auditable XP ledger.

## Phase 6 — Attendance and classroom sessions

Add meeting sessions, rosters, manual attendance, notes, reports, and realtime classroom
status. Attendance must always reference a defined session.

## Phase 7 — QR attendance

Add short-lived QR or camera-assisted attendance using server-side validation. QR values
must never become reusable authentication credentials.

## Phase 8 — Calendar and notifications

Add academic events, deadlines, reminders, notification preferences, and delivery
status without duplicating source-entity deadlines.

## Phase 9 — Reporting

Add operational dashboards, attendance summaries, learning progress reports, exports,
and audit-friendly administrative views.

## Phase 10 — Advanced IT learning

Add isolated coding challenges only when a separate execution boundary, resource limit,
network policy, and review process are available. The main application must never run
untrusted student code directly.

## Phase 11 and later

Evaluate local-server migration, advanced attendance improvements, and other backlog
items only when there is a measured operational need and an approved privacy/security
review.

Each phase must include focused behavior tests, typecheck, build validation when
relevant, updated documentation, and a clear list of out-of-scope work.
