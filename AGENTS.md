# AGENTS.md — SALAAM

SALAAM (repository and package `salaam`) is the Learning & Growth Platform for
HSI Boarding School. It is a modular monolith: one Bun process serves the API and a React
SPA, and PostgreSQL is the source of truth. Phases 0–7 are delivered; `docs/roadmap.md`
lists what comes next.

## Commands

```sh
bun install --frozen-lockfile
bun run typecheck                 # tsc --noEmit, strict; the only lint gate
bun test tests/<file>.test.ts     # run the tests you touched first
bun test                          # PostgreSQL suites skip without TEST_DATABASE_URL
TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test   # full suite
bun run build                     # production bundle in dist/
bun run dev                       # watch mode; needs .env and a migrated database
bun run db:migrate                # db:migrate:rollback and db:migrate:reset destroy data
```

- Bun 1.4.2 and PostgreSQL 17. Local databases are `salaam` and
  `salaam_test`; a test database name must end in `_test`.
- Don't read `.env`. Variable names and defaults are in `.env.example`.
- No formatter or linter: two-space indentation, semicolons, double quotes, and the compact
  style of the surrounding file.

## Code map

| Path | Holds |
| --- | --- |
| `src/server.ts` | Bootstrap and `Bun.serve` routes; every SPA path is listed here |
| `src/core/http.ts` | Health, auth, same-origin check, dispatch by URL prefix |
| `src/core/{foundation,learning,project}-http.ts` | Routers for `/api/admin`, `/api/learning/courses`, `/api/projects` |
| `src/core/attendance-{http,realtime}.ts` | Attendance HTTP routes and authenticated WebSocket invalidations |
| `src/core/` | Config, `HttpError`, validation helpers, permissions, auth, audit, storage, logger, migrations |
| `src/modules/<domain>/` | `input.ts` validates bodies; `service.ts` and siblings hold SQL and rules |
| `src/modules/learning/access.ts` | `courseAccess` and `lessonAccess`: scope checks and course locks |
| `src/shared/` | Types shared by server and web |
| `src/web/` | React SPA; rules in `src/web/AGENTS.md`, UI kit in `DESIGN.md` |
| `database/` | Migrations and seeds; rules in `database/AGENTS.md` |
| `tests/` | Unit and PostgreSQL integration tests; rules in `tests/AGENTS.md` |

## Server conventions

- Flow: router → `input.ts` → service → tagged-template SQL. Routers wrap service calls in
  `databaseInputError`, which maps SQLSTATE `23505` to 409 and `23503`/`23514` to 400.
- Errors: `throw new HttpError(status, "CODE", "Indonesian message")`. Anything else
  becomes a generic 500; never return raw database errors.
- Authorization: `requirePermission(actor, capability)`, then a scope check such as
  `courseAccess(tx, actor, courseId, "view" | "manage" | "participate", lock)`. A missing
  capability returns 403; a resource outside the actor's scope returns 404. Code checks
  capabilities, never role names.
- Capabilities (seeded by migrations): `dashboard:view`, `admin.users.manage`,
  `academic.manage`, `audit.view`, `learning.view`, `learning.manage`,
  `learning.manage.all`, `learning.participate`. Reuse them before adding new ones.
- Mutations run in one `db.begin(async tx => …)`: lock the course row first (`FOR UPDATE`,
  or `"share"` for concurrent student traffic such as attempts and project boards), write,
  then call `recordAudit(tx, …)` for audited events so a failed audit rolls back.
- Retries are idempotent: the same request returns the existing row. Concurrent or stale
  edits get 409 through `version` columns or `previous…Id` checks.
- Lists query `LIMIT 51 OFFSET n` and return `{ items, nextOffset }` with 50 items;
  `listInput` parses and escapes `q` and `offset`.
- The database clock decides deadlines and exam windows. Columns are `timestamptz`; JSON
  carries ISO strings.
- Bind JSON as `${JSON.stringify(value)}::text::jsonb`; a plain `::jsonb` cast stores a
  string. `tx.unsafe` is reserved for migration files.
- Uploads live at generated paths under `STORAGE_ROOT/learning-files/`; the original
  filename is display metadata only.
- Classroom WebSockets send invalidations only. Recheck authentication and course/session
  access before notifications and periodically; keep all attendance data on scoped HTTP.
- Non-GET API requests must send `Origin` equal to `APP_BASE_URL`, including from tests
  and scripts.

## Invariants

- One Activity Engine: assignment, quiz, exam, and challenge are `activities.kind` rows
  with a settings table per kind. New kinds such as surveys follow the same pattern.
- Exam final submission is idempotent, and attempts snapshot their questions.
- Passwords use Argon2id through `Bun.password`. Session tokens are opaque and stored
  only as SHA-256 hashes. Never log passwords, cookies, tokens, or request bodies.
- Student code never runs in the application process; no `eval`.
- Applied migrations are immutable; their checksums are verified.
- No backend framework, ORM, Redis or queue, UI or icon library, or extra runtime service.
  State the reason for any new dependency.
- Product strings come from `src/web/lib/brand.ts`. The package name, database names,
  and the `salaam:` storage key prefix all match the SALAAM brand; keep them consistent
  when renaming anything else.

## Workflow

1. Stay inside the requested task or phase; mention adjacent work instead of doing it.
   Ask the product owner when a scope decision changes data or user-visible behavior.
2. Plan briefly for non-trivial work. Search for an existing helper, component, or CSS
   class before writing a new one.
3. Ship behavior with tests: unit tests for validation, integration tests for SQL,
   permissions, idempotency, and concurrency.
4. Before handing off, run the touched tests and `bun run typecheck`. When server or
   database code changed, run the full suite with `TEST_DATABASE_URL`. Run
   `bun run build` for web or bundling changes. Report real counts, and say so when
   PostgreSQL suites were skipped.
5. Update the docs the change affects in the same commit.
6. Commit with Conventional Commits (`feat:`, `fix:`, `docs:`, `feat(web):`). Never commit
   `.env`, `dist/`, storage contents, or school data.

UI copy is Indonesian. Code, comments, docs, and commit messages are English.

## Read on demand

| Task | Read |
| --- | --- |
| Any screen or style change | `DESIGN.md` |
| Schema change | skill `add-migration` |
| Starting or closing a roadmap phase | skill `deliver-phase` |
| Verifying UI in a real browser | skill `browser-qa` |
| Domain model, request flow, locking | `docs/architecture.md` |
| Existing behavior and API of a phase | `docs/phases/NN-*.md` |
| Security or deployment questions | `docs/security.md`, `docs/operations.md` |
| Product scope and roadmap | `docs/product.md`, `docs/roadmap.md` |
| Name, logo, icons, social preview | `docs/brand.md` |

Skills live in `.agents/skills/<name>/SKILL.md`. Don't load every doc for every task.
