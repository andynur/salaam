# Phase 1 — Identity & Academic Foundation validation

Validated locally on 2026-09-11 with Bun 1.4.2 and PostgreSQL 17.9.
All Phase 1 roadmap exit criteria are implemented and locally verified.

## Delivered scope

- Admin creation/listing of users with student, teacher, or admin role profiles.
  Profiles store a NIS/employee identifier, unique per role; existing role assignments
  are backfilled without inventing identifiers.
- First-admin bootstrap for development/production, serialized by a transaction lock.
  It refuses to run when any administrator already exists; later accounts use the UI.
- Academic years, semesters, classes, student enrollment, subjects, basic courses,
  and teacher assignments. These operations create/list records; they do not rewrite
  historical records.
- Server-side capabilities `admin.users.manage`, `academic.manage`, and `audit.view`.
  Baseline teachers and students cannot call administration APIs.
- Atomic audit records with actor, event, resource type/ID, timestamp, and request ID.
  No password/hash/session token is returned by administration lists or stored in
  audit metadata. The audit UI supports read-only searching and pagination.
- Dashboard year based on school-local date and course/class counts scoped to the
  current actor's enrollment/assignment or academic management capability.
- Responsive administration UI with loading, empty, error, retry, and success states.
  Tables and relation choices support search and 50-row pagination.

## Verified behavior

- PostgreSQL integration: account/password/profile provisioning, duplicate rollback,
  administrator bootstrap refusal, role checks, permission revocation, same-origin
  enforcement, valid academic setup, invalid date/year/role/reference rejection,
  and API results without credentials.
- Concurrent enrollment requests using a four-connection pool: one succeeds, one
  returns 409, and exactly one enrollment/audit record exists.
- An injected audit constraint failure rolls back the associated year creation.
- Real Chrome UI on the prebuilt app and disposable local QA database:
  admin login; student and teacher creation; year, semester, class, enrollment,
  subject, course, and teacher assignment; audit events and search empty state;
  reload/session persistence; logout; student login and scoped summary; direct
  administration URL denied to the student.
- Semester dates outside the selected academic year show an inline error; correcting
  the date allows submission without losing the other form values.
- Desktop administration visually inspected. Phone (390 px) and tablet (820 px)
  checked: document width equals viewport width and wide tables scroll inside their
  panel. Phone navigation expands and links to administration pages.
- The initial-admin CLI was exercised with `NODE_ENV=production` on a disposable
  local database: first invocation succeeded and a repeated invocation was rejected.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost/hsi_learning_os_test bun test`:
  **33 passed, 0 failed, 250 assertions**, including real PostgreSQL integration.
- `bun run typecheck`: passed.
- `bun run build`: passed, five production output files.
- `bun run db:migrate`: applied `0002_academic_foundation.sql` to the local application
  database; replay reported up to date. Migration `0001_identity.sql` is unchanged.

## Findings resolved

- Bun PostgreSQL SQLSTATE is exposed as `errno`; handling it maps duplicate writes
  to 409 and invalid relations to 400 instead of returning generic 500 errors.
- Nested administration URLs exposed relative image asset paths in the production
  bundle. `publicPath: "/"` makes logo paths work from every application route.
- Wide tables initially expanded the phone grid. Giving the main content a zero
  minimum width keeps scrolling within the table panel.
- Chrome's password-manager popup interrupted automation. After the popup was
  dismissed, the local UI workflow completed without application workarounds.

## Boundaries

This is local validation, not deployment to the school production environment.
QA databases and generated credentials are removed after validation. The local app
schema has Phase 1 migrations; no QA users or academic records were added to it.

Phase 1 offers creation and listing. Profile editing, role reassignment, account
recovery, class transfers, and academic archive/status workflows are not included.
Course modules, lessons, publishing, materials, and progress belong to Phase 2.
School HTTPS/proxy validation, backup/restore drills, and load testing remain
operational rollout work described in the foundation validation and deployment docs.
