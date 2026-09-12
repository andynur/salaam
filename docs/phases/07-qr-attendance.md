# Phase 7 — QR attendance validation

Validated locally on 2026-09-12 with Bun 1.4.2 and PostgreSQL 17.9. The product owner asked
for the phase to be completed without a scoping round, so the decisions below were made
during implementation and are recorded here.

## Workflow

1. A teacher opens a **Kehadiran** session and starts it, exactly as in Phase 6.
2. In the session, the teacher starts **Absensi QR**, choosing how often the code rotates
   and, optionally, the moment after which a scan counts as late.
3. The screen shows a QR image and the same code in large text. Both change on every
   rotation; the previous code keeps a ten-second grace so a scan already in flight lands.
4. A santri opens the same session and either scans the QR with the device camera or types
   the code. The check-in records their own attendance and shows the result.
5. The teacher watches the tally rise, stops the window when the class has checked in, and
   marks or corrects the remaining santri by hand. Corrections work exactly as before.

## Scope decisions

- **A code proves presence, never identity.** The scanned value is an opaque short-lived
  token. The santri's own authenticated session still identifies them, and the server
  rechecks roster membership, course access, session status, and window status on every
  check-in. A QR value alone grants nothing, so it can never become a reusable credential.
- **Only digests are stored.** `attendance_checkin_codes` holds the SHA-256 hex digest of a
  code, the same treatment session tokens get. The plaintext is returned once, to the
  manager who mints it, and is never written down. A database copy cannot replay a live code.
- **A check-in only ever starts an attendance chain.** It writes the first
  `attendance_records` row for that santri and nothing else. If a teacher has already
  recorded the santri, the check-in is refused with 409 rather than overwriting; later
  teacher corrections append to the chain and always win.
- **One check-in per santri per session.** `attendance_checkins` is keyed by
  `(session_id, student_id)`. A repeat, with any valid or invalid code, returns the original
  status and timestamp instead of writing again.
- **No new capabilities.** Managing a window and minting codes use `learning.manage`;
  checking in uses `learning.participate` through `courseAccess(…, "participate")`.
- **Check-ins do not advance the session version.** Phase 6 bumps `classroom_sessions.version`
  on every manual attendance write, which would serialize a whole class on one row. The
  first-record unique index and the check-in primary key already make concurrent check-ins
  safe, so a check-in takes a shared session lock instead. Session transitions and note
  edits still use the exclusive lock and the version check.
- **No attendance XP.** Phase 5's deferral stands: corrections would otherwise leave
  incorrect awards in the append-only XP ledger.
- **No new dashboard task.** The Phase 6 attendance task already points a santri at the
  current session, which is where the check-in card appears.
- **No QR dependency.** `src/web/lib/qr.ts` encodes version 1, error correction M,
  alphanumeric mode — enough for a ten-character code and nothing more. Scanning uses the
  browser's own `BarcodeDetector`, with the typed code as the fallback and the keyboard path.

## Delivered scope

- Migration `0008_qr_attendance.sql` with a matching down script creates
  `attendance_checkin_windows`, `attendance_checkin_codes`, and `attendance_checkins`.
  Existing `learning.view`, `learning.manage`, and `learning.participate` are reused.
- **Windows.** One window per session, keyed by `session_id`. Starting requires an open
  session. Stopping retires every live code in the same transaction, so a photographed
  display is worthless afterwards. Repeating the identical operation is a retry that
  returns the current state instead of restarting the window.
- **Codes.** Rotation is 15–300 seconds, 30 by default. Minting expires the outgoing code
  down to a ten-second grace and issues a new one valid for `rotateSeconds + 10`. A window
  issues at most 2,000 codes, which bounds an abandoned display.
- **Check-in.** Validated against the digest of a live code scoped to that session. The
  status is `present`, or `late` when the database clock is past the window's `lateAfter`.
- **Visibility.** A manager sees the window settings and the tally. A santri sees only
  whether check-in is open and their own status and timestamp, never the class tally or a
  classmate's row.
- **Limits.** Ten-character codes from a 32-symbol alphabet that excludes I, L, O, and U;
  4 KiB check-in request bodies; 15–300 second rotation; 2,000 codes per window.
- **Locking.** Window changes lock the course and session rows exclusively, matching the
  Phase 6 lifecycle. Minting and check-in take shared locks, so a whole class checks in
  concurrently while closing or cancelling the session still waits for in-flight check-ins.
- **Audit events:** `classroom.checkin.started`, `classroom.checkin.stopped`, and
  `classroom.attendance.checked_in`. Minting a code is not audited: it is high-volume
  display traffic that changes no attendance state.
- **UI:** an **Absensi QR** card on the existing session screen — manager controls with the
  QR, the code, and the tally; a santri camera scanner and manual code form, replaced by
  their recorded status once they have checked in. New CSS lives in the attendance block of
  `styles/app.css`; no dependency was added.

## API additions

All paths are under `/api/attendance/courses/:courseId/sessions/:sessionId`. Mutations
require the application Origin. A missing capability returns 403; a resource outside the
actor's scope returns 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `PATCH` | `/checkin` | Manager starts or stops the window (`action`, `rotateSeconds`, `lateAfter`) |
| `POST` | `/checkin/codes` | Manager mints the next code; the plaintext is returned once |
| `POST` | `/checkin` | Santri checks in with a scanned or typed `code` |

`GET /sessions/:sessionId` now also returns `checkin`: the window as the caller may see it,
and the caller's own check-in when they have one.

## Verified behavior

- PostgreSQL integration (`tests/qr-attendance.integration.test.ts`, 7 tests):
  - **Permissions and scope:** a santri cannot start a window or mint a code (403), another
    teacher gets 404, a santri outside the roster gets 404, and a `PATCH` without the
    application Origin is refused before reaching the service.
  - **Validation:** rotation outside 15–300 seconds and unknown actions return 400; a
    malformed code returns 400 and a wrong or expired code returns 409.
  - **Lifecycle:** a window cannot start on a scheduled session; stopping retires live
    codes, refuses later check-ins and refuses minting; a cancelled session refuses both.
  - **Codes:** consecutive mints differ, only 64-character hex digests are stored, the
    digest of the issued code is present, and the rotated-out code still works inside its
    grace.
  - **Idempotency:** repeating a check-in with a different code returns the identical status
    and timestamp and leaves exactly one attendance record.
  - **Precedence:** a teacher-recorded santri cannot check in; a correction after a check-in
    appends to the chain while the check-in row keeps pointing at the record it created; a
    session with check-ins can be closed.
  - **Late:** a past `lateAfter` yields `late`, decided by the database clock.
  - **XP:** the ledger stays empty.
  - **Load:** 125 santri check in concurrently against one rotating window — all 125 get
    `present` in under 15 seconds, the roster reports 125 present and 0 unrecorded, and a
    five-request burst from one santri still leaves exactly 125 records.
- Unit tests (`tests/attendance.test.ts`, 2 new tests): rotation bounds, unknown actions,
  non-integer and string rotations, invalid late thresholds, and the code alphabet, length,
  case folding, and excluded letters.
- Unit tests (`tests/qr.test.ts`, 5 tests): every character of the check-in alphabet fits
  version 1 alphanumeric mode; over-long and non-alphanumeric input is rejected; the
  Reed-Solomon block divides cleanly by its generator; finder, timing, and dark modules land
  where the specification puts them; both format-information copies decode to level M and
  the chosen mask; and unmasking the matrix reproduces the encoded codewords exactly.
- Browser smoke on the prebuilt bundle against a disposable `salaam_qa_p7` database, driven
  through headless Chrome with the DevTools protocol, each role in its own browser context.
  **46 of 46 checks passed:**
  - Manager: the card explains that the session must be opened first; starting the window
    shows a code in the display alphabet, a rendered QR with an accessible label, and a
    zero tally; the tally reaches one after the check-in and the roster shows Hadir while
    the second santri stays unrecorded; stopping returns the card to its idle state.
  - **QR decode:** Chrome's own `BarcodeDetector` read the rendered SVG back to exactly the
    displayed code, confirming the encoder independently of its unit tests.
  - Santri: the check-in card offers both the scanner and a typed code; a wrong code shows
    the server's message; a correct code records Hadir with the timestamp and the note that
    only a teacher may correct it; the class tally, a classmate's row, and every manager
    control stay hidden. A santri who has not checked in sees no card once the window is
    stopped, and replaying the stopped window's last code through the API returns 409.
  - No document-level horizontal scroll and no unexpected alerts at 1440, 820, and 390 px on
    the manager session, the manager QR window, and both santri states.
- Desktop and phone screenshots of the manager QR window and both santri states were
  inspected: the QR keeps its quiet zone and contrast, and the code stays legible when the
  card stacks to one column at 390 px.

## Commands and results

- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`:
  **128 passed, 0 failed, 1,559 assertions** across 20 files, Phases 0–7.
- `bun test` without a test database: 64 passed, 80 skipped, 0 failed, 649 assertions.
  PostgreSQL suites are explicitly skipped in that run.
- `bun test tests/qr-attendance.integration.test.ts`: 7 passed, 0 failed, 61 assertions.
- `bun test tests/qr.test.ts tests/attendance.test.ts`: 10 passed, 0 failed.
- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `bun run db:migrate`: applied `0008_qr_attendance.sql` to the local application database;
  a second run reported "Database is up to date". The file is now immutable.

## Findings resolved

- **A retry reported a different timestamp.** The first response used the attendance
  record's `created_at` and the retry used the check-in row's, two separate
  `clock_timestamp()` readings. The check-in row's timestamp is now the single value
  reported in both cases, so a retry is byte-identical to the original response.
- **The QR would not decode when serialized.** Its fills come from CSS classes, which a
  detached SVG loaded as an image does not receive, so the browser check rendered it solid
  black. The check now copies the computed fills onto the clone before serializing; this was
  a limitation of the check, not of the page, which decodes correctly.
- **Rolling back Phase 7 dropped too much in the migration test.** The expectation still
  named Phase 6's tables; it now asserts that only the three check-in tables disappear and
  that `classroom_sessions` and `0007_attendance.sql` survive.

## Boundaries

This is local validation, not deployment to the school production environment. The QA
database, browser profile, storage directory, generated credentials, and the temporary
script were removed after validation.

Phase 7 does not include:

- Attendance XP, which stays deferred until a correction and reversal policy exists.
- Calendar entries and notifications for an opened window (Phase 8).
- Cross-course QR reporting and exports (Phase 9).
- Geofencing, device binding, proctoring, and biometric identification.
- Recurring windows, bulk check-in import, and roster changes after session creation.

A displayed code is a proof of presence, not proof of a person: a santri in the room can
photograph the code and send it to an absent classmate inside the rotation interval.
Rotation shortens that window and stopping the window closes it, but the teacher's
correction remains the authority. `BarcodeDetector` is unavailable in some browsers; those
santri use the typed code, and the camera path additionally needs HTTPS or localhost.
Multi-instance realtime delivery remains a Phase 6 limitation.
