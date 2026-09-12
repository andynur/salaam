# Phase 12 — Pilot readiness and operational hardening

Phase 12 turns the locally validated application into a repeatable pilot release. It is
operations-first because the remaining risk is environment-specific: school hardware,
WLAN behavior, backup scheduling, restore operation, and release rollback.

## Scope decisions

- Keep SALAAM as a single Bun process and PostgreSQL deployment until measured capacity
  requires a different topology.
- Backups contain PostgreSQL and `STORAGE_ROOT` from one timestamped window. A staged backup
  is published atomically only after both archives and checksums succeed.
- Backup retention is configurable, defaults to 14 days, and only removes timestamped backup
  directories inside the explicit `BACKUP_ROOT`.
- Attendance XP remains blocked until correction and reversal policy is approved. Feature
  deferred items are not bundled into pilot readiness.

## Delivered in this increment

- `bun run backup` creates a PostgreSQL custom dump and matching storage archive under a
  timestamped directory, writes both before publishing the directory, and applies bounded
  retention.
- `BACKUP_ROOT` and `BACKUP_RETENTION_DAYS` are documented configuration values.
- The roadmap now identifies Phase 12 and consolidates repeated deferred items.

## Pilot checklist

1. Run the full tests and production build from the release commit.
2. Run `bun run backup` before migrations and retain the printed backup path.
3. Test the application through the school HTTPS proxy on desktop and phone hardware.
4. Exercise attendance/QR bursts, exam autosave/submission, reports, and file transfers.
5. Record p95 latency, errors, CPU, memory, disk, PostgreSQL connections, and WebSocket count.
6. Repeat the restore drill from the same backup window, delete restored sessions when using
   an older point-in-time backup, and verify login, file download, attendance, and readiness.
7. Approve go/no-go with thresholds and named rollback owner; keep the previous `dist/` until
   the pilot is stable.

## Acceptance criteria

- The school-hardware/WLAN run completes without data loss, duplicate attendance records, or
  unrecoverable autosave/submission errors at the 125-student target.
- A failed dump or archive leaves no published backup directory.
- A backup can be restored by an operator using only the documented procedure and passes the
  existing nine-check restore drill.
- The pilot record names observed thresholds, alert actions, proxy behavior, and rollback owner.

## Out of scope

Attendance XP, recurring meetings, roster editing, external notification providers, analytics
expansion, multi-instance realtime delivery, and an online-code runner remain deferred.

## Validation status

The backup command is locally typechecked and smoke-tested for argument/configuration safety.
School hardware/WLAN load testing and a scheduled production backup job remain environment
validation work and must be recorded in `docs/operations.md` before Phase 12 is closed.

## Follow-up increment

The next delivered increment adds the first deferred academic operations that do not require a
new external service: administrator-only CSV student import with server-side preview, row-level
validation, atomic account/enrollment writes, and idempotent retries; plus bounded recurring
meeting templates that materialize roster-snapshotted sessions. A recurring series can configure
QR rotation and late thresholds; its QR window opens automatically when the generated session is
opened. Attendance XP, external providers, coding execution, and multi-instance realtime remain
deferred.
