# Deployment and operations

## Runtime

- Build with Bun 1.4.2 (`bun run build`), apply migrations (`bun run db:migrate`), then start
  `bun run start` (`NODE_ENV=production bun dist/server.js`) as a non-root user behind an
  HTTPS reverse proxy. Ubuntu Server is the initial target.
- The process listens on `HOST:PORT` (default `127.0.0.1:3000`). Keep it on loopback and let
  the proxy terminate TLS.
- Hardware targets are in [product](product.md#capacity-target).

## Configuration

Provide production values through a secret manager or a protected environment file; the
variables are listed in the root README. In production `APP_BASE_URL` must use HTTPS and
match the public origin exactly, because every mutation is checked against it. Set
`SCHOOL_TIMEZONE` explicitly. `STORAGE_ROOT` must be private and outside any static
directory.

## First administrator

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_IDENTIFIER`, and
`BOOTSTRAP_ADMIN_PASSWORD` privately, run `bun run db:bootstrap-admin` after migrations, and
remove the variables. The command refuses when an administrator already exists.

## Migrations

Migrations are a release step. They run in one transaction under an advisory lock, so
concurrent deploys serialize, and applied files are immutable. `db:migrate:rollback` and
`db:migrate:reset` refuse to run with `NODE_ENV=production`; fix forward with a new migration
and keep a backup from before the release.

## Reverse proxy

- Terminate HTTPS and forward to the loopback port.
- Accept request bodies of at least 10.25 MB on `/api/learning/` (a 10 MB file plus form
  fields).
- Throttle login per client; the application's limiter only sees the proxy's address.
- Keep private storage out of any static route.

## Health and shutdown

`/health/live` reports that the process runs. `/health/ready` runs a lightweight database
query with a two-second timeout and returns 503 when it fails. On `SIGTERM` or `SIGINT` the
server stops accepting requests, closes the PostgreSQL pool, and exits within ten seconds.

## Storage and backups

Uploaded learning files live only under `STORAGE_ROOT/learning-files/`, while their metadata
and access rules live in PostgreSQL. Back up both in the same window and restore them
together; a database restore without matching files produces "file not found" downloads.
Replaced material files are retained, and a crash between writing a file and committing can
leave an unreferenced file, so include storage growth in disk monitoring.

## Monitoring

Logs are JSON lines on stdout; rotate them. Monitor disk space, database connections,
backup jobs, and `/health/ready`. Every response carries `X-Request-ID`, which also appears
in the log line.

## Rollout checklist

1. Freeze the deployment window and record the release identifier.
2. Run `bun install --frozen-lockfile`, the full test suite, and `bun run build`.
3. Back up PostgreSQL and storage.
4. Apply migrations, then start or restart the service.
5. Check `/health/live` and `/health/ready`, sign in, and open one permission-restricted
   page.
6. Confirm backup status. Keep the previous `dist/` for an application rollback and a
   forward-fix plan for the database.

## Not validated yet

HTTPS proxy behavior with real browsers, backup and restore drills, and load testing on
school hardware and WLAN are still open. Each phase record lists its load-testing caveats.

## Classroom realtime

The same Bun process handles `/api/attendance/live`. Configure the reverse proxy to pass
WebSocket Upgrade/Connection headers, the browser Origin, and session cookies. Use WSS
under HTTPS, support protocol pings, and avoid proxy idle timeouts shorter than 60 seconds.
No new environment variables or services are required. On reconnect the UI refetches
current HTTP state and also offers manual refresh while the connection is unavailable.

Invalidations are process-local: run one application instance. Multi-instance delivery
would need cross-process coordination before it is supported. Limit browser tabs to four
live sessions per account; the process cap is 512. Local validation covers 125 concurrent
santri connections, not the production proxy or school WLAN. Monitor connection load and
DB latency during the pilot; permission revalidation runs every ten seconds. Shutdown
closes sockets before stopping the HTTP server and database pool.

Back up all seven attendance tables with the existing PostgreSQL backup. Rollback of
`0007_attendance.sql` destroys session, roster, attendance, and lifecycle history, and
rollback of `0008_qr_attendance.sql` destroys check-in windows, issued code digests, and
check-in rows — the attendance records those check-ins created survive, because they live in
`attendance_records`. Prefer a forward fix after real school records exist. Attendance XP
remains deferred.

QR check-in needs no new environment variable, storage, or service. The classroom display
requests a fresh code every rotation interval, so a session with a 30-second rotation adds
about two requests a minute per open window — negligible next to the check-in burst itself,
which local validation covers at 125 concurrent santri. Codes accumulate one row per
rotation and stop at 2,000 per window; an abandoned display therefore cannot grow without
bound. Camera scanning needs HTTPS or localhost, so the reverse proxy must terminate TLS
before santri can use the camera path; the typed code works either way.
