# Phase 34 — Curriculum map validation

Validated locally on 2026-09-13 with Bun 1.4.2 and PostgreSQL 17. The product owner asked for
one Kurikulum menu with the complete, interactive curriculum from `curriculum.csv` for kelas X
and XI, with kelas XII marked as coming soon. They also decided that the CSV is only the
first source: the database is the source of truth because the curriculum will be revised.

## Workflow

1. An administrator opens **Kurikulum** and imports `curriculum.csv` with **Import CSV**, or
   runs `bun run db:seed:curriculum` on the server.
2. Every role picks a grade tab. Kelas X and XI show the program, the semester themes, and
   counts for weeks, phases, and milestones. Kelas XII shows **Segera hadir**.
3. A reader narrows the map by semester, by phase (select or phase chip), or with a live
   search, and expands one week or all weeks to see the objective, materi, praktik, asesmen,
   and source.
4. An administrator revises a week in place (**Ubah pekan**), or edits a grade's program,
   goal, and semester themes and publishes it (**Kelola kelas**). A corrected CSV can be
   imported again at any time.

## Scope decisions

- **The database is the source of truth; the CSV is an import format.** The file stays in
  the gitignored `database/seed/data/` directory. Weeks live in `curriculum_weeks`, and
  revisions happen through the editor or through a re-import, never through a code change.
- **Import is an upsert by `(grade, semester, week)`.** New weeks are created, changed weeks
  get a new version, identical weeks are left alone, and weeks missing from the file are
  kept. Deleting a week is out of scope.
- **Reuse capabilities.** Reading needs `learning.view` (all roles); revising and importing
  need `academic.manage` (admin), because the curriculum is school-wide academic reference
  data rather than one teacher's course.
- **Grades and semester themes are product structure**, seeded by the migration like the
  clubs. Kelas XII is seeded unpublished. A grade opens only when it is published *and* has
  weeks; readers get 404 for an unpublished grade, while managers can prepare it.
- **No pagination for weeks.** A grade holds at most 60 weeks (two semesters of 30), and the
  map needs every week to group phases and filter on the client.
- **Milestones are derived, not stored.** A week counts as a milestone when an assessment item
  names a milestone, capstone, demo day, SKL, mini project, monthly challenge, final, or
  defense.

## Delivered scope

- Migration `0032_curriculum.sql` with a matching down script: `curriculum_grades`,
  `curriculum_semesters`, and `curriculum_weeks` (materi and asesmen as JSON arrays, a
  `version` column, and `UNIQUE (grade, semester, week)`). No new capabilities.
- **Import.** `curriculumCsvInput` parses quoted cells, doubled quotes, line breaks, CRLF, and
  a BOM, and matches columns by header name. `source` is optional, and `objective` is accepted
  for `objectives`. List cells split on `;`, with at most 12 items of 150 characters each.
  Files up to 500 rows and 512 KB. Every rejection names its CSV line, and an invalid file
  writes nothing.
- **Revisions.** Week and grade edits carry the version they were read at. An identical retry
  returns the current row, and any other edit against an older version returns 409.
- **Locking.** An import locks the affected `curriculum_grades` rows `FOR UPDATE` in grade
  order, so concurrent uploads serialize and a retried upload is a no-op. A week edit locks
  its week row, and a grade edit locks its grade row.
- **Audit events:** `curriculum.imported` (only when a week changed),
  `curriculum.week.updated`, `curriculum.grade.updated`, `curriculum.grade.published`, and
  `curriculum.grade.unpublished`. The audit log has a Kurikulum category.
- **CLI:** `bun run db:seed:curriculum [path]` runs the same import with a system actor.
- **UI:** `src/web/pages/Curriculum.tsx` at `/curriculum`, placed after Pembelajaran in the
  sidebar with a new `route` icon.

## API additions

Mutations require the same origin. Unpublished or unknown grades return 404 to readers.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/curriculum` | Grades with program, goal, publish state, week/phase counts, semester themes, and `canManage` |
| `GET` | `/api/curriculum/grades/:grade` | One grade's summary and all of its weeks |
| `PATCH` | `/api/curriculum/grades/:grade` | Revise program, goal, semester themes, and publish state |
| `PATCH` | `/api/curriculum/weeks/:id` | Revise one week |
| `POST` | `/api/curriculum/import` | Multipart `file`: upsert weeks from a CSV and return created, updated, and unchanged counts |

## Verified behavior

- PostgreSQL integration (`tests/curriculum.integration.test.ts`, 9 tests):
  - **Seed and visibility:** X and XI are published, XII is unpublished, `canManage` is set
    only for admins, 401 without a session, and XII is 404 for santri and guru but visible to
    admins.
  - **Import:** 403 for a teacher and for a foreign origin, and 400 with the line number for
    an invalid file, writing nothing. A repeated upload is unchanged, and a revised file
    updates only the changed week. Quoted commas round-trip. Four concurrent uploads create
    each week once.
  - **Revisions:** an identical retry returns the same version, a stale edit and a race
    between two edits from one version get 409, and invalid titles and ids are rejected.
    Publishing XII opens it to santri.
  - **Rollback:** an audit failure rolls back both an import and a week edit.
- Unit tests (`tests/curriculum.test.ts`, 8 tests): CSV parsing, header mapping, per-line
  errors, limits, edit inputs, phase grouping, search, milestone detection, and grade
  availability.
- The real `curriculum.csv` imports as 69 weeks: X semester 1 has 17 weeks in 5 phases, X
  semester 2 has 16 in 5, XI semester 1 has 18 in 4, and XI semester 2 has 18 in 4. A second
  import reported 69 unchanged.
- Browser smoke on the prebuilt bundle against a disposable QA database, driven through
  headless Chrome with the DevTools protocol. 51 of 51 checks passed:
  - Administrator: empty state, CSV import through the file input, 33/10/10 stats for kelas
    X, the XII draft with its manage panel, week expansion, and a week edit that saves and
    reloads.
  - Santri: no manage controls, the revised title visible, and the XII "Segera hadir"
    lozenge. Search, the semester filter (16 weeks), a phase chip (3 weeks, `aria-pressed`),
    reset, and Buka/Tutup semua work. The source link opens in a new tab, XI shows 36 weeks,
    XII shows the coming-soon card, and the `?grade=XI` deep link and sidebar entry work.
  - No horizontal scroll and no error alert at 1440, 820, and 390 px on the XII manage panel,
    the week editor, the fully expanded kelas X map, and the XII coming-soon card.
- Desktop and phone screenshots of the student map, the XII card, and the admin week editor
  were inspected.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  **238 passed, 0 failed, 3070 assertions** across 31 files.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `bun run db:migrate`: applied `0032_curriculum.sql` to the local application database; the
  file is now immutable. `bun run db:seed:curriculum` then imported 69 weeks.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, and generated credentials were removed after validation.

Phase 34 does not include:

- Deleting or renumbering a week (an import keeps weeks missing from the file).
- Linking curriculum weeks to courses, lessons, or activities, or tracking santri progress
  against the map.
- A revision history per week beyond the audit log and the version counter.
- The kelas XII curriculum content itself.
- Switching `database/seed/demo.ts` from reading the CSV to reading the curriculum tables.
