# Architecture

SALAAM is a modular monolith. One Bun process serves the API and the React single-page
application, and PostgreSQL is the source of truth. There is no backend framework, ORM,
cache, queue, or second service; add a broker or multi-instance coordination only when a
measured operational requirement exists.

## Layout

| Path | Role |
| --- | --- |
| `src/server.ts` | Loads config, opens the pool, wires routers, serves SPA routes and brand assets, shuts down |
| `src/core/http.ts` | Request pipeline and top-level dispatch |
| `src/core/*-http.ts` | Routers: `foundation` (`/api/admin`), `learning` (`/api/learning/courses`), `project` (`/api/projects`), `gamification` (`/api/gamification`), `attendance` (`/api/attendance`), `reporting` (`/api/reports`) |
| `src/core/validation.ts` | Body parsing and field validators |
| `src/core/{auth,permissions,audit,storage,database,config,errors}` | Platform services |
| `src/modules/users`, `src/modules/academic` | Account provisioning, academic structure, dashboard summary |
| `src/modules/learning` | Course access, modules, lessons, materials, publishing, archiving, progress, dashboard tasks |
| `src/modules/activities` | Assignments, submissions, grading |
| `src/modules/assessments` | Question bank, quiz and exam settings, attempts, scoring, adjustments |
| `src/modules/projects` | Challenges, projects and teams, boards, reviews, showcase, portfolio |
| `src/modules/attendance` | Meetings, recurring series, roster snapshots, attendance revisions, reports, QR check-in windows and codes |
| `src/modules/gamification` | XP ledger and badge awards, reward rules, growth summaries, leaderboard |
| `src/modules/reporting` | Cross-course report queries, filter parsing, CSV encoding |
| `src/modules/coding` | External execution contract, policy limits, and fail-closed runner adapter |
| `src/shared/` | Types used by both server and web |
| `src/web/` | SPA: `main.tsx`, `layouts/`, `pages/`, `components/`, `lib/`, `styles/app.css` |
| `database/migrations/` | Ordered SQL migrations with `down/` scripts |
| `storage/` | Default private storage root; never served |

## Request flow

1. `Bun.serve` matches static routes first: SPA paths such as `/dashboard`,
   `/learning/courses/:id`, and `/projects/:id` return the bundled `index.html`, and brand
   assets return fixed files. Everything else goes to `fetch`.
2. `createHttpHandler` assigns a request ID and answers `/health/live`, `/health/ready`, and
   `/api/auth/*` itself. Login is same-origin, rate limited, and capped at two concurrent
   password checks.
3. For `/api/learning/`, `/api/projects`, and `/api/admin/`, non-GET requests must pass
   `requireSameOrigin`. The handler resolves the session actor and calls the router.
4. The router checks the base capability, splits the path, parses the body (`jsonObject`
   with a 64 KiB limit for learning and projects, 16 KiB for attendance sessions, and 4 KiB elsewhere (QR check-in included); `multipartInput` only
   for material uploads and assignment submissions), and calls a service inside
   `databaseInputError`, which turns constraint violations into 409 or 400.
5. The service validates input with its module's `input.ts`, checks scope, and runs SQL in
   a transaction.
6. Errors become `{ error: { code, message, requestId } }`. Every response gets security
   headers, `X-Request-ID`, and `Cache-Control: no-store`, and produces one structured log
   line.

## Authorization

- Users hold roles (`admin`, `teacher`, `student`), and roles grant capabilities through
  `role_permissions`. Code checks capabilities, never role names. The `Actor` carries `id`,
  `displayName`, `roles`, and `permissions`.
- Capabilities: `dashboard:view` (all roles); `admin.users.manage` (admin; it also covers
  account recovery through `POST /api/admin/users/:id/password`, which rewrites the hash,
  deletes every session of that account and audits `user.password_reset` in one
  transaction), `academic.manage`, and `audit.view` (admin); `learning.view` (all roles); `learning.manage` (admin, teacher);
  `learning.manage.all` (admin); `learning.participate` (student); `reports.view` (admin,
  teacher) for cross-course reports and their CSV exports.
- Course scope comes from `courseAccess`. *Manage* needs `learning.manage` plus a teaching
  assignment or `learning.manage.all`. *Participate* needs enrollment in the course's class
  and a published course. *View* accepts either. Failing scope returns 404, so the API does
  not reveal whether a resource exists. Project routes resolve the course from the project
  and apply the same rules.

## Domain model

| Migration | Tables |
| --- | --- |
| `0001_identity` | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `sessions`, `audit_logs` |
| `0002_academic_foundation` | `user_profiles`, `academic_years`, `terms`, `classes`, `class_members`, `subjects`, `courses`, `teaching_assignments` |
| `0003_learning_core` | `course_modules`, `lessons`, `stored_files`, `lesson_materials`, `activities`, `submissions`, `submission_grades`, `lesson_completions` |
| `0013_submission_lifecycle` | submission revision/status fields, `submission_returns`, `submission_deadline_exceptions` |
| `0014_assessment_written_answers` | written question types, `attempt_answers.answer_text`, `attempt_question_grades` |
| `0004_assessment_engine` | `questions`, `assessment_settings`, `assessment_questions`, `attempts`, `attempt_questions`, `attempt_answers`, `attempt_score_adjustments` |
| `0005_project_learning` | `challenge_settings`, `projects`, `project_members`, `project_tasks`, `project_reviews`, `portfolio_entries` |
| `0006_gamification` | `reward_rules`, `xp_entries`, `badges`, `badge_awards` |
| `0007_attendance` | `classroom_sessions`, `classroom_roster`, `attendance_records`, `classroom_session_events` |
| `0008_qr_attendance` | `attendance_checkin_windows`, `attendance_checkin_codes`, `attendance_checkins` |
| `0009_reporting` | No table: the `reports.view` capability and report-query indexes |
| `0011_roster_meeting_series` | `classroom_meeting_series` and recurring-session fields on `classroom_sessions` |

- **Academic:** a course joins a class, a term, and a subject within one academic year;
  composite foreign keys keep classes and terms in the same year. Teachers link to courses
  through `teaching_assignments`, students to classes through `class_members`. Profiles
  store a NIS or employee identifier that is unique per role.
- **Learning:** Course → Module → Lesson → Material or Activity. Composite foreign keys on
  `course_id` keep every descendant and stored file inside its course.

### Activity Engine

Assignments, quizzes, exams, and challenges are rows in `activities`, distinguished by
`kind`; the kind constraint already accepts the planned kinds. Kind-specific configuration
lives in a settings table keyed by `activity_id` (`assessment_settings`,
`challenge_settings`). All kinds share lesson placement, publishing and archiving through
`/activities/{id}/publish` and `/activities/{id}/archive`, progress, and dashboard tasks.
Work records hang off the activity: `submissions` for assignments, `attempts` for quizzes
and exams, `projects` for challenges. A new kind extends this model; it never gets a
parallel engine.

### Gamification

`xp_entries` is an append-only ledger and the only source of truth for XP: totals, the
counters behind badges, and the leaderboard are all aggregates of it. Every award runs in
the transaction that records the event it rewards, so a rolled back completion, grade,
attempt, or review leaves no XP. `UNIQUE (student_id, source_type, source_id)` makes awards
idempotent — a regrade, a second attempt, a retried request, and concurrent writers all
produce one row — and an entry keeps the points it was granted with, so changing a reward
rule only affects later awards. Levels are not stored: `levelFor()` in
`src/shared/gamification.ts` derives them from the total, so changing a threshold re-levels
everyone without a backfill. Badges are evaluated right after an award; the
`badge_awards` primary key makes a concurrent double award a no-op, and each new badge is
audited as a system event.

## Lifecycle rules

- **Layered publishing.** Students see an item only when its course, module, lesson, and
  activity are all published and none of them is archived. Managers also see drafts.
- **Archive instead of delete.** Modules, lessons, materials, activities, questions, board
  cards, and portfolio entries are archived and can be restored. Archived paths accept no
  new work.
- **Lock after first use.** An assignment's title, instructions, and deadline lock after the
  first submission. An assessment's settings and question list, and the questions it uses,
  lock after the first attempt. A challenge's team settings lock once a project exists, and
  the whole definition locks once a project is submitted.
- **Assignment revisions.** A returned submission can be resubmitted. The current revision is
  graded, while prior return and grade rows remain append-only history.
- **Append-only history.** Grades, score adjustments, and project reviews append rows and
  the latest row wins. Editors send the ID they read (`previousGradeId`,
  `previousAdjustmentId`), so stale corrections fail with 409.

## Concurrency and idempotency

- Course mutations lock the course row `FOR UPDATE` first, so visibility and deadline checks
  see one consistent state. Attempt traffic and project writes take the course row
  `FOR SHARE` and then lock their own row; publishing still waits for them, but students do
  not serialize on each other.
- Uniqueness makes retries safe: one submission per student and activity, one open attempt
  per student (a partial unique index plus an advisory lock), and one project per student
  per challenge. An identical retry returns the existing result; different content returns
  409.
- Board cards carry a `version`, and moves renumber positions under the project row lock.
- Attempts past their deadline are finalized lazily with their saved answers the next time
  they are started, read, submitted, or listed.

## Files

`src/core/storage/files.ts` writes uploads to `STORAGE_ROOT/learning-files/<prefix>/<uuid>`
as the last step of the database transaction and removes the file if the transaction fails.
`stored_files` records course, uploader, display name, media type, size, and SHA-256.
Downloads repeat the access checks and are served as sandboxed attachments; see
[security](security.md#files).

## Web client

- `src/web/index.html` loads `main.tsx`, which fetches the session from `/api/auth/me` and
  picks a page from `location.pathname`. There is no router library, so SPA paths must also
  be listed in `src/server.ts`.
- `layouts/Shell.tsx` renders the topbar, sidebar, and global search from
  `layouts/navigation.ts`, filtered by capability.
- Pages live in `pages/`. UI primitives are in `components/ui.tsx`, the data and form kit in
  `components/learning.tsx`, project widgets in `components/projects.tsx`, and icons in
  `components/icons.tsx`.
- `lib/api.ts` wraps `fetch` with same-origin credentials and surfaces the server's
  Indonesian error message. Exam answers made offline are queued in `localStorage` under
  `salaam:attempt:<id>`.
- Styling is one Tailwind CSS v4 stylesheet of semantic classes; see
  [`DESIGN.md`](../DESIGN.md).

## Build and runtime

- `bun run dev` imports `index.html` directly with hot reload. `bun run build`
  (`scripts/build.ts`) bundles server and web into `dist/` with `publicPath: "/"`. The
  bundled server switches its working directory to `dist/` after loading config, because
  Bun resolves prebuilt HTML assets from the working directory.
- The HTML shell is served with a strict Content-Security-Policy; see
  [security](security.md#http-headers).
- The PostgreSQL pool holds four connections. Shutdown stops the server, closes the pool,
  and exits within ten seconds.
- `/api/attendance/live` upgrades authenticated, same-origin connections through native Bun
  WebSocket. Committed session changes trigger invalidations, and clients fetch scoped HTTP
  state. Reconnect also fetches state; PostgreSQL remains authoritative. CRUD stays on HTTP.

## Reporting

Reporting derives every figure from the rows the other modules own; it stores nothing, so
there is no aggregate to keep in step. Scope is a filter rather than a lookup:
`learning.manage.all` covers every course, and anyone else only the courses they are
assigned to teach, so a course outside that set produces no rows instead of a 404. The
audit report keeps `audit.view`.

Each read runs in one `ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction, so the
figures in a report describe one consistent moment and reports never block classroom
writes. Lists page with the usual `LIMIT 51 OFFSET n`; an export repeats the same query
with a 5,000-row cap, is audited as `report.<kind>.exported` with the narrowest scoped
identifier, and returns a UTF-8 CSV attachment whose cells are quoted and, when they start
with a formula trigger, prefixed with an apostrophe. Attendance and completion percentages
reuse the Phase 6 definitions, and attempt scores use the latest Phase 3 adjustment.

## Data conventions

UUID identifiers, `timestamptz` values in UTC, and the configured school timezone for
display. Business invariants are unique and check constraints; indexes follow real query
paths. JSONB is only for flexible configuration or snapshots. Soft deletion is used only
where history must be kept.

## Classroom attendance

Meetings belong to a course independently of assessable activities. Creation snapshots up
to 500 active enrolled students, including their display name and school identifier. Later
profile/enrollment changes do not rewrite the roster. Students need current course access
and a roster entry; they receive only their own attendance and no manager notes or reasons.
Managers reuse course management capabilities and teaching-assignment scope.

Mutations lock the course `FOR UPDATE`, then the session row, and audit in the same
transaction. Reads take a shared course lock to keep visibility and session state consistent.
Creation uses a creator/request-key uniqueness constraint and compares the original payload.
Attendance revisions form a single append-only chain per roster entry with a composite
predecessor foreign key and unique predecessor/first-record indexes. Latest means no child
revision exists. Stale predecessors return 409; exact retries reuse the existing revision.
Session operations use optimistic versions and retain the last operation for exact retries.
Every manual attendance write advances the session version, so closing cannot race a
correction. QR check-ins deliberately do not, because a whole class would then serialize on
one row; their safety comes from the unique first-record index and the check-in primary key.

### QR check-in

A session may carry one check-in window, keyed by `session_id`, that a manager starts only
while the session is open. The window issues rotating codes: ten characters from a
32-symbol alphabet without I, L, O or U, so the same value works as a QR payload and as
something a santri can type. Only the SHA-256 hex digest is stored, the treatment session
tokens get; the plaintext is returned once to the manager who mints it. Minting expires the
outgoing code down to a ten-second grace, issues a replacement valid for
`rotate_seconds + 10`, and stops at 2,000 codes per window. Stopping the window retires
every live code in the same transaction.

A check-in is authenticated as the santri and authorized by `learning.participate`, course
access, and roster membership. The code is only a proof of presence, never a credential.
It writes the first `attendance_records` row for that santri — `present`, or `late` when
the database clock is past the window's threshold — and one `attendance_checkins` row that
makes a repeat return the original result. A santri a teacher has already recorded cannot
check in, and every later correction appends to the chain as usual. Window changes take the
exclusive course and session locks; minting and check-in take shared locks so a class checks
in concurrently while closing or cancelling still waits for in-flight check-ins.

Scheduled meetings open only with a nonempty roster; open meetings close only when every
entry is marked. Reopening a closed meeting and cancelling a scheduled/open meeting require
a reason. Cancelled meetings are terminal. Lifecycle actions and note changes append to
`classroom_session_events`; audit logs contain resource identifiers, never note text.
Manager-only session history reads those append-only events in 50-row pages. Bulk attendance
marks up to 500 selected roster entries in one transaction: the session is locked `FOR UPDATE`,
every predecessor is checked, and any stale row rolls the whole batch back. Identical retries
skip rows whose latest status and note already match, while a successful batch emits
`classroom.attendance.bulk_recorded`. Recurring templates materialize bounded real sessions in
one transaction; every occurrence receives an independent roster snapshot and can be operated
through the normal session lifecycle. Opening a generated occurrence creates its QR window from
the series defaults.
Course reports exclude cancelled sessions. Attendance percentages count present/late over
closed sessions, while unrecorded and status counts include other noncancelled sessions.
Dashboard tasks link managers to open sessions and students to nonexpired scheduled/open
sessions. Attendance does not change learning completion or award XP.

## Calendar and notification delivery

Migration `0010_calendar_notifications` adds `academic_events`, `notification_preferences`,
and `notifications`. `calendar_sources` resolves event, activity, assessment-setting and
classroom timestamps live; `calendar_audience` resolves active users and current capabilities,
teaching assignments, enrollment, publication, and session rosters. Calendar APIs never copy
an activity deadline into a second editable record. The `/api/calendar` and
`/api/notifications` routes are dispatched through `calendar-http.ts`; `/calendar` and
`/notifications` are SPA routes.

Events use existing academic/learning capabilities, immutable course scope, creation keys,
and versioned edits. Course locks precede event locks; creation-key advisory locks also cover
school events. XP awards serialize per student before calculating crossed levels. Level and
QR notification creation runs inside its triggering domain transaction. Preferences and
manual event mutations write their audits in that same transaction.

A worker runs every 15 seconds with a schema-specific PostgreSQL advisory lock, at most
250 generated reminders and 250 deliveries per tick, and five-second statement timeouts.
Pending rows transition to delivered or suppressed. Delivery checks current preferences,
source dates, access and completion; inbox reads and read receipts also resolve current
source access. Reminders deduplicate on recipient/source/time, level notices on recipient
and level, and QR notices on the specific window update. Read receipts preserve their first
timestamp. No broker, provider, copied content snapshot, or runtime dependency is introduced.
See [Phase 8](phases/08-calendar-notifications.md) for limits and API behavior.
