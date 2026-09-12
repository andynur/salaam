# Security and reliability

The security model as implemented, plus the requirements for features not built yet.
The HTTPS proxy behavior and a backup and restore drill were validated locally on
2026-09-12 (see [operations](operations.md)); load testing on school hardware and school
approval of privacy and retention policies are still open.

## Identity and sessions

- Passwords are hashed with Argon2id through `Bun.password`. Login errors are generic.
- A session token is 32 random bytes in base64url. Only its SHA-256 hash is stored in
  `sessions`, with an absolute expiry of `SESSION_TTL_HOURS` (1–168, default 12). No signing
  secret exists.
- The cookie is `HttpOnly; SameSite=Lax; Path=/` with `Max-Age`, plus `Secure` in
  production. Login issues a new token and removes the user's expired sessions; logout
  revokes the session. Tokens never go to `localStorage`.
- Login allows 10 attempts per socket IP per 15 minutes and at most two concurrent password
  checks. Behind a proxy every client shares one address, so configure per-client
  throttling at the proxy; forwarded IP headers are not trusted.
- An administrator with `admin.users.manage` recovers a locked-out account by setting a new
  password (`POST /api/admin/users/:id/password`, 12–128 characters). The new hash and the
  deletion of **every** session of that account happen in one transaction, so a stolen or
  shared session cannot outlive the reset, and the change is audited as
  `user.password_reset`. Self-recovery, email links, and one-time tokens do not exist:
  recovery is an in-person administrative act, and the new password is handed over
  privately. An administrator who resets their own account is signed out by the same rule.
- No default account ships. The first administrator comes from `db:bootstrap-admin`, which
  is serialized and refuses when an administrator exists, or from the development-only
  `db:seed`.

## Authorization and audit

- Every protected route checks a capability on the server, and role names never bypass it.
  Scope checks return 404 outside the actor's courses, projects, and enrollments.
- Identity, academic, authoring, publishing, archiving, submission, grading, assessment,
  and project decisions call `recordAudit` in the same transaction, so a failed audit write
  rolls the change back. Events store actor, event, resource, and request ID, never
  passwords, hashes, or tokens. An event without an actor is a system action such as
  deadline finalization.
- Kanban card edits are working notes and are not audited.
- XP is awarded inside the transaction that records the event it rewards, so a rolled back
  completion, grade, attempt, or review awards nothing. Individual ledger entries are not
  audited separately — the append-only ledger is itself the record — while each badge award
  is audited as a system action. Reward rules and the badge catalogue are administration:
  they require `academic.manage` and every change is audited. Changing a rule never rewrites
  past entries, so a student's history stays explainable.

## Request safety

- Non-GET API requests require `Origin` to equal `APP_BASE_URL` and reject
  `Sec-Fetch-Site: cross-site`.
- JSON bodies require `application/json` and are capped before parsing: 4 KiB for login and
  administration, 16 KiB for attendance, and 64 KiB for learning and project routes. Multipart is accepted only on the
  upload routes, with a single `file` field. The server-wide body limit is 10.25 MB.
- SQL uses tagged-template parameters only; raw SQL is limited to version-controlled
  migration files. Identifiers, dates, and enumerations are validated explicitly, and
  constraints back every rule.
- Errors return a code, an Indonesian message, and a request ID. Raw database errors and
  stack traces never reach the client.

## HTTP headers

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
and, in production, `Strict-Transport-Security`. API responses add `Cache-Control: no-store`.
The HTML shell adds a Content-Security-Policy that allows only same-origin scripts, styles,
and connections plus `data:` images, and forbids framing, plugins, and foreign form targets.

## Files

- Allowed uploads are PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, and ZIP, from 1 byte to
  10 MB. The extension must match the leading bytes, and TXT must be valid UTF-8 without NUL
  bytes. The browser-supplied media type is ignored.
- Bytes are stored under generated paths. The original name, with control characters and
  path components removed, is display metadata only.
- Downloads repeat the access checks and are sent as `attachment` with
  `Content-Security-Policy: sandbox; default-src 'none'`, `nosniff`, and `no-store`.
- There is no malware scanning or inline preview yet.

## Public lesson pages

- A course manager turns sharing on for one lesson. The server issues a 22-character
  opaque slug from `crypto.getRandomValues`; nothing else identifies the page, and the
  slug is the only credential.
- `/share/lessons/:slug` accepts GET only, reads no session, and is dispatched before any
  authenticated route. It renders the lesson title, body, cover, course, class, and term —
  never materials, activities, submissions, or any student data.
- The page carries `Content-Security-Policy: default-src 'none'; img-src 'self';
  style-src 'unsafe-inline'`, `robots: noindex, nofollow`, no script, and `no-store`. Links
  inside a document are limited to absolute HTTP(S) URLs and carry
  `rel="noopener noreferrer nofollow"`; everything else in the Markdown is escaped.
- Stopping the share clears the slug, so the link 404s immediately; sharing again issues a
  new slug rather than reviving the old one. Archiving the lesson also takes the page down.
  Sharing and unsharing are audited.

## Assessment integrity

The server clock fixes every attempt's deadline. A database constraint requires an exam to
have exactly one attempt, a time limit, and a closing time. Attempts snapshot questions and
answer keys; keys reach students only when results are visible. Autosave accepts only a
higher revision, and final submission is idempotent.

## Logging

Each log entry is one JSON line with allowlisted fields: timestamp, level, event, request
ID, status, and duration. Never log request bodies, cookies, tokens, passwords, or raw SQL
errors.

## Requirements for planned features

- **Coding challenges** use `src/modules/coding` only as an external-runner client. Source is
  capped at 32 KiB, stdin at 8 KiB, runner output at 64 KiB, wall time at 5 seconds, CPU
  time at 2 seconds, memory at 128 MiB, and processes at one. Every request carries the
  required `network: none` policy. The external runner must enforce these values with an OS
  isolation mechanism and pass the review checklist in the Phase 10 record; the application
  process never executes student code. With no `CODE_RUNNER_URL` and token, the boundary is
  unavailable rather than falling back to local execution.
- **Biometrics and face recognition** stay outside V1.
- **Attendance bulk marking** is manager-only, limited to 500 roster rows per request, and
  requires the latest predecessor for every row. The session lock and transaction boundary
  prevent partial writes; private session and attendance notes remain hidden from students.
- **Student import** is administrator-only, limited to 500 rows, and requires a server preview
  before an atomic commit. Initial passwords are accepted only over same-origin HTTPS in
  production and are never written to audit metadata. Existing matching student accounts are
  reused; import never changes attendance history.
- **Recurring meetings** are limited to 52 materialized sessions and 365 days between starts.
  Each occurrence gets its own roster snapshot and normal session authorization. QR defaults are
  copied into the generated session's window only when a teacher opens that session.
- **Academic lifecycle** operations are administrator-only. Role changes revoke sessions and are
  blocked when role-specific relations would become invalid; the last active administrator cannot
  be demoted or deactivated. Transfers and archive/restore writes are audited and do not delete
  historical attendance or learning records.

## Backups and recovery

Back up PostgreSQL and `STORAGE_ROOT` together to a separate location, restrict and encrypt
backup access, monitor job status, and run restore drills before production use. Define
retention and recovery objectives before enabling destructive cleanup. See
[operations](operations.md).

## Classroom attendance

Attendance references a roster entry in a defined course session. Teachers manage only
assigned courses unless granted `learning.manage.all`. Students receive only their own
rows and counts, and never private notes or correction reasons. Mutations require same
origin and transactional audit; attendance and session-change histories are append-only
through the application. They remain restricted school records in database backups.

Attendance JSON bodies are capped at 16 KiB, titles at 150 characters, notes at 2,000,
reasons at 500, session duration at 24 hours, and rosters at 500 active students. Lists
return 50 records per page. No new capability, dependency, file upload, or credential type
is introduced.

## Reporting and exports

Reporting is read-only and adds no table. `reports.view` (administrators and teachers) opens
the cross-course reports; the audit report keeps `audit.view`, so only administrators read
it. A teacher's scope is applied inside every query — `learning.manage.all` or a teaching
assignment — so a report can only aggregate courses that actor already manages, and santri
have no access at all. Reads run in one repeatable-read, read-only transaction and cannot
change data.

An export repeats its report's query with a hard 5,000-row cap and writes one
`report.<kind>.exported` audit row carrying the narrowest scoped identifier and nothing
about the exported rows. CSV output is UTF-8 with a BOM, served as an attachment with
`Content-Type: text/csv; charset=utf-8` and a sanitized filename; the response, like every
other, carries `Cache-Control: no-store`. Cells are quoted and internal quotes doubled, and
a cell beginning with `=`, `+`, `-`, `@`, a tab, or a carriage return is prefixed with an
apostrophe so a spreadsheet shows school data as text instead of evaluating it as a formula.
Exports are a real disclosure surface: a CSV leaves the audit trail once it is downloaded,
so the row cap, the scope filter, and the audit row are the controls that remain.

## QR check-in

A check-in code is a proof of presence, never a credential. It authenticates nobody: the
santri's own login session identifies them, and the server independently rechecks
`learning.participate`, course access, roster membership, session status, and window status
on every check-in. A code alone therefore grants no access to anything.

Codes are ten characters of `crypto.getRandomValues` entropy over a 32-symbol alphabet
(about 50 bits), short-lived, and scoped to one session. Only the SHA-256 hex digest is
stored, so a database copy or backup cannot replay a live code; the plaintext exists only in
the response to the manager who minted it and on the classroom display. Rotation is
15–300 seconds, the outgoing code keeps a ten-second grace, a window issues at most 2,000
codes, and stopping the window retires every live code at once. Check-in bodies are capped
at 4 KiB.

One check-in per santri per session is enforced by a primary key, and a check-in may only
start an attendance chain — it can never overwrite or amend a teacher's record. Windows
started and stopped are audited, and each check-in writes a `classroom.attendance.checked_in`
event; minting a code is display traffic and is not audited. No new capability, dependency,
file upload, or credential type is introduced. Camera scanning uses the browser's own
`BarcodeDetector` and needs HTTPS or localhost; the typed code is always available instead.

A santri in the room can still photograph the displayed code and pass it to an absent
classmate inside the rotation interval. Rotation bounds that window and stopping it closes
the window entirely, but the teacher's correction remains the authority on who attended.

WebSocket upgrades require the exact application Origin, a valid login session, and access
to the requested course/session. The process permits at most 512 connections and four per
account, with 256-byte incoming payloads and 4 KiB backpressure limits. Client application
messages close the read-only connection. Authorization is rechecked before invalidations
and every ten seconds; revoked sessions, inactive accounts, unpublished courses, and lost
scope close the socket. Messages contain only `{ "type": "changed" }`; HTTP refetches
repeat authorization. Connected sockets are not proof of classroom attendance.

## Calendar and notifications

Personal calendar and inbox APIs require `dashboard:view`; learning sources additionally
resolve current learning capabilities, course publication, membership and attendance roster.
School-event management requires `academic.manage`; course events use `courseAccess` with
`learning.manage`. Users cannot choose another recipient when reading an inbox, saving
preferences or marking a notification read. Source access is resolved again on every inbox
read and receipt, so revocation or archival hides old titles and links.

JSON bodies are capped at 16 KiB; event descriptions at 2,000 characters, titles at 150,
date ranges and event duration at 93 days, and lists at 50 items. Mutations require the exact
application Origin. Course scope cannot be moved by editing an event; stale versions fail
with 409. Reminder and QR notices contain source links, never check-in codes or credentials.
Delivery is in-app only. Worker failures log a fixed event without source text, recipient
information or exception payloads. No external provider receives school data.

## Clubs

- `club.view` opens the club workspace and `club.manage` allows mentor actions; a teacher
  manages only clubs where they are an active mentor, while `learning.manage.all` manages
  every club. Any other actor receives 404, so a club's existence is not revealed.
- Creating, archiving, and restoring a club needs `club.manage` **and**
  `learning.manage.all` together — an administrator. A mentor who manages a club cannot
  create or archive one (403). An archived club is read-only: it disappears from every
  member's list, its detail is 404 for them, and every manage mutation answers 409
  `CLUB_ARCHIVED` until an administrator restores it. There is no route that deletes a club.
- Club membership carries no capability of its own. Adding a mentor requires the account to
  hold `learning.manage` and a member `learning.participate`, checked against
  `role_permissions` at the time of the change; anything else is rejected with 400.
- Every club tab re-applies the scope rule of the module it reads, so membership never
  substitutes for course enrolment or a teaching assignment: an unenrolled member sees an
  empty workspace, and linking a course requires the mentor to manage that course.
- A club always keeps at least one active mentor; removing the last one returns 409.
- Club profile, goal, membership, publication, and course-link changes are audited in the
  same transaction as the write (`club.created`, `club.archived`, `club.restored`,
  `club.updated`, `club.published`, `club.unpublished`,
  `club.goals.updated`, `club.member.added`, `club.member.removed`, `club.course.linked`,
  `club.course.unlinked`), so a failed audit rolls the change back. Club reads are not
  audited; the underlying modules audit their own writes.
- Club routes add no public surface: every endpoint requires a session, and non-GET
  requests require the same origin.
