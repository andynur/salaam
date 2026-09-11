# Phase 2 — Learning Core validation

Validated locally on 2026-09-11 with Bun 1.4.2 and the local PostgreSQL server.
All Phase 2 roadmap exit criteria are implemented and locally verified.

## Delivered scope

- Migration `0003_learning_core.sql` adds the capabilities `learning.view`
  (admin, teacher, student), `learning.manage` (admin, teacher),
  `learning.manage.all` (admin), and `learning.participate` (student). Courses gain a
  `published` flag; existing courses stay drafts until a teacher publishes them.
- Course modules, lessons, and supporting materials. Materials are plain text,
  HTTP/HTTPS links without embedded credentials, or uploaded files. Composite foreign
  keys keep every lesson, material, activity, and material file inside its course.
  Lessons can move to another active module of the same course.
- Layered publishing for courses, modules, lessons, and activities. Students see content
  only when every level is published. Assigned teachers and administrators see drafts.
- Archiving and restoring modules, lessons, materials, and assignments. Archived
  content, and anything inside an archived module or lesson, is hidden from students,
  excluded from progress and dashboard tasks, and accepts no new children, edits,
  completions, or submissions. Completions, submissions, and grades are kept, and
  teachers restore items from a "Konten diarsipkan" section.
- A shared `activities` aggregate whose constraint already accepts every planned kind.
  The Phase 2 API creates, publishes, and archives `assignment` activities only.
- Private file storage for materials and submission attachments:
  - Allowed files are PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, and ZIP, from
    1 byte to 10 MB. The extension must match the leading bytes (TXT must be valid UTF-8
    without NUL bytes); the browser-supplied media type is ignored.
  - Bytes are written to `STORAGE_ROOT/learning-files/<prefix>/<uuid>`. The original
    name only has control characters and path components removed, is stored as display
    metadata, and is never used as a path.
  - `stored_files` records course, uploader, name, media type, size, and SHA-256. A file
    is linked to at most one material or submission.
  - The file is written as the last step inside the database transaction. If the
    transaction fails afterwards, including at commit, the file is removed.
  - Downloads repeat the material or submission access checks and are always served as
    `attachment` with `Content-Security-Policy: sandbox; default-src 'none'`, `nosniff`,
    and `no-store`. Replacing a material file keeps the previous file for history.
- Final submissions: one answer per student and activity, made of text, one file, or
  both. A retry with the same text and file bytes returns the existing submission;
  different content returns 409. The deadline uses the database clock and is rechecked
  after the course lock is acquired. The assignment title, instructions, and deadline
  are locked after the first submission.
- Grading from 0 to 100 (two decimals) with required feedback. Corrections append a new
  grade row, and the editor must supply the grade it read (`previousGradeId`), so
  concurrent corrections fail with 409 instead of overwriting each other. Identical
  retries do not duplicate grades. Grade history is visible to the teacher and the
  owning student.
- Idempotent lesson completion and per-student progress counting only visible lessons
  and assignments. Teachers get a searchable, paginated class table; students see their
  own summary.
- Dashboard "Tugas hari ini": for students, up to five open unsubmitted assignments
  (nearest deadline first) and the next incomplete lesson for up to three courses (most
  recently studied first). For teachers, up to five assignments with ungraded
  submissions, oldest first. Each item links to the lesson, and grading items open the
  submission review. The student course count includes only published courses.
- Every authoring, publishing, archiving, completion, submission, and grading write
  records an audit event in the same transaction.
- Learning JSON bodies are limited to 64 KiB; login and administration bodies keep the
  4 KiB limit. Oversized declared bodies are rejected before reading. The server body
  limit is 10.25 MB so multipart uploads fit.

## API

All routes are under `/api/learning/courses`. Mutations require the same origin.
Resources outside the actor's course scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Courses the actor manages or is enrolled in (published only for students) |
| `GET` | `/{courseId}` | Workspace: modules, lessons, materials, assignments, own submission and progress |
| `POST` / `PATCH` | `/{courseId}/{modules\|lessons\|materials\|activities}[/{id}]` | Create or update content; materials accept multipart with one `file` |
| `POST` | `/{courseId}/publish`, `/{courseId}/{modules\|lessons\|activities}/{id}/publish` | Set `published` |
| `POST` | `/{courseId}/{modules\|lessons\|materials\|activities}/{id}/archive` | Set `archived` (archive or restore) |
| `POST` | `/{courseId}/lessons/{id}/complete` | Student lesson completion |
| `POST` | `/{courseId}/activities/{id}/submit` | Student final submission; JSON or multipart with one `file` |
| `GET` | `/{courseId}/activities/{id}/submissions` | All submissions (teacher) or own submission (student) |
| `POST` | `/{courseId}/submissions/{id}/grade` | Grade or correct a submission |
| `GET` | `/{courseId}/submissions/{id}/grades` | Grade history |
| `GET` | `/{courseId}/materials/{id}/file`, `/{courseId}/submissions/{id}/file` | Authorized file download |
| `GET` | `/{courseId}/progress` | Class progress (teacher) or own row (student) |

Lists accept `q` and `offset` and return `{ items, nextOffset }` with at most 50 rows.
`GET /api/dashboard` now includes the actor's learning `tasks`.

## Verified behavior

- PostgreSQL integration (`tests/learning.integration.test.ts`, 14 tests):
  - Visibility: draft visibility cascading from course to activity, and the student
    dashboard count changing on publish.
  - Core workflow: completion, private submissions, grade corrections, and progress.
  - Boundaries: course, capability, authentication, and origin checks, including
    revoked permissions, plus cross-course parent and resource IDs.
  - Concurrency: identical concurrent submissions produce one row and one audit event;
    the submission deadline is rechecked after waiting for the publish lock; concurrent
    grading has one winner and stale corrections are rejected.
  - Rollback: an audit failure rolls back authoring, submission, and grading.
  - Authoring: updates, validation, and 50-row pagination.
  - Archiving: hidden from students and progress, idempotent, blocks new work and
    edits, restores cleanly, and records audit events.
  - Lesson moves: allowed only into active modules of the same course.
  - Files: upload, byte-exact storage, and sandboxed attachment download; access denied
    to outsiders, other courses, and students once a lesson is unpublished. HTML and
    mismatched content are rejected without leaving rows. Multipart is refused on
    non-upload routes. Replaced files are retained. Database constraints stop
    cross-course and missing file links.
  - File submissions: concurrent identical attachments store one file; a different
    file returns 409. Attachment downloads work only for the owner and the course's
    teacher. An audit failure leaves no row, and the files on disk exactly match the
    committed rows.
  - Dashboard tasks: open assignment, next lesson, and pending grading appear and clear
    after submission, grading, or archiving.
  - Load: 125 students submitting concurrently to one course, sharing a four-connection
    pool, each get exactly one submission and audit event. The whole test file,
    including schema setup, ran in 0.62 s.
- Unit tests (`tests/learning.test.ts`):
  - Validation: link scheme and credential rejection, file material descriptions,
    position/publish/archive input, strict UTC deadlines, grade precision, optional
    submission text, and body limits.
  - Multipart: one `file` field, with duplicate or unexpected file fields rejected.
  - Uploads: allowlist and signature checks (HTML, SVG, spoofed PDF, spoofed JPG, binary
    or invalid UTF-8 TXT, empty, oversized, missing extension, long names) and
    path-component stripping.
  - Storage: file removal after a failed commit, and attachment header encoding.
- Browser smoke on the prebuilt bundle (`dist/server.js`, `NODE_ENV=test`) against a
  disposable QA database, driven through headless Chrome with the DevTools protocol.
  32 of 32 checks passed:
  - Dashboards: the student dashboard lists the open assignment and the next lesson,
    and clears both once they are done. The teacher dashboard lists pending grading,
    its link opens the submission review, and the item clears after grading.
  - Teacher authoring: the teacher uploads a PDF material through the form (file
    picker), archives a material into the archive section, and restores it.
  - Student view: the student sees only published, unarchived content without authoring
    controls. Lesson text containing `<header>` renders literally. The material download
    is an attachment with the original bytes.
  - Student work: the student completes a lesson and submits text plus a PDF attachment
    through the form. The teacher downloads the attachment and saves a grade, and the
    student sees it.
  - Access: a direct URL to a draft course shows the error state.
  - Layout: phone (390 px) and tablet (820 px, with the file editor open) pages have no
    page-level horizontal scroll.
- Desktop, tablet, and phone screenshots of the dashboards, the workspace with the
  archive section, grading, and the submitted attachment were inspected visually.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost/hsi_learning_os_test bun test`:
  **54 passed, 0 failed, 651 assertions**, including real PostgreSQL integration.
- `bun run typecheck`: passed.
- `bun run build`: passed, five production output files.
- `bun run db:migrate`: applied `0003_learning_core.sql` to the local application
  database. From now on the file is immutable; later schema changes need `0004_*`.

## Findings resolved

- The student dashboard counted unpublished courses that the learning list hid. Class
  membership now counts only published courses. The Phase 1 test publishes its course
  before asserting, and the Phase 2 test checks that publishing increments the count.
- The student progress bar rendered in the browser's default accent color. It now uses
  the blue design token explicitly.
- Teachers could not remove mistaken content, and the dashboard task list was an empty
  placeholder. Both are now covered by archiving and learning tasks.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, uploaded QA files, and generated credentials were removed
after validation. Back up PostgreSQL and `STORAGE_ROOT` together (see
`07_DEPLOYMENT_AND_OPERATIONS.md`).

Phase 2 does not include:

- Hard deletion, bulk reordering, or moving materials and assignments between lessons.
- Malware scanning, image previews, or inline rendering of uploaded files.
- Quizzes, exams, surveys, questionnaires, challenges, attempts, rubrics, or timers
  (Phase 3 and later).
- Resubmission, returning work for revision, late-submission exceptions, or deadline
  extensions.
- Rich text or Markdown rendering; content is shown as plain text.
- XP on completion (Phase 5), or calendar deadlines and reminders (Phase 8).

Every course mutation, including student submissions, takes a row lock on the course so
visibility and deadline checks stay consistent. This serializes writes within one
course; 125 concurrent submissions completed well under one second locally, but
production hardware and network latency still need load testing. A crash between
writing a file and committing its row can leave an unreferenced file on disk; it is
harmless and can be cleaned up by a later maintenance job.
