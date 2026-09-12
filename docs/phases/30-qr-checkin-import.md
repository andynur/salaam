# Phase 30 — QR check-in import

## Scope decisions

- Managers can import a bounded batch of offline scan records containing `studentId`, the
  issued QR code, and `scannedAt`.
- The server verifies the code hash, session window, code validity interval, active roster,
  and a narrow five-second clock skew before writing the normal attendance/check-in rows.
- A request key and payload hash make retries idempotent; any invalid row rolls back the
  complete batch.

## Delivered

- `POST /api/attendance/courses/:courseId/sessions/:sessionId/checkin/import` imports 1–500
  scan rows and returns an import identifier and count.
- Imported scans preserve the QR code reference and scan timestamp, remain visible in the
  Phase 29 breakdown, and create an auditable `classroom.attendance.checkin_imported` event.
- Imports cannot be used to manufacture QR proof from a student ID alone: an issued code
  matching the session and scan time is mandatory.

## Validation

- Unit tests cover bounded rows, QR code format, timestamps, and duplicate students.
- PostgreSQL integration covers issued-code verification, atomicity, idempotent retry,
  manager-only access, and derived QR breakdown values.
- Typecheck, production build, and migration replay/rollback are required release gates.

## Boundaries

- The import format is JSON rows for trusted scanner exports; no arbitrary CSV parser or
  client-side identity assertion is accepted.
- Recurring QR windows, geofencing, device binding, proctoring, and biometrics remain deferred.
