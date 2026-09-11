# Learning OS

Learning OS is an open-source learning and academic operations platform for HSI
Boarding School. It is designed as a modular monolith for courses, assessments,
projects, portfolios, attendance, gamification, and classroom operations.

The repository currently delivers **Phase 2 — Learning Core** on top of the Phase 1
identity and academic foundation. Phase 1 covers secure authentication, role-linked
profiles, academic years, terms, classes, student enrollment, subjects, courses, teacher
assignments, permission checks, audit logs, and a responsive administration interface.
Phase 2 adds course modules, lessons, text/link/file materials, layered publishing,
archiving, assignments with optional file attachments, final submissions, grade
corrections, student progress, and dashboard task shortcuts. Assessments (quizzes,
exams, attempts) and the remaining roadmap phases are tracked separately.

## Status

This is an active early-stage project. Phases 0, 1, and 2 are implemented and
validated locally. The project is not presented as a production deployment for a
school environment yet; HTTPS proxy configuration, backup/restore drills, capacity
testing, and operational rollout still require environment-specific validation.

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

The current administration API exposes `GET` and `POST` routes under
`/api/admin/{resource}` for `users`, `years`, `terms`, `classes`, `enrollments`,
`subjects`, `courses`, and `teaching-assignments`. Audit records are available through
`GET /api/admin/audit`. Lists accept `q` and `offset`, return at most 50 rows, and use
the `{ items, nextOffset }` response shape. Server-side permissions and same-origin
checks apply to every mutation.

Phase 1 intentionally provides create/list operations only. Profile editing, role
reassignment, account recovery, class transfers, and academic archive states are not
included.

## Phase 2 workflow

1. An assigned teacher or an administrator opens **Pembelajaran** and selects a course.
2. Add modules and lessons, then add text, HTTP/HTTPS link, or file materials and
   assignments. Lessons can move between active modules of the same course.
3. Publish the course, module, lesson, and assignment. Students see content only when
   every level is published and nothing on the path is archived.
4. Enrolled students complete lessons and submit one final answer before the
   server-side deadline: text, a file, or both.
5. The teacher grades submissions from 0 to 100 with feedback and reviews class
   progress. Corrections append a new grade and keep the earlier ones in the history.
6. Content that is no longer needed is archived instead of deleted. Archived items stay
   restorable, and their completions, submissions, and grades are kept.

The dashboard lists open assignments and each course's next lesson for students, and
assignments with ungraded submissions for teachers.

Uploads accept PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, and ZIP files up to 10 MB.
The server checks the extension against the file's leading bytes and ignores the
browser-supplied media type. Files are stored under `STORAGE_ROOT/learning-files/` by
generated ID; the original name is display metadata only. Downloads require the same
access as the material or submission, and are always served as attachments with a
sandboxing Content-Security-Policy.

The learning API is under `/api/learning/courses`. `GET /api/learning/courses` and
`GET /api/learning/courses/{courseId}` return the course list and workspace. Authoring
uses `POST` (create) and `PATCH` (update) on `modules`, `lessons`, `materials`, and
`activities` within a course. `POST .../publish` sets visibility for the course or for a
module, lesson, or activity, and `POST .../{resource}/{id}/archive` archives or restores
a module, lesson, material, or activity. Students use `POST .../lessons/{id}/complete`
and `POST .../activities/{id}/submit`. Teachers use `GET .../activities/{id}/submissions`,
`POST .../submissions/{id}/grade`, `GET .../submissions/{id}/grades`, and
`GET .../progress`. Files download from `GET .../materials/{id}/file` and
`GET .../submissions/{id}/file`. Material authoring and submissions accept
`multipart/form-data` with one `file` field; other learning requests are JSON limited to
64 KiB, and login and administration bodies stay at 4 KiB. Access follows teacher
assignment, class enrollment, publishing, and archive state, and anything outside that
scope returns 404.

Phase 2 does not provide quizzes, exams, resubmissions, deadline extensions, rich text,
XP, or calendar deadlines. See
[`docs/13_PHASE2_VALIDATION.md`](docs/13_PHASE2_VALIDATION.md) for the full list.

## Database migrations

```sh
bun run db:migrate
```

The migration runner uses a PostgreSQL advisory lock, validates migration checksums,
and applies pending files atomically. Add a new file such as
`0004_assessment_engine.sql`; do not edit a migration that has already been applied.
Runtime values use parameterized SQL. Raw SQL is limited to trusted migration files.

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
They cover migration replay and rollback, constraints, login/session behavior,
permission revocation, provisioning, academic relationships, duplicate and concurrent
enrollment, audit rollback, pagination, and database connectivity. For the learning
core they also cover layered publishing, archiving, course boundaries, file validation
and private downloads, idempotent submissions, server-side deadlines, concurrent
grading, dashboard tasks, progress, and 125 concurrent submissions to one course.
Uploaded test files are written under the ignored `.test-artifacts/` directory and
removed afterwards.

Validated results are documented in
[`docs/12_PHASE1_VALIDATION.md`](docs/12_PHASE1_VALIDATION.md) and
[`docs/13_PHASE2_VALIDATION.md`](docs/13_PHASE2_VALIDATION.md).

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
rules for coding agents and maintainers.

## Roadmap

The next planned milestone is **Phase 3 — Assessment Engine**: question banks,
attempts, answers, grading workflows, rubrics, timers, randomization, autosave,
reconnect recovery, and idempotent final submission, built on the shared Activity
Engine. Follow the [master roadmap](docs/03_MASTER_ROADMAP.md) and keep each phase
independently reviewable and testable.

## Contributing

Please open an issue before a large change, keep pull requests focused, add behavior
tests for new server or database rules, and run the validation commands above. Do not
commit secrets, local databases, generated build output, or private school data.

## License

No license has been selected yet. Until a license file is added, the repository is
publicly viewable but reuse and redistribution rights are not granted by default.
