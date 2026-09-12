<img src="assets/brand/salaam-mark.svg" alt="" width="64" height="64" />

# SALAAM

**Learn. Build. Grow.**

SALAAM is the Learning & Growth Platform for HSI Boarding School.

It combines learning, assessment, project-based learning, student portfolio,
gamification, attendance, calendar, and classroom workflows in one lightweight internal
platform, built as an open-source modular monolith.

## Philosophy

SALAAM comes from the Arabic word "Salām" (سلام), representing peace, safety,
well-being, and positive growth.

The platform is built around three principles:

- **Learn** — acquire knowledge and understanding.
- **Build** — transform learning into challenges, projects, and meaningful work.
- **Grow** — develop skills, achievements, character, and a lasting portfolio.

## Status

This is an active early-stage project. Phases 0 through 11 and 13–15 are implemented and
validated locally; Phase 12 pilot readiness remains in progress. HTTPS proxy behavior plus a backup and restore drill were validated on
2026-09-12. SALAAM is not yet presented as a production deployment for a school: capacity
testing on school hardware and WLAN and the operational rollout still need
environment-specific validation.

| Phase | Delivered | Record |
| --- | --- | --- |
| 0 — Foundation | Bun and PostgreSQL skeleton, migration runner, secure sessions, permissions, health checks, application shell | [Phase 0](docs/phases/00-foundation.md) |
| 1 — Identity & academic foundation | Account provisioning with role profiles, first-admin bootstrap, academic years, terms, classes, enrollment, subjects, courses, teacher assignments, account recovery, audit log | [Phase 1](docs/phases/01-identity-academic.md) |
| 2 — Learning core | Modules, lessons, text/link/file materials, layered publishing, archiving, assignments with attachments, grading with corrections, progress, dashboard tasks | [Phase 2](docs/phases/02-learning-core.md) |
| 3 — Assessment engine | Question bank, quizzes and exams, server-timed attempts, per-student shuffling, offline-safe autosave, idempotent submission, automatic scoring, audited score adjustments | [Phase 3](docs/phases/03-assessment-engine.md) |
| 4 — Project learning | Challenges, teacher-formed teams, Kanban boards with conflict-checked moves, reviews with revisions and scores, showcase, student portfolio | [Phase 4](docs/phases/04-project-learning.md) |
| 5 — Gamification | Append-only XP ledger awarded with the event that earns it, derived levels, automatic badges, administrator-configurable reward rules, growth page and teacher leaderboard | [Phase 5](docs/phases/05-gamification.md) |
| 6 — Attendance & classroom sessions | Session rosters, manual attendance, private notes, correction history, reports, dashboard tasks, authenticated realtime updates | [Phase 6](docs/phases/06-attendance.md) |
| 7 — QR attendance | Rotating short-lived check-in codes stored only as digests, camera or typed santri check-in, late thresholds, teacher corrections that still win | [Phase 7](docs/phases/07-qr-attendance.md) |
| 8 — Calendar & notifications | Scoped academic events, live deadlines and assessment windows, in-app reminders, level and QR notifications, preferences and read receipts | [Phase 8](docs/phases/08-calendar-notifications.md) |
| 9 — Reporting | Cross-course operational overview, per-course rows, attendance and learning-progress summaries per santri, filtered audit view, and CSV exports behind `reports.view` | [Phase 9](docs/phases/09-reporting.md) |
| 10 — Advanced IT learning boundary | Typed external-runner contract, bounded execution policy, no-network requirement, and fail-closed configuration; no student code runs in SALAAM | [Phase 10](docs/phases/10-advanced-it-learning.md) |
| 11 — Advanced attendance operations | Bulk marking for open sessions and manager-only session history with scoped access and audit coverage | [Phase 11](docs/phases/11-advanced-attendance.md) |
| 12 — Pilot readiness and operational hardening | Scheduled backup automation, retention, restore checklist, rollback guidance, and pilot acceptance criteria | [Phase 12](docs/phases/12-pilot-readiness.md) |
| 13 — Academic operations | Administrator CSV student import with preview and atomic enrollment, plus bounded recurring sessions with per-session roster snapshots and QR defaults | [Phase 13](docs/phases/13-academic-operations.md) |
| 14 — Academic lifecycle | Profile editing, guarded role reassignment, class transfers with history, and reversible academic archive states | [Phase 14](docs/phases/14-academic-lifecycle.md) |
| 15 — Submission lifecycle | Returned assignment work, numbered resubmissions, current-revision grading, and student-specific deadline exceptions | [Phase 15](docs/phases/15-submission-lifecycle.md) |
| 16 — Written assessment grading | Short-answer and essay questions, autosaved written responses, and manual per-question grading | [Phase 16](docs/phases/16-written-assessment-grading.md) |
| 17 — Assessment rubrics | Bounded criteria, criterion scores, and append-only rubric breakdowns for written answers | [Phase 17](docs/phases/17-assessment-rubrics.md) |
| 18 — Surveys and questionnaires | Published feedback activities with validated, one-time student responses | [Phase 18](docs/phases/18-surveys-questionnaires.md) |
| 19 — Assessment marking | Partial credit and bounded negative marking for choice assessments | [Phase 19](docs/phases/19-assessment-marking.md) |
| 20 — Assessment accommodations | Auditable per-student time extensions for timed assessments | [Phase 20](docs/phases/20-assessment-accommodations.md) |
| 21 — Question bank import and export | Bounded, atomic CSV exchange for course question banks | [Phase 21](docs/phases/21-question-import-export.md) |
| 22 — Assessment question pools | Random, snapshotted question selection with deterministic scoring | [Phase 22](docs/phases/22-assessment-question-pools.md) |
| 23 — Question statistics | Derived question-bank usage, response, and automatic correctness metrics | [Phase 23](docs/phases/23-question-statistics.md) |
| 24 — Project task metadata | Bounded labels and optional card-level deadlines | [Phase 24](docs/phases/24-project-task-metadata.md) |
| 25 — Project task comments | Member-visible append-only notes on project cards | [Phase 25](docs/phases/25-project-task-comments.md) |
| 26 — Project file deliverables | Private uploaded project deliverables with secure downloads | [Phase 26](docs/phases/26-project-file-deliverables.md) |
| 27 — Reporting trends | Twelve-week scoped attendance and learning activity trends | [Phase 27](docs/phases/27-report-trends.md) |

Each record describes the user workflow, API, verified behavior, and out-of-scope items.
The next milestone is **local-server migration planning**, subject to measured operational
need and an approved security review. See the
[roadmap](docs/roadmap.md).

## Architecture

The application is a modular monolith built with native Bun capabilities:

- `Bun.serve()` for HTTP serving and `Bun.SQL` for PostgreSQL access.
- React and Tailwind CSS bundled by Bun without a backend framework, ORM, Redis, or
  additional runtime service.
- Argon2id password hashing, opaque server-managed sessions, same-origin mutation
  checks, database-backed permissions, and transactional audit events.
- Local private filesystem storage for uploaded learning files, addressed only by
  generated IDs.

| Path | Purpose |
| --- | --- |
| `src/core/` | Configuration, HTTP routers, errors, logging, database, authentication, permissions, and file storage |
| `src/modules/users/` | User identity, role profiles, and account provisioning |
| `src/modules/academic/` | Academic structure, enrollment, teacher assignments, and dashboard summaries |
| `src/modules/learning/` | Course access, modules, lessons, materials, publishing, archiving, progress, and dashboard tasks |
| `src/modules/activities/` | Shared Activity Engine: assignments, submissions, and grading |
| `src/modules/assessments/` | Question bank, quiz/exam settings, attempts, automatic scoring, and score adjustments |
| `src/modules/projects/` | Challenges, teams, project boards, reviews, showcase, and portfolio entries |
| `src/modules/gamification/` | XP ledger, badge awards, reward rules, growth summaries, and the class leaderboard |
| `src/shared/` | Shared data contracts used by server and web layers |
| `src/web/` | Application shell, pages, UI primitives, and design tokens |
| `database/migrations/` | Ordered, immutable-after-apply SQL migrations with down scripts |
| `database/seed/` | Development seed and first-admin bootstrap commands |
| `docs/` | Product, roadmap, architecture, security, operations, brand, and phase records |
| `tests/` | Unit, HTTP, migration, and PostgreSQL integration tests |

[`docs/architecture.md`](docs/architecture.md) explains the request flow, domain model, and
locking rules.

## Requirements

- Bun **1.4.2** (`bun --version`).
- PostgreSQL 17 is the tested baseline.
- A PostgreSQL role that can create and use the application and test databases.

## Quick start

```sh
bun install --frozen-lockfile
cp .env.example .env
createdb salaam
bun run db:migrate
bun run dev
```

Open <http://localhost:3000>. Set `DATABASE_URL`, `APP_BASE_URL`, and `STORAGE_ROOT` in the
private `.env` file. The repository does not include a default account or password.
`localhost` and `127.0.0.1` are different browser origins, so `APP_BASE_URL` must exactly
match the origin used in the browser.

## Configuration

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`; defaults to `development` |
| `HOST`, `PORT` | Bind address; defaults to `127.0.0.1:3000` |
| `DATABASE_URL` | Required PostgreSQL connection URL |
| `APP_BASE_URL` | Required origin without a path or query; HTTPS is required in production |
| `STORAGE_ROOT` | Required private storage path for uploaded files, relative to the working directory |
| `SCHOOL_TIMEZONE` | IANA timezone used for academic-year summaries; defaults to `Asia/Jakarta` |
| `SESSION_TTL_HOURS` | Absolute session lifetime from 1 to 168 hours; defaults to 12 |
| `CODE_RUNNER_URL` | Optional external coding runner endpoint; execution is disabled when absent |
| `CODE_RUNNER_TOKEN` | Required bearer token when `CODE_RUNNER_URL` is set; keep it private |
| `CODE_RUNNER_TIMEOUT_MS` | Runner request timeout from 100 to 10,000 ms; defaults to 5,000 |
| `TEST_DATABASE_URL` | Optional isolated test database; its name must end in `_test` |

Never commit `.env` or credentials. Session tokens are random opaque values and only their
SHA-256 hashes are stored in PostgreSQL; no session signing secret is required.

## Creating the first administrator

For local development, set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and `SEED_ADMIN_PASSWORD`
in the private environment and run:

```sh
bun run db:seed
```

The development seed only runs with `NODE_ENV=development`, is transactional, writes an
audit event, and never updates an existing account. If the email already exists, it exits
with "Seed failed" and the old password keeps working; run
`bun run db:migrate:reset && bun run db:seed` to start over with the current `.env` values.
Remove the variables after seeding.

For the first administrator in any environment, set `BOOTSTRAP_ADMIN_EMAIL`,
`BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_IDENTIFIER`, and `BOOTSTRAP_ADMIN_PASSWORD`
privately, then run:

```sh
bun run db:migrate
bun run db:bootstrap-admin
```

The bootstrap command is serialized with a database advisory lock, refuses to run when any
administrator already exists, never overwrites an account, and records an audit event.
Remove the variables after a successful run. Later accounts are created by an authorized
administrator through the administration UI.

## Demo dataset

To explore or demo SALAAM with data that looks like a real term in progress, run against a
freshly migrated, empty development database:

```sh
bun run db:migrate
bun run db:seed:demo
```

The dataset covers every delivered phase, so each role has something to work with:

| Role | What the demo shows |
| --- | --- |
| Administrator | 38 accounts and role profiles, one academic year with two terms, three classes, three courses, reward rules and the badge catalogue, an audit log, and cross-course reports with CSV exports |
| Teacher | A full JavaScript course following the "Modern JavaScript Programming" curriculum, submissions waiting to be graded, a closed exam and an open quiz, capstone projects at every review stage, eight weeks of recorded attendance, a class running right now with QR check-in open, and the class leaderboard |
| Santri | Lessons taught and still to come, an assignment due tonight, an open quiz, XP and badges earned over the term, attendance history, an agenda, and an inbox of delivered reminders |

Two teachers hold overlapping but different scopes — Ahmad teaches X RPL 1 and X RPL 2,
Siti teaches X RPL 2 and XI RPL 1 — so scoped reports and leaderboards differ per teacher
and from what an administrator sees. Accounts use the `@hsibs.my.id` domain and the script
prints the shared demo password on success; every seeded account uses it.

Timings are relative to the moment you seed: the running class, the deadline, the quiz
window, and the next meeting all fall inside the notification worker's 24-hour reminder
window, and the seed runs that worker once so the inbox is not empty. Synthetic history is
audited under `demo_seed.*` event names so the audit log never claims a real request
happened.

The script is development-only, refuses to run twice against the same database (reset with
`bun run db:migrate:reset` first), and writes its dataset in a single transaction so a
failure leaves no partial data. It does not create an administrator; run
`bun run db:bootstrap-admin` (or `db:seed`) separately.

## Database migrations

```sh
bun run db:migrate            # apply every pending migration
bun run db:migrate:rollback   # undo the most recently applied migration
bun run db:migrate:reset      # undo every migration, then reapply all (drops all data)
```

The runner uses a PostgreSQL advisory lock, validates checksums, and applies pending files
atomically. Add the next numbered file, such as `0008_qr_attendance.sql`, with a matching
down script in `database/migrations/down/`; never edit a migration that has been applied.
Rollback and reset refuse to run when `NODE_ENV=production`; use a forward migration there.

## Development and validation

```sh
bun run dev
bun test
bun run typecheck
bun run build
```

`bun test` alone runs the unit tests and skips the PostgreSQL suites. Run the full suite
against a disposable test database:

```sh
createdb salaam_test
TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test
```

Integration tests create and drop random schemas and never modify the public schema. They
cover permissions, constraints, audit rollback, idempotency, and 125-student concurrency
runs for submissions, exams, project boards, and XP awards. Uploaded test files go to the ignored
`.test-artifacts/` directory and are removed afterwards.

## Production

```sh
bun run build
bun run db:migrate
bun run start
```

Run the bundled server as a non-root user behind an HTTPS reverse proxy that accepts
request bodies of at least 10.25 MB for learning uploads. Back up PostgreSQL and
`STORAGE_ROOT` together. The health endpoints are `/health/live` (process) and
`/health/ready` (database). Local validation does not replace a deployment review; see
[operations](docs/operations.md) and [security](docs/security.md).

## Documentation

- [`docs/README.md`](docs/README.md) — index of product, roadmap, architecture, security,
  operations, brand, and phase records.
- [`DESIGN.md`](DESIGN.md) — the UI kit: tokens, components, and CSS classes. Read it before
  building or changing a screen.
- [`AGENTS.md`](AGENTS.md) — rules for coding agents and maintainers. Codex reads it
  directly and Claude Code through [`CLAUDE.md`](CLAUDE.md);
  [`docs/agent-harness.md`](docs/agent-harness.md) explains the setup.

## Contributing

Please open an issue before a large change, keep pull requests focused, add behavior tests
for new server or database rules, and run the validation commands above. Do not commit
secrets, local databases, generated build output, or private school data.

## License

No license has been selected yet. Until a license file is added, the repository is publicly
viewable but reuse and redistribution rights are not granted by default.
