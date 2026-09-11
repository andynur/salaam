# Phase 5 — Gamification validation

Validated locally on 2026-09-12 with Bun 1.4.2 and the local PostgreSQL 17 server. The
product owner asked for Phase 5 to be started and carried through without a separate
scoping round, so the scope decisions below were made during implementation. They are
recorded here for review before production use.

## Workflow

1. A santri studies as before. Finishing a lesson, having an assignment graded, completing
   a quiz or exam, and having a project approved each add XP to an append-only ledger.
2. The santri opens **Pertumbuhan** and sees their level, total XP, the XP still needed for
   the next level, the badges they hold, the badges still locked with their progress, and
   the most recent XP they earned with its course and time.
3. Badges open automatically the moment a threshold is reached — no teacher action and no
   claim step.
4. The dashboard carries a compact growth card with the level, a progress bar, the badge
   count, and a link to the full page.
5. A teacher opens **Pertumbuhan** and gets the ranking of the santri in the classes they
   teach, searchable, and can open any of them to see that santri's XP history and badges.
6. An administrator additionally edits the XP each rule awards and manages the badge
   catalogue: name, description, icon, criterion, threshold, and whether it is active.

## Scope decisions

- **The ledger is the source of truth.** `xp_entries` is append-only, and totals, badge
  counters, and the leaderboard are all aggregates of it. Nothing stores a running total,
  so no counter can drift from its history.
- **Levels are derived, not stored.** `levelFor()` in `src/shared/gamification.ts` maps a
  total onto twelve thresholds, shared by server and web. Changing a threshold re-levels
  everyone on the next read with no backfill and no migration.
- **One award per student and source.** `UNIQUE (student_id, source_type, source_id)` makes
  every award idempotent. A regrade, a second attempt, a retried request, and concurrent
  writers all leave exactly one row.
- **XP is awarded in the transaction that earns it**, so a rolled back completion, grade,
  attempt, or review awards nothing. The four sources are the lesson, the submission, the
  assessment activity, and the project.
- **An assessment is rewarded once**, keyed on the activity rather than the attempt, so
  allowing several attempts never multiplies XP.
- **Rule changes are not retroactive.** An entry keeps the points it was granted with, so a
  santri's history stays explainable after an administrator retunes a rule.
- **Individual XP entries are not audited**; the ledger is itself the record. Badge awards
  are audited as system actions, and rule and catalogue changes are audited with their
  actor.
- **Students never see a ranking of their peers.** The leaderboard needs `learning.manage`
  and is limited to the classes the teacher actually teaches. This keeps comparison between
  santri a teaching tool rather than a public scoreboard.
- **No new capabilities.** Reading growth uses `learning.view` with the same scope rules as
  the rest of learning; the leaderboard uses `learning.manage`; rules and the badge
  catalogue use `academic.manage`.
- **Badge icons come from the existing icon set** (`src/web/components/icons.tsx`), checked
  by a database constraint. No image upload is introduced.

## Delivered scope

- Migration `0006_gamification.sql` with a matching down script. It seeds four reward rules
  and eleven badges, and adds no capabilities.
- **XP ledger.** `xp_entries` records student, rule, source, course, and points. Points are
  copied from the rule at award time. The unique source key makes retries free.
- **Award hooks.** `lesson.completed` (10 XP) on first completion, `assignment.graded`
  (25 XP) on the first grade for a submission, `assessment.completed` (30 XP) on the first
  finished attempt of a quiz or exam — including attempts finalized at their deadline by
  the system — and `project.approved` (75 XP) for every member of an approved project.
- **Badges.** A badge is earned when a counted criterion (`xp_total`, `lessons_completed`,
  `assignments_graded`, `assessments_completed`, `projects_approved`) reaches its
  threshold. Evaluation runs immediately after an award; the `badge_awards` primary key
  makes a concurrent double award a no-op. Deactivating a badge hides it from santri who
  have not earned it and leaves it with those who have.
- **Reward rules.** Administrators set each rule between 0 and 1000 XP. The key set is
  closed by a constraint, so a new rewarded event arrives with the migration that teaches
  the server to award it.
- **Growth reads.** A santri reads their own summary; a teacher reads a santri in a class
  they teach; `learning.manage.all` reads anyone. Everything else returns 404.
- **Locking.** Awards take no lock of their own: they run inside the caller's transaction,
  which already holds the course row (`FOR UPDATE`, or `FOR SHARE` for attempt and project
  traffic), and rely on unique constraints instead of serializing students against each
  other.
- **Audit events:** `gamification.badge.awarded` (system actor),
  `gamification.rule.updated`, `gamification.badge.created`, `gamification.badge.updated`.
- **UI:** a new **Pertumbuhan** page (`src/web/pages/Growth.tsx`) with the level card, XP
  history, badge grid, teacher leaderboard with santri drill-in, and the administrator
  rules and catalogue editors; a growth card on the dashboard; a sidebar entry; and the
  `.growth-*`, `.award-*`, `.xp-row`, `.rule-row`, `.dashboard-side`, and `.card-hint`
  classes added to `DESIGN.md`.

## API additions

Mutations require the same origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/gamification/me` | Own level, counters, badges, and the 50 most recent XP entries |
| `GET` | `/api/gamification/students/{id}` | The same summary for a santri a teacher or administrator may see |
| `GET` | `/api/gamification/leaderboard` | Ranking for the actor's classes; `q`, `classId`, and `offset` |
| `GET` | `/api/gamification/rules` | The four reward rules (`academic.manage`) |
| `PATCH` | `/api/gamification/rules/{key}` | Set a rule's XP (`academic.manage`) |
| `GET` | `/api/gamification/badges` | Badge catalogue with award counts (`academic.manage`) |
| `POST` | `/api/gamification/badges` | Create a badge (`academic.manage`) |
| `PATCH` | `/api/gamification/badges/{id}` | Update a badge (`academic.manage`) |

`GET /api/dashboard` gains a `growth` field for santri: level and badge count, or `null`.

## Verified behavior

- PostgreSQL integration (`tests/gamification.integration.test.ts`, 11 tests):
  - **Awards:** lesson completion awards once and opens the first badge; a repeated
    completion adds neither XP nor a second badge audit; grading awards once and a
    correction adds nothing; a second allowed attempt at a quiz adds nothing; an approved
    project rewards every member once and a second review is refused.
  - **Scope:** a santri cannot read another santri (404), a teacher outside the class
    cannot (404), the class teacher and an administrator can, and a malformed id is 400.
  - **Leaderboard:** 403 without `learning.manage`, limited to the teacher's own classes,
    ordered by total, and an invalid class filter is 400.
  - **Rules:** 403 for a teacher, validation of range and rule key, an audited change, and
    a later award using the new points while the earlier entry keeps its own.
  - **Catalogue:** validation of icon and threshold, an audited create, 409 on a duplicate
    key, evaluation of a new badge on the next award, and a deactivated badge staying with
    the santri who earned it.
  - **Rollback:** a rejected audit row rolls back the XP entry and the lesson completion
    together.
  - **Load:** 125 santri awarded concurrently over a four-connection pool each get exactly
    one ledger row and one badge, and three concurrent retries for one santri add nothing.
    The whole file, including schema setup, ran in 0.87 s.
- Unit tests (`tests/gamification.test.ts`, 14 tests): level boundaries, the top level, and
  negative, fractional, and non-finite totals; monotonic thresholds; rule key and points
  validation; badge key slug, icon, criterion, threshold, and text limits; UUID and
  leaderboard filter validation.
- Browser smoke on the prebuilt bundle (`dist/server.js`, `NODE_ENV=test`) against a
  disposable QA database, driven through headless Chrome with the DevTools protocol.
  39 of 39 checks passed:
  - **Santri:** the growth page shows the level, total, progress bar, earned and locked
    badge tiles, and the XP history row for the lesson; the dashboard shows the growth card
    and its link; the sidebar offers Pertumbuhan.
  - **Teacher:** the page opens straight into the leaderboard (one section, so no tab bar),
    lists the enrolled santri with their XP, and opens that santri's history and badges.
  - **Administrator:** the rules editor and badge catalogue render, and saving a rule
    through the form persists it (confirmed by reading the API back).
  - **Layout:** no document-level horizontal scroll and no error alert on the santri growth
    page, santri dashboard, teacher leaderboard, and administrator editors at 1440, 820,
    and 390 px.
- Desktop and phone screenshots of the growth page, the teacher drill-in, the administrator
  editors, and the dashboard were inspected visually.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  **103 passed, 0 failed, 1135 assertions** across Phases 0–5.
- `bun test` without a test database: 54 passed, 61 skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `bun run db:migrate`: applied `0006_gamification.sql` to the local application database.
  From now on the file is immutable; later schema changes need `0007_*`.

## Findings resolved

- **Audit rows address resources by UUID, but a reward rule is keyed by its text key.**
  `reward_rules` gained a `uuid` column beside the key so rule changes audit like every
  other resource.
- **A failed audit on an award returns 400, not 500.** A rejected audit row is a constraint
  violation, which `databaseInputError` maps to 400. The rollback is what matters and is
  asserted; the status is now documented in the test.
- **The first QA run mis-stated two expectations rather than finding defects.** The teacher
  view hides the tab bar when only one section is available, and reward rules sort by key,
  so the script had been editing a different rule from the one it asserted on. Both checks
  were corrected and the run repeated.
- **Badge tiles were first named `.badge-tile`**, colliding with the `.badge` lozenge
  family in `DESIGN.md`. They are now `.award-*`.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, screenshots, script, and generated credentials were removed
after validation.

Phase 5 does not include:

- XP decay, penalties, or manual XP grants and corrections by teachers.
- Streaks, seasons, or any periodic reset of XP.
- Leaderboards visible to santri, public profiles, or sharing outside the school.
- Badge artwork beyond the built-in icon set, and badge categories or tiers.
- Level-up notifications and announcements (Phase 8).
- XP for attendance (Phase 6).

A reward rule set to a high value applies to every later award, so retuning rules mid-term
changes how quickly santri level up; rules are audited so the change stays traceable. XP is
awarded inside the transaction of the event that earns it, which adds one insert and one
badge evaluation to those writes; the 125-santri concurrent run stayed well under a second
locally, but production hardware and WLAN latency still need load testing.
