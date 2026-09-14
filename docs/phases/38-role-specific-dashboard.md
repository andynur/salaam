# Phase 38 — Role-specific dashboard

Validated locally on 2026-09-14 with Bun 1.4.2 and PostgreSQL 17. The product owner asked
for the shared dashboard to become a role-specific workspace for administrators, teachers,
Asisten Mentor, and students, following the priorities of a real school application.

## Workflow

1. An administrator opens the dashboard to see the active academic year, school-wide course
   and class counts, the operational queue, and shortcuts to users, academics, reports, and
   the audit log.
2. A teacher sees assigned course and class counts, the number of grading, project-review,
   and active-session items, an **Antrean mengajar**, and teaching shortcuts.
3. An Asisten Mentor sees assigned courses and classes, sessions that need assistance, an
   **Agenda pendampingan**, and shortcuts for attendance, documentation, calendar, scoped
   reports, and school links.
4. A student sees active courses, open learning priorities, their current level and XP, a
   **Prioritas belajar** queue, growth, agenda, and student actions.
5. Multi-role accounts use the highest-responsibility workspace in this order: admin,
   teacher, Asisten Mentor, then student.

## Scope decisions

- **Reuse existing scoped data.** The dashboard still reads `GET /api/dashboard`; no schema,
  endpoint, stored aggregate, capability, or dependency was added.
- **Capabilities still decide actions.** Role chooses the dashboard language and hierarchy,
  while every shortcut is independently filtered by the actor's permissions. A role label
  cannot grant access.
- **Asisten Mentor remains limited.** Their workspace prioritizes assigned attendance and
  documentation. It does not expose learning authoring, grading, session creation, roster,
  or QR administration.
- **Priorities are actionable.** Teacher/admin totals expand grouped pending grading and
  review counts; student totals count each available task, lesson, project, or session.

## Delivered scope

- **Role experiences:** distinct greeting, role lozenge, KPI labels, queue heading, empty
  state, and quick actions for all four roles.
- **Responsive action grid:** a dedicated role workspace with four full-card shortcuts on
  desktop, two columns on tablets, and single-column horizontal links on phones, with
  separate icon/title/description, hover feedback, and visible keyboard focus.
- **Task triage:** activity-type filters with pressed states, five initial rows and an
  explicit expand/collapse control. Activity counts are separate from pending-answer totals.
- **Next action:** a highlighted card deep-links to the first server-ordered activity with
  role-specific context. Asisten Mentor's queue footer opens attendance.
- **Unit coverage:** role precedence and permission-filtered quick actions.
- **Authorization:** unchanged. Existing server-side permission and course-scope checks
  remain authoritative.

## API additions

None. `GET /api/dashboard` and the existing agenda endpoint are reused without contract
changes.

## Verified behavior

- Unit tests (`tests/dashboard.test.ts`, 2 tests): all role experiences, least-privilege
  action filtering, and multi-role precedence.
- Full PostgreSQL suite: 245 tests passed with 3,161 assertions.
- Browser smoke on the prebuilt bundle against a disposable QA database: 72 of 72 checks
  passed for admin, teacher, Asisten Mentor, and student dashboards at 1440, 820, and 390 px.
  Every role had the expected heading and actions, forbidden actions stayed hidden, no
  unexpected alert appeared, and no viewport had document-level horizontal overflow.
- Desktop and phone screenshots for all four roles were inspected visually. KPI cards, task
  rows, role/date controls, and action cards retained readable hierarchy and wrapping.

## Commands and results

- `bun test tests/dashboard.test.ts`: **2 passed, 0 failed, 12 assertions**.
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`: **245 passed, 0
  failed, 3,161 assertions**.
- `bun test`: **116 passed, 155 skipped, 0 failed, 955 assertions**.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `git diff --check`: passed.
- `bun run db:migrate`: all 36 migrations applied successfully to the disposable browser-QA
  database; no Phase 38 migration exists or is required.

## Findings resolved

- **The same summary told every role the same story.** Role-specific KPI labels and queues
  now explain the work each person owns.
- **Navigation required scanning the whole sidebar.** Each role now has capability-filtered
  shortcuts for its most common next actions.
- **Asisten Mentor could look teacher-like in generic UI.** The dedicated workspace names
  attendance assistance and documentation while omitting authoring language and actions.

## Boundaries

### Dashboard layout follow-up (2026-09-14)

The user supplied screenshots of unstyled shortcuts and a long, undifferentiated queue.
Shortcuts now occupy their own full-width section; filters and progressive disclosure
reduce the initial queue, and a next-action card gives each role a direct starting point.
The application currently served at localhost:3000 was checked and contains the new CSS
selectors. The original screenshot's missing-style condition was not reproduced, so a
specific cache or build defect is not claimed as its cause.

Fresh verification for this follow-up: 2 unit tests / 12 assertions passed, typecheck and
the 16-asset build passed, and 93 of 93 browser checks passed on a disposable migrated,
demo-seeded database. Checks cover all four roles at 1440/820/390 px, actual computed grid
styles, separated title/description bounds, 44px targets, no horizontal overflow or alerts,
task limits, expand/collapse, filtering, keyboard focus, and keyboard navigation. Desktop
and phone screenshots were visually inspected. The full PostgreSQL suite above belongs
to the initial delivery; it was not rerun for this UI-only follow-up.

The layout follows [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
keep common actions visible and make additional activity rows available through a clearly
labelled control. Existing server task limits and ordering remain unchanged.

This is local validation, not deployment to the school production environment. The QA
database, browser profile, storage, screenshots, and generated credentials were removed.

Phase 38 does not include:

- New analytics, stored dashboard aggregates, or custom dashboard widgets.
- User-configurable layouts or per-user shortcut ordering.
- Changes to role permissions, course scope, or the existing task-query limits.
