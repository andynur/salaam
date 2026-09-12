# Phase 9 — Reporting validation

Validated locally on 2026-09-12 with Bun 1.4.2 and PostgreSQL 17.9. No scoping round was
held, so the decisions below were made during implementation and are recorded here.

## Workflow

1. An administrator or teacher opens **Laporan** and picks a scope: academic year, term,
   class, and course. Choosing a wider filter clears the narrower ones.
2. **Ringkasan** answers "how is the school doing right now": santri, published courses,
   attendance, lesson completion, work waiting to be graded, projects, and XP.
3. **Course** lists one row per course with its roster, content, sessions, attendance rate,
   grading backlog, and average score.
4. **Kehadiran** and **Kemajuan belajar** give one row per santri across every course in
   scope, searchable by name or school identifier.
5. **Audit log** (administrators only) filters events by kind, actor, and date range.
6. Every report downloads as CSV with the filters that are on screen.

## Scope decisions

- **Reporting reads; it never stores.** Every figure is derived from existing learning,
  assessment, attendance, project, and gamification rows, so there is no report table to
  keep in step and no backfill when a rule changes.
- **One new capability, `reports.view`, for administrators and teachers.** Cross-course
  reports are not a course screen, so they need their own capability; the audit report
  keeps `audit.view`, which only administrators hold. Santri have no reporting access:
  their own progress already lives in Pembelajaran and Pertumbuhan.
- **Scope is a filter, not a lookup.** `learning.manage.all` sees every course; anyone else
  sees only the courses they are assigned to teach. A course outside that set filters to
  zero rows rather than returning 404, because the report never names a single resource.
- **Reads run in one repeatable-read, read-only transaction,** so the figures in one report
  describe one consistent moment.
- **Exports are capped at 5,000 rows** and audited. That covers a term for a class inside
  one request without streaming the whole school.
- **Attendance and completion definitions match Phase 6.** Attendance percentage counts
  present and late over closed sessions, other statuses come from every noncancelled
  session, and cancelled sessions are excluded.

## Delivered scope

- Migration `0009_reporting.sql` with a matching down script. Adds the capability
  `reports.view` (admin, teacher) and the indexes the report queries need:
  `courses(academic_year_id, term_id)`, `classroom_sessions(course_id, status)`,
  `xp_entries(course_id)`, `audit_logs(actor_id, created_at DESC)`, and
  `audit_logs(event, created_at DESC)`. It reuses `audit.view`, `learning.manage`, and
  `learning.manage.all`; it creates no table.
- **Operational overview.** Santri, courses and published courses, unarchived activities
  and lessons, lesson completion rate, sessions and closed sessions, attendance rate,
  submissions and grading backlog, average grade, submitted attempts and their average
  percentage, projects and reviews waiting, and XP awarded — all inside the filtered scope.
- **Course report.** One row per course: roster size, lessons, activities, sessions,
  attendance rate, submissions, grading backlog, average score, and publication state.
- **Attendance summary.** One row per santri across courses: sessions, unrecorded, each
  status, closed sessions, attended, and rate.
- **Learning progress.** One row per santri and class: courses, published lessons and
  completions with a rate, published assignments with submitted and graded counts and the
  average of the latest grade, submitted attempts with their average percentage, and XP
  earned in the scoped courses. Attempt scores use the latest score adjustment when one
  exists, matching Phase 3.
- **Audit report.** The Phase 1 audit list plus filters for event key, actor, and a date
  range read in the school timezone. Timestamps leave the server as ISO UTC.
- **Exports.** `GET …/<report>.csv` repeats the same query with a 5,000-row cap and returns
  a UTF-8 attachment with a BOM. Cells that start with `=`, `+`, `-`, `@`, a tab, or a
  carriage return are prefixed with an apostrophe so a spreadsheet shows exported school
  data as text instead of evaluating it.
- **Locking.** None. Every route is a GET inside
  `ISOLATION LEVEL REPEATABLE READ READ ONLY`, so reports never block classroom traffic.
- **Audit events:** `report.courses.exported`, `report.attendance.exported`,
  `report.progress.exported`, `report.audit.exported`. Each records the narrowest scoped
  identifier (course, else class, else term, else year) and nothing about the rows.
- **UI:** `src/web/pages/Reports.tsx` at `/reports` — page header, tabs, one filter bar,
  the dashboard stat-card grid, a `.report-metrics` strip, and the shared table, search,
  pager, and empty/loading/error states. The sidebar's "Laporan" placeholder became a real
  entry behind `reports.view`.

## API additions

Every reporting route is a GET. Resources outside the actor's scope are filtered out rather
than listed.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/reports/filters` | Years, terms, classes, courses, and audit event keys in scope |
| `GET` | `/api/reports/overview` | Operational summary for the filtered scope |
| `GET` | `/api/reports/courses` | Per-course operational rows |
| `GET` | `/api/reports/attendance` | Per-santri attendance summary across courses |
| `GET` | `/api/reports/progress` | Per-santri learning progress across courses |
| `GET` | `/api/reports/audit` | Filtered audit events (`audit.view`) |
| `GET` | `/api/reports/{courses,attendance,progress,audit}.csv` | The same report as a CSV attachment |

Filters: `yearId`, `termId`, `classId`, `courseId`, `q`, `offset`; the audit report also
takes `event`, `actorId`, `from`, and `to`.

## Verified behavior

- PostgreSQL integration (`tests/reporting.integration.test.ts`, 9 tests):
  - **Authorization:** santri receive 403 on every report and export, anonymous callers
    401, unknown report names 404, and non-GET methods 405.
  - **Scope:** a teacher's filter options and every report list only their own course; a
    filter naming another teacher's course returns no rows.
  - **Figures:** overview, course, attendance, and progress rows match a seeded course with
    one completed lesson, one graded submission, and one closed session with a present and
    an absent santri.
  - **Audit report:** `audit.view` is required, ordering is newest first, timestamps are
    ISO UTC, and the event, actor, and date filters narrow correctly.
  - **Exports:** CSV headers, attachment disposition, BOM, row content, and exactly one
    audit row per export carrying the scoped identifier.
  - **Validation:** malformed identifiers, offsets, search strings, dates, and event keys
    fail with 400 before a query runs.
- Unit tests (`tests/reporting.test.ts`, 7 tests): scope and date parsing, audit filter
  rules, CSV quoting and escaping, and the formula-injection guard.
- Browser smoke on the prebuilt bundle against a disposable QA database, driven through
  headless Chrome with the DevTools protocol. 58 of 58 checks passed:
  - Administrator: the overview, all four tables, the export links, the sidebar entry, and
    the academic-year filter.
  - Teacher: the page loads with no audit tab, and the CSV download arrives as an
    attachment containing the roster.
  - Santri: `/reports` refuses access and the sidebar hides the entry.
  - Layout at 1440, 820, and 390 px on every tab: no document-level horizontal scroll and
    no unexpected alert.
- Desktop and phone screenshots of the overview, course, attendance, progress, audit, and
  teacher views were inspected.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  **162 passed, 0 failed, 2,160 assertions** across 24 files. The run includes another
  session's in-progress Phase 8 work in the same tree.
- `bun test` without a test database: 75 passed, 107 skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production output files.
- `bun run db:migrate`: `0009_reporting.sql` is applied to the local application database
  and is now immutable; a second run reports "Database is up to date." It was also applied
  and rolled back repeatedly by the migration suite and by two disposable QA databases,
  which migrated 0001–0010 cleanly.

## Findings resolved

- **The audit table crashed the page after switching tabs.** All four reports rendered
  through one `ReportTable` component, so React kept the previous report's rows in state
  while the new fetch was in flight and rendered them with the new report's columns; the
  audit column then called `formatDateTime` on a row that has no timestamp. The table is
  now keyed by report kind, so each report gets its own instance.
- **Audit timestamps were unparseable in the browser.** PostgreSQL's `timestamptz::text`
  carries microseconds and a space separator, which Chrome refuses to parse. The audit
  query now emits ISO UTC.

## Post-delivery verification

Phase 8 landed in the same working tree after this record was first written. The combined
application was re-checked in headless Chrome on 2026-09-12 with both phases in place —
**73 of 73 checks passed** across administrator, teacher, and santri at 1440, 820, and
390 px, covering the dashboard, calendar, notifications, and every report tab, with no
uncaught page errors. The shared shell, navigation, and stylesheet carry both phases'
changes without conflict.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, and generated credentials were removed after validation.

Phase 9 does not include:

- Charts and trend lines; every report is a table or a figure strip.
- Scheduled or emailed reports and report subscriptions (delivery belongs to Phase 8).
- PDF or spreadsheet exports; CSV is the only format.
- Per-activity and per-question analytics, item statistics, and cohort comparisons.
- Saved report definitions, custom columns, and pivoting.
- Retention or archival policy for audit rows, and exports larger than 5,000 rows.
- Attendance XP, still deferred pending a correction and reversal policy.

Report queries were validated against a seeded dataset, not against a full school year of
rows; the added indexes cover the filter paths, but load testing on school hardware remains
outstanding.
