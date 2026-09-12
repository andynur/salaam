# Phase 23 — Question statistics

## Delivered

The manager-only question bank now shows derived usage metrics from submitted attempts:
the number of submitted snapshots, answered responses, and the percentage of fully correct
automatic choice responses. Written questions show response counts without a misleading
automatic correctness percentage.

Statistics are calculated directly from attempt snapshots and answers in a repeatable-read
transaction. No aggregate table or background worker is introduced, and unanswered or open
attempts are excluded.

## Validation

- `bun run typecheck`
- `bun run build`
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`

## Boundaries

- discrimination indices, cohort comparisons, charts, and exportable analytics remain out of scope
- proctoring and live monitoring remain out of scope
