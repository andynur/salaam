# Phase 4 — Project Learning validation

Validated locally on 2026-09-11 with Bun 1.4.2 and the local PostgreSQL server. The
product owner asked for Phase 4 to be completed end to end without a separate scoping
round, so the scope decisions below were made during implementation. They are recorded
here for review before production use.

## Workflow

1. In a lesson, the teacher adds a **challenge**: instructions, an optional submission
   deadline, and either individual work or teams of 2–10 students. Challenges publish and
   archive like other activities.
2. For a team challenge, the teacher forms teams from the enrolled class roster. For an
   individual challenge, each student starts their own project from the lesson; repeated
   starts reopen the same project. A student belongs to at most one project per challenge.
3. The team works on a **Kanban board** (Akan dikerjakan, Sedang dikerjakan, Ditinjau,
   Selesai): cards with a description and an assignee from the team, moved by drag and
   drop or by keyboard-accessible arrow buttons. Every card carries a version, so a stale
   edit or move is refused instead of silently overwriting a teammate.
4. The team writes a result summary, adds an optional HTTP/HTTPS link to the work, and
   submits the project for review before the deadline. The board locks while it is
   being reviewed.
5. The teacher either requests changes, which reopens the board (resubmission is allowed
   after the deadline), or approves the project with a score from 0 to 100. Reviews are
   appended and audited; approval is final.
6. The teacher can place approved projects in the **showcase**, which every signed-in
   user can browse without scores or reviews. Team members add approved projects to
   their **portfolio** with a personal reflection; entries remain theirs after the class
   year ends.

## Scope decisions

- **Challenges** are `challenge` activities on the shared activities table, with one
  `challenge_settings` row: individual work, or teams of 2–10 students. They publish,
  archive, and restore through the existing activity routes. No second activity engine
  is added.
- **Teams are formed by teachers** from the enrolled class roster. Students start their
  own project only for individual challenges. Student-formed teams, invitations, and
  join requests are out of scope, which keeps class rosters visible only to teachers.
- A student belongs to **at most one project per challenge**, enforced by a unique
  constraint.
- The **Kanban board has four fixed columns**: Akan dikerjakan, Sedang dikerjakan,
  Ditinjau, Selesai. Card edits are working notes and are not audited. Project-level
  decisions are audited.
- A **deliverable** is a result summary plus an optional HTTP/HTTPS link. File uploads on
  projects are out of scope.
- A **review** either requests changes or approves the project with a required score from
  0 to 100. Approval is final.
- The **showcase** is readable by every signed-in user while the course and the challenge
  path stay published and unarchived. It shows the title, summary, link, course, and team
  names, but never scores or reviews.
- A **portfolio entry** is personal: a reflection on an approved project, visible only to
  the student. It stays listed after the class year ends or the challenge is archived.
- No new capabilities: `learning.manage` covers authoring, teams, reviews, and showcase
  selection; `learning.participate` covers project work.

## Delivered scope

- Migration `0005_project_learning.sql` with a matching down script.
- **Challenge authoring.** Team mode and size lock once a project exists; the whole
  definition locks once any project has been submitted, so every team is reviewed
  against the same instructions and deadline.
- **Team formation.** Members must be active students enrolled in the course class, and
  team size is checked under a lock on the challenge settings row. Teachers can change
  members until the project is submitted; removing a member unassigns their cards.
- **Individual starts** are idempotent: repeated or concurrent starts return the same
  project (201 new, 200 resumed). Starting after the deadline is refused; teachers can
  still create a project for a student.
- **Board.**
  - Members and course managers create, edit, move, archive, and restore cards.
  - Each card has a version. A stale edit or move returns 409; a retry of a change that
    was already applied returns the current card.
  - Positions stay contiguous per column. Moves renumber the affected columns under the
    project row lock.
  - At most 200 active cards per project; an assignee must be a team member.
  - The board and the project details are editable only while the project is in
    progress or has a revision request.
- **Submission.** Only members submit. A summary is required, and the first submission
  must happen before the deadline; resubmission after a revision request is always
  accepted. Repeated and concurrent submits write one audit event.
- **Review.** Only course managers review, and only a submitted project. Reviews append;
  an identical retry of the latest decision returns it, and a conflicting second decision
  returns 409.
- **Showcase selection** requires an approved project and is idempotent.
- **Portfolio.** Members save a reflection on an approved project. Saving again updates
  it and restores a removed entry.
- **Progress and dashboard.** A challenge counts as done once the student's project has
  been submitted, and as graded once it is approved. Students see open challenges they
  can act on, linked to their board when it exists. Teachers see submitted projects
  waiting for review, grouped by challenge.
- **Locking.** Project writes take the course row `FOR SHARE` and then the project row
  `FOR UPDATE`. Publishing waits for in-flight project writes, but teams do not
  serialize on each other.
- **Audit events:**
  - `challenge.created`, `challenge.updated`
  - `project.created`, `project.updated`, `project.members.updated`
  - `project.submitted`, `project.reviewed`, `project.showcased`, `project.unshowcased`
  - `portfolio.saved`, `portfolio.archived`, `portfolio.restored`
- **UI:**
  - A Challenge proyek card per lesson: editor, team formation from a roster picker,
    and the student's project link or start form.
  - A Projects item in the sidebar and search.
  - A project hub with the project list (status filter, search, challenge filter from
    dashboard links), the showcase, and the student portfolio.
  - A project page with the board and a Ringkasan & review tab: details, instructions,
    review history, team, review form, showcase control, and portfolio form.
  - Every drag action on the board has a keyboard-accessible arrow button. Moves are
    announced through a status region, and focus returns to the moved card.

## API additions

Mutations require the same origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` / `PATCH` | `/api/learning/courses/{courseId}/challenges[/{id}]` | Create or update a challenge |
| `POST` | `/api/learning/courses/{courseId}/challenges/{id}/projects` | Form a team (managers, `memberIds`) or start an individual project (students) |
| `GET` | `/api/projects` (`?q`, `offset`, `status`, `activityId`) | Projects the actor manages or belongs to |
| `GET` | `/api/projects/showcase` | School showcase |
| `GET` | `/api/projects/portfolio` | The student's portfolio entries |
| `GET` / `PATCH` | `/api/projects/{id}` | Project detail, or update title, summary, and link |
| `POST` | `/api/projects/{id}/members` | Replace team members (managers) |
| `POST` | `/api/projects/{id}/tasks` | Create a card |
| `PATCH` | `/api/projects/{id}/tasks/{taskId}` | Edit a card (`version` required) |
| `POST` | `/api/projects/{id}/tasks/{taskId}/move` | Move a card (`status`, `position`, `version`) |
| `POST` | `/api/projects/{id}/tasks/{taskId}/archive` | Archive or restore a card |
| `POST` | `/api/projects/{id}/submit` | Submit for review (members) |
| `POST` | `/api/projects/{id}/reviews` | Approve with a score or request changes (managers) |
| `POST` | `/api/projects/{id}/showcase` | Add to or remove from the showcase (managers) |
| `POST` | `/api/projects/{id}/portfolio` | Save a portfolio reflection (members) |
| `POST` | `/api/projects/{id}/portfolio/archive` | Remove or restore a portfolio entry |

The course workspace response includes `challenges`. Publishing and archiving use
`/activities/{id}/publish` and `/activities/{id}/archive`.

## Verified behavior

- PostgreSQL integration (`tests/project.integration.test.ts`, 6 tests):
  - **Challenges and teams:**
    - Drafts are hidden from students.
    - Students get 403 and unassigned teachers get 404.
    - A team size of 1 is refused.
    - Team formation refuses unenrolled students, teams that are too large, and students
      already on another team.
    - Team settings lock while title changes stay allowed.
    - Member replacement works and is audited, and removed members lose access.
  - **Individual starts:**
    - Two concurrent starts create one project.
    - A student of another class gets 404.
    - A start after the deadline is refused, while resuming is allowed.
    - The one-member limit holds, and a teacher can still create the project.
  - **Board:**
    - Non-members and other teachers get 404; the teacher gets manager access.
    - An assignee outside the team is refused.
    - A move returns the new version, and its retry returns the same result.
    - A stale move or edit returns 409.
    - Column order and positions are correct after moves and archiving.
    - 20 concurrent moves to one column leave positions 0–19.
    - List counts and the challenge filter are correct.
  - **Submission and review:**
    - Submitting without a summary is refused, and an invalid link is refused.
    - Concurrent submits write one audit event, and the board locks while submitted.
    - The student and teacher dashboard tasks appear and disappear at the right time.
    - Progress is 1 submitted / 0 graded before approval.
    - A score is required to approve.
    - A revision request retries idempotently, and a conflicting decision returns 409.
    - Resubmission after the deadline is accepted.
    - Approval with 92.5 locks the board, progress becomes 1 graded, the challenge
      definition locks, and two review and two submission audit events are written.
  - **Showcase and portfolio:**
    - An unapproved project cannot enter the showcase, and students cannot select it.
    - Showcase selection is idempotent and audited once.
    - Students of another class see the tile with `canOpen: false`, no score, and a 404
      on the project page.
    - Non-members, unapproved projects, and teachers are refused portfolio saves.
    - The entry carries the approved score, and removing and restoring it works.
    - Archiving the challenge hides the showcase and the student's project page, while
      the portfolio entry stays with `canOpen: false`.
  - **Load:** 125 students on 25 teams each create and move a card concurrently. Every
    team ends with done positions 0–4, within the 15 s bound.
- Unit tests (`tests/project.test.ts`, 4 tests): challenge, project, member, card, move,
  review, showcase, reflection, and list-filter validation.
- The two Phase 4 test files (10 tests, 141 assertions, including the 125-student run)
  finish in 1.02 s locally.
- Browser smoke on the prebuilt bundle against a disposable QA database, driven through
  headless Chrome with the DevTools protocol. 30 of 30 checks passed:
  - The teacher sees both challenges on the lesson, forms a second team from the roster,
    and sees both teams in the project list.
  - The student dashboard links the challenge task to the board, which renders four
    columns.
  - Quick add creates a card and keeps focus in the input. An arrow button moves a card,
    focus returns to it, and the move is announced. Drag and drop moves a card to
    Selesai.
  - The card editor opens with focus on the title and assigns a teammate.
  - The student saves the summary and link, then submits; the board becomes read-only.
  - The teacher's dashboard review link opens the filtered queue, and the teacher
    requests changes. The student sees the feedback on a reopened board and resubmits.
  - The teacher approves with a score and adds the project to the showcase. The student
    adds it to the portfolio, which shows the score and reflection.
  - A student of another class sees the showcase tile without a project link or score
    and cannot open the project.
  - A second student starts an individual challenge from the lesson and lands on a new
    board.
  - At 820 px and 390 px the board scrolls inside its own container, and the phone
    drawer lists Projects as the active item.
  - 31 page loads at 1440, 820, and 390 px had no document-level horizontal overflow and
    no unexpected alerts.
- Desktop, tablet, and phone screenshots of the lesson challenge card, team form,
  project list, board, card editor, overview, review form, showcase, and portfolio were
  inspected visually.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost/salaam_test bun test`:
  **75 passed, 0 failed, 950 assertions** across Phases 0–4.
- `bun test` without a test database: 37 passed, 48 skipped, 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed, six production output files.
- `bun run db:migrate`: applied `0005_project_learning.sql` to the local application
  database; the file is now immutable.

## Findings resolved

- **Page-wide horizontal scroll.** Visually hidden text in off-screen board columns
  escaped the board's scroll container, because an absolutely positioned element without
  a positioned ancestor resolves against the viewport. This widened the page at 820 px
  and 390 px. `.board` and `.table-scroll` now set `position: relative`.
- **Wrapping link icons.** Icons in text links wrapped below their label; links that
  contain an icon now lay out inline.
- **Hidden initials.** Overlapping avatars hid the next avatar's initials. Earlier
  avatars now stack on top with a smaller overlap.
- **Rollback test.** The Phase 0 rollback test assumed `0004` was the latest migration;
  it now expects `0005` and checks the project tables.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, and generated credentials were removed after validation.

Phase 4 does not include:

- student-formed teams, invitations, or join requests
- custom board columns, WIP limits, labels, per-card due dates, comments, attachments, or
  card activity history
- realtime board sync; teammates' changes appear after the next reload or action
- file uploads as project deliverables
- rubrics, peer review, multiple reviewers, or reopening an approved project
- teacher or parent browsing of student portfolios, public portfolio pages, or export
- XP, badges, and rewards for projects (Phase 5) and notifications (Phase 8)
- project templates or projects spanning several courses

The 125-student board run shared one four-connection pool locally. Production hardware,
WLAN latency, and board usage patterns still need load testing.
