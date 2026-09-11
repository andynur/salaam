---
name: deliver-phase
description: Scope, implement, validate, and document one SALAAM roadmap phase (for example Phase 5 Gamification) or a phase-sized feature end to end. Use when starting, continuing, or closing a roadmap phase; not for small fixes.
---

# Deliver a roadmap phase

## 1. Scope before code

- Read the phase in `docs/roadmap.md` (including "Deferred from delivered phases"), the V1
  scope in `docs/product.md`, and `docs/architecture.md`.
- Draft a short proposal: tables, capabilities, rules (limits, locks, idempotency,
  visibility), screens per role, audit events, and an out-of-scope list.
- Ask the product owner to confirm decisions that change the data model or what users can
  do. If they ask you to proceed without a scoping round, make the decisions and record
  them under "Scope decisions" in the phase record.
- Reuse first: the Activity Engine for anything activity-like, `courseAccess`,
  `recordAudit`, existing capabilities, dashboard tasks and progress, and the `DESIGN.md`
  kit.

## 2. Build in this order

1. Schema: skill `add-migration`.
2. Types in `src/shared/<domain>.ts`.
3. `src/modules/<domain>/input.ts` validators, then service functions (one transaction,
   lock, audit) following the server conventions in `AGENTS.md`.
4. Routes: extend a `src/core/*-http.ts` router, or add one and dispatch it from
   `src/core/http.ts` and `src/server.ts`.
5. Dashboard tasks and progress (`src/modules/learning/dashboard.ts` and the progress
   queries) when the phase creates work for students or teachers.
6. Screens per `src/web/AGENTS.md` and `DESIGN.md`.
7. Tests with each layer per `tests/AGENTS.md`, including a 125-student concurrent run for
   heavy student flows.

Commit in reviewable steps when the work is large.

## 3. Validate

Run these and record the exact results:

```sh
bun test tests/<new files>
bun run typecheck
TEST_DATABASE_URL=postgres://localhost:5432/hsi_learning_os_test bun test
bun test                      # counts without the database
bun run build
bun run db:migrate            # local application database
```

Then run skill `browser-qa` for every new screen and flow at 1440, 820, and 390 px. Fix
what it finds and note each finding.

## 4. Document in the same change

- New `docs/phases/NN-<slug>.md` from [phase-record-template.md](phase-record-template.md).
- `docs/roadmap.md`: status table, move the phase to Delivered, update deferred items.
- `docs/README.md`: add the record to the phase table.
- `README.md`: status table row and next milestone.
- `docs/architecture.md`: tables, capabilities, lifecycle and locking rules.
- `docs/security.md` and `docs/operations.md`: new limits, env vars, storage, proxy needs.
- `DESIGN.md`: new components and classes in the catalogue.
- `AGENTS.md` or a nested `AGENTS.md`: only when a convention changed.

## 5. Hand off

Report the delivered scope, decisions, commands with counts, findings, and real remaining
risks. Commit as `feat: deliver phase N <name>`; documentation-only follow-ups use `docs:`.
