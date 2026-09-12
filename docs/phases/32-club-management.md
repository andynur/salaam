# Phase 32 — Club management

## Scope decisions

- Club is an orchestration layer, not a second LMS. A club owns four small tables — the
  club profile, its goals, its membership, and the courses it links — and every other
  surface it shows is read through the existing learning, activity, project, attendance,
  and gamification modules.
- The school's three clubs — `Coders Club` (programming), `Builders Club` (UI/UX, web
  design, product development), and `Multimedia Club` (photography, videography, vlog,
  social media, content creation) — are seeded by migrations with their purpose, learning
  direction, program, and six goals each in Indonesian. Club definitions are product
  structure, like roles and badges; membership and linked courses are school data. Mentors
  edit that copy from the workspace afterwards.
- The club directory (creating a club, archiving it, restoring it) is administrator work:
  it needs `club.manage` **and** `learning.manage.all`, the pair an administrator holds.
  A mentor manages the club they lead, not the list of clubs the school runs. No new
  capability was added for it.
- Archive is the club's delete. Rows are kept so membership, linked courses, projects, and
  audit history stay explainable; an archived club leaves every member's directory, is
  refused by every manage mutation (409 `CLUB_ARCHIVED`), and only an administrator can
  restore it.
- Membership reuses SALAAM accounts and capabilities instead of a club identity: a mentor
  must hold `learning.manage`, a member `learning.participate`. The club grants neither.
- Club membership never widens course access. A linked course is only visible to a member
  who is enrolled in its class (and to the teacher who is assigned to it), so an outsider
  added to a club sees an empty workspace.
- Linking a course goes through `courseAccess(…, "manage")`, so a mentor can attach only a
  course they already teach; administrators (`learning.manage.all`) manage every club.
- The learning flow `Belajar → Berlatih → Challenge → Membangun → Review → Showcase →
  Bertumbuh` is presentation only (`clubFlow` in `src/shared/club.ts`); it names existing
  surfaces rather than adding stages with state.

## Delivered

- Migration `0028_club_management.sql` with a matching down script: `clubs`, `club_goals`,
  `club_members` (with `removed_at` so history survives), and `club_courses`, plus the new
  capabilities `club.view` (admin, teacher, student) and `club.manage` (admin, teacher).
  The migration seeds `Coders Club` and its six goals.
- Migration `0030_club_directory.sql` with a matching down script seeds `Builders Club` and
  `Multimedia Club` with their profiles and six goals each, so a fresh database already
  shows the school's three active clubs.
- `GET /api/clubs` lists the clubs an actor may open: the clubs they mentor (or all, with
  `learning.manage.all`), plus published clubs where they hold an active membership.
  Everything else is 404, as elsewhere in SALAAM.
- `GET /api/clubs/:id` returns the overview — profile copy, goals, mentor list, membership
  counts, and statistics derived from the linked courses the actor can already see.
- Tab endpoints read existing rows: `…/courses` (linked courses with lesson, activity and
  challenge counts), `…/challenges` (the per-course challenge query reused across the
  club's courses), `…/projects` (the project list filtered by `clubId`), `…/meetings`
  (classroom sessions, manager-only notes), `…/members`, `…/candidates` (manager only), and
  `…/progress` (XP, level, badges, lessons completed, approved projects per member).
- Administrator actions: `POST /api/clubs` (create — the slug is derived from the name when
  it is left empty, a duplicate slug is 409) and `POST /api/clubs/:id/archive` (archive or
  restore, idempotent). `GET /api/clubs?archived=1` adds archived clubs to the list.
- Mentor actions: `PATCH /api/clubs/:id` (profile), `POST …/publish`, `POST …/goals`
  (whole ordered list, maximum 20), `POST …/members` (add, change role, or remove — the
  last active mentor cannot be removed, 409 `LAST_MENTOR`), and `POST …/courses`
  (link/unlink, idempotent).
- **Locking.** Every club mutation locks the club row `FOR UPDATE` first; course linking
  then takes the course lock through `courseAccess(…, "manage", true)`. Reads that must be
  self-consistent (overview, tabs) run in one `REPEATABLE READ READ ONLY` transaction.
- **Audit events:** `club.created`, `club.archived`, `club.restored`, `club.updated`,
  `club.published`, `club.unpublished`, `club.goals.updated`, `club.member.added`, `club.member.removed`, `club.course.linked`,
  `club.course.unlinked`.
- **UI:** a `Club` entry in the primary navigation, a club directory at `/club`, and the
  workspace of one club at `/club?club=<id>` with the tabs Ringkasan, Pembelajaran,
  Pertemuan, Challenge, Projects, Anggota, and Progres. The directory reuses the course-card
  grid: one card per club with its tagline, mentor, member and course counts, and its state
  (Anggota/Mentor, Draft, Arsip). An administrator also gets the `Klub baru` form and the
  `Tampilkan arsip` filter there, and the archive or restore control inside the club's
  manage panel; an archived club offers nothing but restore. Mentors get the inline manage
  panel (profile, goals, publication), a course linker, and a candidate list; students get
  the same workspace read-only. New CSS: `.club-tile`, `.club-tile-meta`, `.club-flow`,
  `.club-goals`, `.club-goal`, `.club-switch`, `.club-members`, `.club-list`.
- The navigation icon is the generic `club` banner, not the earlier `code` glyph: the
  workspace serves design and multimedia clubs as much as programming.
- **Demo data** (`database/seed/demo.ts`): the three JavaScript courses are linked to Coders
  Club, and two further courses — `Desain Produk Digital – X RPL 1` and `Multimedia dan
  Konten Kreatif – XI RPL 1` — are seeded with lessons, completions, an assignment with
  graded submissions, a team challenge with projects and reviews, and five classroom
  sessions each, then linked to Builders Club and Multimedia Club. Membership follows the
  classes those courses belong to: 30 santri memberships in total, of which seven santri
  belong to two clubs, so progress, challenge, and project tabs differ per club and per
  student. XP and badges follow from the ordinary award path, as for every other course.

## API additions

Mutations require the same origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/clubs` | Clubs the actor mentors or belongs to (`?archived=1` includes archived) |
| `POST` | `/api/clubs` | Create a club (administrator) |
| `POST` | `/api/clubs/:id/archive` | Archive or restore a club (administrator) |
| `GET` | `/api/clubs/:id` | Overview: profile, goals, mentors, counts, statistics |
| `GET` | `/api/clubs/:id/courses` | Linked courses the actor may already see |
| `GET` | `/api/clubs/:id/challenges` | Challenges of the club's courses |
| `GET` | `/api/clubs/:id/projects` | Projects of the club's courses |
| `GET` | `/api/clubs/:id/meetings` | Classroom sessions of the club's courses |
| `GET` | `/api/clubs/:id/members` | Active mentors and members |
| `GET` | `/api/clubs/:id/candidates` | Addable people from linked courses (manager only) |
| `GET` | `/api/clubs/:id/progress` | XP, level, badges, and completion per member |
| `PATCH` | `/api/clubs/:id` | Edit name, tagline, purpose, direction, program |
| `POST` | `/api/clubs/:id/publish` | Publish or unpublish the club |
| `POST` | `/api/clubs/:id/goals` | Replace the ordered goal list |
| `POST` | `/api/clubs/:id/members` | Add, change, or remove one membership |
| `POST` | `/api/clubs/:id/courses` | Link or unlink one course |

## Verified behavior

- PostgreSQL integration (`tests/club.integration.test.ts`, 9 tests): the three seeded
  clubs and their goals; managers-only visibility before membership exists; membership capability rules
  (a student cannot be a mentor, a teacher cannot be a member), idempotent membership
  writes, removal, and the last-mentor 409; an unpublished club hidden from members;
  course linking bound to the teaching assignment, idempotent, and refused for a course the
  mentor does not teach; every tab reading real learning, challenge, project, meeting and
  XP rows; a club member who is not enrolled seeing an empty workspace; a classmate who is
  not a member getting 404; validation, cross-origin refusal, 405, and rollback when the
  audit write fails; the directory rules — a mentor and a student refused club creation
  (403), a created club arriving as a draft with the derived slug, a duplicate slug 409,
  archiving refused for a mentor, an archived club leaving both the administrator's and the
  member's directory while `?archived=1` shows it to the administrator only, every manage
  mutation on it answering 409 `CLUB_ARCHIVED`, an idempotent restore bringing membership
  back, and the audit trail `club.created → club.published → club.archived → club.restored
  → club.updated`; and 403 for an actor without `club.view`.
- Unit tests (`tests/club.test.ts`, 7 tests): profile, creation (slug derivation and shape),
  archive flag, goal-list, membership, and course link validation, plus the fixed
  learning-flow constant.
- `tests/database.integration.test.ts` covers the rollback of `0030_club_directory.sql`
  (the two extra clubs disappear, Coders Club stays) and of `0028_club_management.sql`,
  including the removal of its tables and capabilities.
- The demo seed was replayed end to end against a throwaway database: 3 active clubs, 30
  santri memberships, 7 santri in two clubs, 5 linked courses, 43 classroom sessions.
- Browser smoke on the prebuilt bundle against a disposable QA database, driven through
  headless Chrome with the DevTools protocol. 95 of 95 checks passed:
  - Mentor: `Club` appears in the sidebar; the workspace opens on Coders Club with its
    purpose, learning-flow strip, seeded goals, and mentor context; the manage panel toggles
    open with the profile form, goal editor, and publication control; every tab shows the
    real row created for the fixture (course, meeting, challenge, project, member,
    progress); the Anggota tab offers the candidate panel with role lozenges and a remove
    action.
  - Student: the same workspace opens read-only — no `Kelola klub` toggle and no course
    linker — and the Pembelajaran, Challenge, Projects, and Progres tabs show the rows the
    student may see.
  - Layout: no sideways scroll and no unexpected alert on every tab for both roles at 1440,
    820, and 390 px.
- A second browser run after the directory work, one Chrome per role, 74 of 74 checks
  passed: the administrator sees three club cards with their counts, creates a club from
  `Klub baru` (it appears as a draft), opens it, archives it from the manage panel, finds it
  again behind `Tampilkan arsip` with the `Arsip` badge, sees only the restore control on
  it, and restores it; a santri who belongs to two clubs sees exactly those two cards with
  no create action and no archive filter, opens one, and gets every tab without an error
  state; no sideways scroll for either role at 1440, 820, and 390 px.
- Desktop and phone screenshots of the directory, the club overview, and the members screen
  were inspected.

## Commands and results

- `bun test tests/club.test.ts tests/club.integration.test.ts` with `TEST_DATABASE_URL`:
  **16 passed, 0 failed**, 202 assertions.
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`: 194 passed, 13 failed.
  Every failure is in the assignment-submission flow of Phases 2, 5, and 9 and comes from
  the submission-form work in progress in the same working tree (migration
  `0029_submission_form_fields.sql`), not from Phase 32; the club, project, assessment,
  attendance, calendar, foundation, and migration suites all pass.
- `bun test` without a test database: 100 passed, 140 skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `bun run db:migrate`: applied `0028_club_management.sql` and `0030_club_directory.sql` to
  the local application database; both files are now immutable.
- `bun database/seed/demo.ts` against a throwaway database: seeded without error and
  reported three active clubs.

## Findings resolved

- **Overview text sat flush against the card edge.** The narrative paragraphs and the mentor
  list were direct children of the card, so they missed the 20 px body padding the headings
  had. They now sit in one `.club-body` wrapper that carries the padding, reduced to 16 px
  below 760 px.
- **The candidate empty state blamed the wrong cause.** It always told a mentor to link a
  course, even when the list was empty because everyone in the linked courses was already a
  member. The copy now names both cases and a search that matched nothing.

- **An archived club stayed open in the workspace.** Archiving a club removed it from the
  list while its id was still selected, so toggling `Tampilkan arsip` jumped straight back
  into the archived workspace. The page now falls back to the directory and clears the
  `club` query parameter whenever the selected club leaves the list — which also covers a
  membership that ends while the workspace is open.

## Boundaries

Phase 32 does not include:

- A club LMS: no club-owned assignment, challenge, project, attendance, gamification, or
  portfolio engine. Every club surface reads rows the existing modules wrote.
- Competition management: no registration, tryout engine, ranking, or OSN workflow.
- No coding judge or sandboxed execution, AI mentor, chat, video meeting, face recognition,
  or parent-facing club portal.
- No club-level scheduling: recurring meetings are created in Kehadiran on a club course.
- The challenge tab covers the first 25 linked courses the actor can see; clubs in scope
  link a handful of courses, and the cap keeps the per-course reuse bounded.
- Clubs are created and archived, never deleted: there is no destructive route, and a club
  with history stays in the database.
- Club membership is still assigned by a mentor or an administrator. There is no
  self-service join, application, or approval flow.
