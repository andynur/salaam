# Phase 27 — Reporting trends

## Scope decisions

- Trends use twelve complete calendar-week buckets in the configured school timezone and reuse
  the existing report scope and `reports.view` capability.
- The chart derives attendance rate, lesson completions, and assignment submissions directly
  from source tables in one repeatable-read, read-only transaction.
- Empty weeks are returned explicitly so the UI does not imply activity where there is none.

## Delivered

- `GET /api/reports/trends` returns the twelve-week trend series with the same course, class,
  term, and year scope as the existing reports.
- The reports overview now shows a responsive, accessible trend chart with loading, error, and
  empty-week states, without adding a chart library or stored aggregate.
- Teacher scope remains limited to assigned courses; administrators can use their existing
  school-wide scope.

## Validation

- Typecheck and production build pass.
- Reporting integration covers the twelve-bucket timeline, derived values, scope filtering,
  and refusal for actors without `reports.view`.
- Full PostgreSQL regression remains the release gate.

## Boundaries

- per-activity, per-question, cohort, and custom saved analytics remain deferred
- no scheduled delivery, PDF/spreadsheet export, forecasting, or stored reporting aggregate is
  introduced
