# Learning OS

Learning OS is an open-source learning and academic operations platform for HSI
Boarding School. It is designed as a modular monolith for courses, assessments,
projects, portfolios, attendance, gamification, and classroom operations.

The repository currently delivers **Phase 3 — Assessment Engine** on top of the
Phase 1 identity and academic foundation and the Phase 2 learning core.

- **Phase 1:** secure authentication, role-linked profiles, academic years, terms,
  classes, enrollment, subjects, courses, teacher assignments, permission checks, audit
  logs, and a responsive administration interface.
- **Phase 2:** course modules, lessons, text/link/file materials, layered publishing,
  archiving, assignments with file attachments, submissions, grade corrections, student
  progress, and dashboard task shortcuts.
- **Phase 3:** a course question bank (single choice, multiple choice, true/false),
  quizzes and exams on the shared Activity Engine, server-timed attempts with
  per-student randomization, forward-only autosave with reconnect recovery, idempotent
  final submission, automatic scoring, result visibility rules, and audited score
  adjustments.

Project learning and the remaining roadmap phases are tracked separately.

## Status

This is an active early-stage project. Phases 0 through 3 are implemented and validated
locally. The project is not presented as a production deployment for a school
environment yet; HTTPS proxy configuration, backup/restore drills, capacity testing, and
operational rollout still require environment-specific validation.

## Architecture

The application is a modular monolith built with native Bun capabilities:

- `Bun.serve()` for HTTP serving and `Bun.SQL` for PostgreSQL access.
- React and Tailwind CSS bundled by Bun without a backend framework, ORM, Redis, or
  additional runtime service.
- Argon2id password hashing, opaque server-managed sessions, same-origin mutation
  checks, database-backed permissions, and transactional audit events.
- Local private filesystem storage for uploaded learning files, addressed only by
  generated IDs.

Important directories:

| Path | Purpose |
| --- | --- |
| `src/core/` | Configuration, HTTP, errors, logging, database, authentication, permissions, and file storage |
| `src/modules/users/` | User identity, role profiles, and account provisioning |
| `src/modules/academic/` | Academic structure, enrollment, teacher assignments, and dashboard summaries |
| `src/modules/learning/` | Course access, modules, lessons, materials, publishing, archiving, progress, and dashboard tasks |
| `src/modules/activities/` | Shared Activity Engine: assignments, submissions, and grading |
| `src/modules/assessments/` | Question bank, quiz/exam settings, attempts, automatic scoring, and score adjustments |
| `src/shared/` | Shared data contracts used by server and web layers |
| `src/web/` | Application shell, pages, UI primitives, and design tokens |
| `database/migrations/` | Ordered, immutable-after-apply SQL migrations |
| `database/seed/` | Explicit development seed and first-admin bootstrap commands |
| `docs/` | Product, architecture, roadmap, security, operations, and validation documentation |
| `tests/` | Unit, HTTP, migration, and PostgreSQL integration tests |

## Requirements

- Bun **1.4.2** (`bun --version`).
- PostgreSQL 17 is the tested baseline.
- A PostgreSQL role that can create/use the application and test databases.

## Quick start

```sh
bun install --frozen-lockfile
cp .env.example .env
createdb hsi_learning_os
bun run db:migrate
bun run dev
```

Open <http://localhost:3000>. Set `DATABASE_URL`, `APP_BASE_URL`, and
`STORAGE_ROOT` in the private `.env` file. The repository does not include a default
account or password. `localhost` and `127.0.0.1` are different browser origins, so
`APP_BASE_URL` must exactly match the origin used in the browser.

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
| `TEST_DATABASE_URL` | Optional isolated test database; its name must end in `_test` |

Never commit `.env` or credentials. Session tokens are random opaque values and only
their SHA-256 hashes are stored in PostgreSQL; no session signing secret is required.

## Creating the first administrator

For local development, set `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and
`SEED_ADMIN_PASSWORD` in the private environment and run:

```sh
bun run db:seed
```

The development seed is transactional, writes an audit event, refuses an existing
email, and only runs with `NODE_ENV=development`. Remove the variables after seeding.
It never updates an existing account — if you change `SEED_ADMIN_PASSWORD` after the
first successful seed, re-running `db:seed` fails silently on the duplicate email and
the old password keeps working. Run `bun run db:migrate:reset && bun run db:seed` to
start over with the current `.env` values.

For the first administrator in any environment, set the following private variables:
`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_IDENTIFIER`, and
`BOOTSTRAP_ADMIN_PASSWORD`, then run:

```sh
bun run db:migrate
bun run db:bootstrap-admin
```

The bootstrap command is serialized with a database advisory lock, refuses to run when
any administrator already exists, never overwrites an account, and records an audit
event. Remove the variables after a successful run. Later accounts are created by an
authorized administrator through the administration UI.

## Phase 1 workflow

1. Create an academic year and terms whose dates fit inside that year.
2. Create classes for the year and enroll active students.
3. Create subjects and courses that connect a class, term, and subject.
4. Assign active teachers to courses.
5. Review the read-only audit log.

The administration API exposes `GET` and `POST` routes under `/api/admin/{resource}` for
`users`, `years`, `terms`, `classes`, `enrollments`, `subjects`, `courses`, and
`teaching-assignments`. Audit records are available through `GET /api/admin/audit`.
Lists accept `q` and `offset`, return at most 50 rows, and use the
`{ items, nextOffset }` response shape. Server-side permissions and same-origin checks
apply to every mutation. Profile editing, role reassignment, account recovery, class
transfers, and academic archive states are not included.

## Phase 2 workflow

1. An assigned teacher or an administrator opens **Pembelajaran** and selects a course.
2. Add modules and lessons, then add text, HTTP/HTTPS link, or file materials and
   assignments. Lessons can move between active modules of the same course.
3. Publish the course, module, lesson, and assignment. Students see content only when
   every level is published and nothing on the path is archived.
4. Enrolled students complete lessons and submit one final answer before the
   server-side deadline: text, a file, or both.
5. The teacher grades submissions from 0 to 100 with feedback and reviews class
   progress. Corrections append a new grade and keep the earlier ones.
6. Content that is no longer needed is archived instead of deleted and stays restorable.

Uploads accept PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, and ZIP files up to 10 MB.
The server checks the extension against the file's leading bytes, stores files under
`STORAGE_ROOT/learning-files/` by generated ID, and serves downloads only as sandboxed
attachments after access checks. See
[`docs/13_PHASE2_VALIDATION.md`](docs/13_PHASE2_VALIDATION.md) for the API and limits.

## Phase 3 workflow

1. In a course, the teacher opens **Bank soal** and adds single-choice,
   multiple-choice, or true/false questions with an answer key and optional explanation.
2. In a lesson, the teacher adds a quiz or an exam, chooses questions and points, and
   sets the window, time limit, attempts, shuffling, and result visibility. An exam
   always has one attempt, a time limit, and a closing time.
3. After publishing, students start the assessment from the lesson or dashboard. Each
   attempt snapshots its questions, shuffles them per student when configured, and
   fixes its deadline from server time.
4. Answers autosave as they are chosen. Answers made while offline stay on the device
   and are resent after the connection or page returns. Retried or late autosaves never
   overwrite a newer answer.
5. Students submit once; submission is idempotent. Attempts that reach their deadline
   are finalized automatically with the last saved answers. Multiple-choice questions
   score only when every choice is exact.
6. Students see scores and explanations according to the visibility setting. Teachers
   review attempts and append audited score adjustments with a reason.

Questions used by an attempted assessment, and the assessment's settings and question
list, are locked. The Phase 3 API extends `/api/learning/courses/{courseId}` with
`questions`, `assessments`, `assessments/{id}/items`, `assessments/{id}/attempts`,
`attempts/{id}`, `attempts/{id}/answers`, `attempts/{id}/submit`,
`attempts/{id}/adjust`, and `attempts/{id}/adjustments`; publishing and archiving reuse
`activities/{id}/publish` and `activities/{id}/archive`. See
[`docs/14_PHASE3_VALIDATION.md`](docs/14_PHASE3_VALIDATION.md) for details and the
out-of-scope list (essays, rubrics, surveys, time extensions, and proctoring).

## Database migrations

```sh
bun run db:migrate            # apply every pending migration
bun run db:migrate:rollback   # undo the single most recently applied migration
bun run db:migrate:reset      # undo every migration, then reapply all of them (drops all data)
```

The migration runner uses a PostgreSQL advisory lock, validates migration checksums,
and applies pending files atomically. Add a new file such as `0005_project_learning.sql`;
do not edit a migration that has already been applied. Runtime values use parameterized
SQL. Raw SQL is limited to trusted migration files. Bind JSON documents as
`${JSON.stringify(value)}::text::jsonb`; a direct `::jsonb` cast stores a JSON string.

Every file in `database/migrations/*.sql` needs a matching down script in
`database/migrations/down/` with the same filename; `rollback`/`reset` reverse-apply
those. Both commands refuse to run when `NODE_ENV=production` because they destroy
data — use a forward migration in production instead. `db:migrate:reset` is the fast
way to get a known-clean local database (equivalent to dropping and recreating it).

## Development and validation

```sh
bun run dev
bun test
bun run typecheck
bun run build
```

To run the PostgreSQL integration suite against a disposable test database:

```sh
createdb hsi_learning_os_test
TEST_DATABASE_URL=postgres://localhost:5432/hsi_learning_os_test bun test
```

Integration tests create and remove random schemas and do not modify the public schema.
They cover migrations, constraints, sessions, permissions, provisioning, academic
relationships, audit rollback, and pagination. For the learning core they also cover
publishing, archiving, course boundaries, private files, idempotent submissions,
deadlines, grading, dashboard tasks, and 125 concurrent submissions. For the assessment
engine they cover the question bank, attempt snapshots, forward-only autosave,
idempotent submission, automatic scoring, exam windows and expiry, result visibility,
score adjustments, course boundaries, and 125 students completing one exam concurrently.
Uploaded test files are written under the ignored `.test-artifacts/` directory and
removed afterwards.

Validated results are documented in
[`docs/12_PHASE1_VALIDATION.md`](docs/12_PHASE1_VALIDATION.md),
[`docs/13_PHASE2_VALIDATION.md`](docs/13_PHASE2_VALIDATION.md), and
[`docs/14_PHASE3_VALIDATION.md`](docs/14_PHASE3_VALIDATION.md).

## Production notes

```sh
bun run build
bun run db:migrate
bun run start
```

Run the bundled server behind an HTTPS reverse proxy as a non-root user. Keep the
private storage directory outside static asset serving, run migrations before routing
traffic, rotate logs, and schedule PostgreSQL and storage backups together: uploaded
learning files live only in `STORAGE_ROOT`, while their metadata lives in PostgreSQL.
Allow request bodies of at least 10.25 MB at the proxy for learning uploads. The health
endpoints are `/health/live` (process-only) and `/health/ready` (database connectivity).

This repository does not claim that local validation replaces deployment review. See
[`docs/07_DEPLOYMENT_AND_OPERATIONS.md`](docs/07_DEPLOYMENT_AND_OPERATIONS.md) for the
operational checklist and [`docs/05_DATA_SECURITY_RELIABILITY.md`](docs/05_DATA_SECURITY_RELIABILITY.md)
for security and recovery requirements.

## Documentation

Start with [`docs/00_README.md`](docs/00_README.md), then read the product vision,
architecture, roadmap, security, UI, operations, engineering rules, and validation
documents as needed. [`AGENTS.md`](AGENTS.md) contains repository-level contribution
rules for coding agents and maintainers. [`DESIGN.md`](DESIGN.md) is the concrete UI kit
reference (tokens, components, class catalogue) — read it before building or changing
any screen.

## Roadmap

The next planned milestone is **Phase 4 — Project Learning**: challenges, projects,
teams, Kanban workflows, reviews, showcases, and portfolio entries. Follow the
[master roadmap](docs/03_MASTER_ROADMAP.md) and keep each phase independently
reviewable and testable.

## Contributing

Please open an issue before a large change, keep pull requests focused, add behavior
tests for new server or database rules, and run the validation commands above. Do not
commit secrets, local databases, generated build output, or private school data.

## License

No license has been selected yet. Until a license file is added, the repository is
publicly viewable but reuse and redistribution rights are not granted by default.
