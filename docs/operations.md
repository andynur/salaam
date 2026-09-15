# Deployment and operations

For the 2 GB RAM / 2 vCPU pilot VPS shared with Yahoot, targeting `salaam.hsibs.my.id`, see the
[deployment strategy](deployment-vps.md), including resource budgets, release artifacts,
and login/backup prerequisites before pilot use.

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

### Isolated coding runner

Phase 10 does not add a runner process to the SALAAM deployment. If a separately operated
runner is approved, set `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN`, and optionally
`CODE_RUNNER_TIMEOUT_MS` (100–10,000 ms). Production runner URLs use HTTPS unless the
runner is on loopback. The token is sent only as an authorization header and is never
logged. The runner must independently enforce a disposable filesystem, one process, 128 MiB
memory, 2 seconds CPU, 5 seconds wall time, no network namespace, no secrets, no host mounts,
and a read-only base image. Before enabling it, record the image digest, patch source,
egress test, resource-limit test, log-redaction test, and rollback owner. A missing or
invalid runner configuration leaves execution disabled.

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
- The application limits login per account and applies a coarse 300-request/15-minute
  source budget shared behind the proxy. Optional per-client proxy throttling supplements
  this; forwarded IP headers remain untrusted. See [security](security.md#identity-and-sessions).
- Keep private storage out of any static route.
- Pass WebSocket `Upgrade`/`Connection`, the browser `Origin`, and session cookies through
  to `/api/attendance/live`, and keep the idle timeout above 60 seconds.

`APP_BASE_URL` must be the public HTTPS origin the browser uses, not the loopback address:
every mutation, and the WebSocket upgrade, compares the request `Origin` against it.

### Attendance operations

Teachers can mark all currently visible, unrecorded roster rows as present from an open
session. The action accepts at most 500 rows, locks the session for the complete transaction,
and is safe to retry when the submitted predecessor and status still match. A stale row
causes the whole batch to roll back with 409; the operation is audited as
`classroom.attendance.bulk_recorded`. Session history is manager-only, paginated in 50-row
pages, and reads the existing append-only lifecycle events. It does not expose private notes
to students or permit roster changes after the session snapshot.

A Caddy site block covers all of it:

```caddy
salaam.example.sch.id {
  encode zstd gzip
  request_body { max_size 11MB }
  reverse_proxy 127.0.0.1:3000
}
```

The nginx equivalent needs the upgrade headers spelled out:

```nginx
server {
  listen 443 ssl http2;
  server_name salaam.example.sch.id;
  ssl_certificate     /etc/letsencrypt/live/salaam.example.sch.id/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/salaam.example.sch.id/privkey.pem;
  client_max_body_size 11m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;   # map $http_upgrade to "upgrade"/""
    proxy_read_timeout 120s;
  }
  location = /api/auth/login {
    limit_req zone=login burst=5 nodelay;              # limit_req_zone on $binary_remote_addr
    proxy_pass http://127.0.0.1:3000;
  }
}
```

### Validated behavior (2026-09-12)

A throwaway TLS proxy in front of the production bundle (`NODE_ENV=production`, loopback
`127.0.0.1:3110`, public origin `https://salaam.qa.test:8443`) was driven end to end on
macOS with Bun 1.4.2, PostgreSQL 17.9, and headless Chrome. **22 of 22 checks passed:**

- `/health/live` and `/health/ready` answer 200 through TLS, and the SPA document is served
  over HTTPS.
- `Strict-Transport-Security: max-age=31536000` is present, and the session cookie arrives
  as `__Host-hsi_session=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200; Secure`.
- A complete administration workflow (nine records), course publishing, an attendance
  session, a QR check-in window, a minted code, and a santri check-in all succeed over
  HTTPS; a mutation whose `Origin` is the `http://` form of the same host, or has no
  `Origin` at all, is refused with 403.
- A 10 MB material upload (about 10.25 MB on the wire) passes through the proxy and is
  stored.
- `wss://…/api/attendance/live` upgrades through the proxy and the santri check-in reaches
  the teacher's socket as `{"type":"changed"}`; an upgrade without the application `Origin`
  is refused.
- In Chrome, the page over HTTPS on a non-localhost hostname reports
  `isSecureContext === true` with `navigator.mediaDevices` and `BarcodeDetector` available,
  while the same page over plain HTTP reports `isSecureContext === false` and no
  `mediaDevices` — the QR camera path works only behind the TLS proxy, exactly as the
  Phase 7 record states.

The QA proxy, database, storage, browser profile, certificate, and script were removed
afterwards. This validates the application's behavior behind TLS, not a particular proxy
product's configuration or the school WLAN.

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

Back up with a custom-format dump plus an archive of storage, in that order and in one
window:

```sh
pg_dump --format=custom --file=/backup/salaam-$(date +%F).dump "$DATABASE_URL"
tar -czf /backup/storage-$(date +%F).tgz -C "$(dirname "$STORAGE_ROOT")" "$(basename "$STORAGE_ROOT")"
```

The repository also provides `bun run backup`. Set `BACKUP_ROOT` to a protected volume
outside `STORAGE_ROOT`; it creates a timestamped directory containing `database.dump`,
`storage.tgz`, and a `SHA256SUMS` manifest, then removes directories older than
`BACKUP_RETENTION_DAYS` (14 by default). Run it from a system scheduler after confirming
the service account can read the database and storage:

```cron
15 2 * * * cd /srv/salaam && /usr/local/bin/bun run backup >> /var/log/salaam-backup.log 2>&1
```

Alert on a non-zero exit, missing newest timestamped directory, low backup-volume space,
or an age beyond 26 hours. Treat the backup log as operational metadata; it must not include
the database URL or application secrets.

Restore onto an empty database, then unpack storage, then start the service:

```sh
createdb salaam
pg_restore --dbname="$DATABASE_URL" --no-owner /backup/salaam-<date>.dump
tar -xzf /backup/storage-<date>.tgz -C "$(dirname "$STORAGE_ROOT")"
bun run db:migrate        # must report "Database is up to date"
```

### Restore drill (2026-09-12)

Drilled locally against a QA copy holding real rows in twelve tables, a 10 MB material file,
an attendance session, and a QR check-in. The database was dropped and the storage directory
deleted before restoring. **9 of 9 checks passed:** every table came back with the same row
count; `schema_migrations` kept all eight names and checksums, so the immutable-migration
check still holds and `db:migrate` reported "Database is up to date"; the restored material
file was byte-identical by SHA-256; the attendance check-in and its status survived; an
account signed in against the restored database; and the material downloaded through the
application with identical bytes.

Two things to know before a real restore. A dump carries the `sessions` rows with it, so
anyone signed in at backup time is signed in again after a restore to an older point —
delete `sessions` after restoring from an old backup. And the restore is only consistent if
the dump and the storage archive come from the same window: a database restored ahead of its
files points at files that do not exist yet.

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

## Account recovery

A santri or teacher who forgets their password cannot recover it themselves: there is no
email delivery and no reset link. An administrator opens **Administrasi → Pengguna**,
uses **Atur ulang sandi** on the account's row, and hands the new password over in person.
The reset ends every session of that account immediately and is recorded in the audit log as
`user.password_reset`. An administrator who resets their own account is signed out too, so
keep a second administrator account. Deactivated accounts (`users.is_active = false`) still
need a database change; role reassignment and profile editing remain deferred.

## Not validated yet

Load testing on school hardware and WLAN is still open, and each phase record lists its
load-testing caveats. The HTTPS proxy behavior and a restore drill were validated locally on
2026-09-12; both sections above record what that covered and what it did not.

## Academic operations

Use **Administrasi → Pengguna → Import santri** (`/admin/import`) for administrator-controlled
student CSV import; the CSV can be pasted or loaded from a file. The required header is
`nama,email,identifier,password`; preview must show zero row errors before the atomic save. A
recurring attendance series materializes real sessions immediately, so review the generated
session list before opening the first session. Every generated session keeps its own roster
snapshot; later class membership changes do not rewrite existing attendance rosters.

## Classroom realtime

The same Bun process handles `/api/attendance/live`. Configure the reverse proxy to pass
WebSocket Upgrade/Connection headers, the browser Origin, and session cookies. Use WSS
under HTTPS, support protocol pings, and avoid proxy idle timeouts shorter than 60 seconds.
No new environment variables or services are required. On reconnect the UI refetches
current HTTP state and also offers manual refresh while the connection is unavailable.

Invalidations are process-local: run one application instance. Multi-instance delivery
would need cross-process coordination before it is supported. Limit browser tabs to four
live sessions per account; the process cap is 512. Local validation covers 125 concurrent
santri connections, and a single WSS connection through a TLS proxy (2026-09-12), but not
the school WLAN or a production proxy product. Monitor connection load and
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
before santri can use the camera path; the typed code works either way. This was confirmed
in a browser on 2026-09-12 — see the reverse-proxy validation above.

## Calendar and notification worker

Apply `0010_calendar_notifications.sql` before starting the updated server. It is included
in the normal migration runner and has a destructive down script; prefer forward fixes once
real events, preferences, or notification history exist. Back up its three tables with the
existing PostgreSQL backup. No new environment variables, provider credentials, storage
paths, proxy settings, or runtime service are required.

The Bun process runs a notification tick at startup and every 15 seconds. A tick generates
at most 250 reminders and handles at most 250 pending deliveries; five-second SQL statement
timeouts bound expensive statements. A PostgreSQL advisory lock prevents overlapping ticks,
and each tick is atomic. Shutdown stops the timer and waits for its in-flight transaction
before closing the database. Monitor the fixed `notification.delivery.failed` log event and
pending queue age/count (`notifications.status = 'pending'`). Failed transactions remain
retryable; do not manually mark them delivered.

Delivery means insertion into the in-app inbox, not email, push, or proof of reading.
Users refresh the inbox manually or open it from navigation. Preferences apply to future
delivery. During downtime no delivery runs; startup retries existing pending rows and
suppresses expired or inaccessible sources. It generates reminders only for sources still
upcoming within 24 hours, so expired agenda items are not backfilled. Backlogs can require
multiple ticks; measure queue age and latency on school hardware. The whole application
still uses the existing single-instance deployment model.

## Course certification

Migration `0037_course_certificates.sql` must be applied before rollout; no new environment
variable or PDF rendering service is needed. `APP_BASE_URL` becomes the origin encoded in
certificate QR links and must match the public HTTPS origin. The complete URL is limited to
106 UTF-8 bytes by the dependency-free QR encoder. The existing white HSI logo is bundled
into the SPA. Verify an incomplete and complete student's
Sertifikasi tab after deployment, including an actual PDF download. The date is the
issue date in WIB. Issued names and course details remain stable on later downloads.
