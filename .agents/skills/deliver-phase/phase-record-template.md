# Phase N — <Name> validation

Validated locally on YYYY-MM-DD with Bun <version> and PostgreSQL <version>. <Who confirmed
the scope and how, for example "The product owner limited question types to…".>

## Workflow

1. <User-level steps for teachers and students, four to six items.>

## Scope decisions

<Only when decisions were made during implementation.>

- **<Decision>.** <Rule and reason.>

## Delivered scope

- Migration `NNNN_<name>.sql` with a matching down script. <Capabilities added or reused.>
- **<Area>.** <Rules as enforced: limits, locks, idempotency, visibility.>
- **Locking.** <Rows locked, in which mode, and why.>
- **Audit events:** `<event>`, …
- **UI:** <Screens and components.>

## API additions

Mutations require the same origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/...` | ... |

## Verified behavior

- PostgreSQL integration (`tests/<file>.integration.test.ts`, N tests):
  - **<Area>:** <behaviors checked>.
  - **Load:** 125 students <flow>, <result and bound>.
- Unit tests (`tests/<file>.test.ts`, N tests): <validation covered>.
- Browser smoke on the prebuilt bundle against a disposable QA database, driven through
  headless Chrome with the DevTools protocol. N of N checks passed:
  - <Flow checks per role.>
  - <Layout checks at 1440, 820, and 390 px.>
- <Screens whose desktop, tablet, and phone screenshots were inspected.>

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  **N passed, 0 failed, N assertions** across Phases 0–N.
- `bun test` without a test database: N passed, N skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed, N production output files.
- `bun run db:migrate`: applied `NNNN_<name>.sql` to the local application database; the
  file is now immutable.

## Findings resolved

- **<Problem>.** <Cause and fix.>

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, and generated credentials were removed after validation.

Phase N does not include:

- <Out-of-scope item and, when known, the phase that owns it>

<Known operational limits, for example load-testing caveats.>
