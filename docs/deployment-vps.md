# Deployment strategy: 2 GB RAM / 2 vCPU

Status: initial pilot deployed on 2026-09-14. The user selected the same VPS as Yahoot
for temporary trials, with a later move to a school PC server. SALAAM runs alongside
Yahoot and Beszel, sharing Caddy. Before provisioning, available memory was 1,363 MiB,
disk space was 40 GiB free, and approximately 4 GiB swap already existed. No swap was
added and existing Yahoot services were preserved. Public DNS initially pointed to
another provider, so the pilot first served a temporary IP-derived hostname. On the same
day the school domain was cut over: `https://salaam.hsibs.my.id` is the canonical origin
and the temporary hostname permanently redirects to it.

Implementation and migration instructions are in [deploy/README.md](../deploy/README.md).

### Pilot verification, 2026-09-14

- PostgreSQL 17.11, Bun 1.4.2, and the existing Caddy 2.11.4 run on Ubuntu 24.04.4.
- Release artifact SHA-256:
  `2674fab07388e8bc24dd04ef8fb9ae49f2f14c149b9b8f5ac2f1eded48eb04cd`.
  This is a working-tree snapshot based on `1f369a8`, including existing local UI work.
- Local full PostgreSQL suite: **251 passed, 0 failed, 3,612 assertions**. Typecheck,
  production build (16 assets), and shell syntax checks passed.
- Linux production bundle: all **36 migrations** applied; **15 HTTP smoke checks**
  passed for assets, health, authentication, Origin checks, secure cookie flags, and
  session revocation.
- Public HTTPS uses a temporary IP-derived hostname until school-domain DNS is ready.
  TLS verification passed. **14 browser checks** passed for login, dashboard at
  1440/820/390 px, authenticated API calls, logout, and session revocation. Desktop
  and phone screenshots were visually inspected. The school-domain DNS still pointed
  to another provider at verification time.
- School-domain cutover: the `salaam.hsibs.my.id` A record resolves to the VPS through
  public resolvers, Caddy holds a Let's Encrypt certificate for it (valid until
  2026-12-13), and `APP_BASE_URL` was switched and SALAAM restarted. Public checks
  passed: `/health/live` and `/health/ready` 200 with TLS verification, SPA 200, the
  temporary hostname returns 308 to the school domain, login with the old origin returns
  403 `INVALID_ORIGIN`, invalid credentials return 401, and unauthenticated `/api/auth/me`
  returns 401. Yahoot stayed at 200. A successful administrator login on the school
  domain was not repeated after cutover.
- Backup and restore: **7 checks passed** on the initial database with one administrator
  and empty upload storage, including backup hashes, restored schema, immutable migration
  checksums, readiness, and login. No claim of populated course/upload recovery is made.
- A separate synthetic **512 MiB** dump was hashed under a **384 MiB** service memory
  limit; peak process RSS was **57,924 KiB**. This checks streaming memory behavior,
  not database backup throughput.
- The nightly backup timer is enabled for **02:15 Asia/Jakarta**. Backups are local;
  automated off-host copies and external alert destinations are not configured.
- Yahoot remained healthy over public HTTPS. Final available memory was approximately
  **1,290 MiB** with both apps running, and no failed systemd services were present.
  This idle/smoke observation is not a load-capacity measurement.

Public course upload/submission and authenticated attendance WebSocket flows, school
network behavior, and realistic concurrent-user capacity remain unverified on this VPS.

## Topology

Use Ubuntu 24.04 LTS, systemd, Caddy, one Bun 1.4.2 application process, and PostgreSQL 17
on the same host. Pin the Bun version used in CI and production; install security updates
for the OS, proxy, and PostgreSQL through their maintained package channels.

```text
Browser → https://salaam.hsibs.my.id → Caddy :443
                                      ↓
                              Bun 127.0.0.1:3000
                                ↓            ↓
                      PostgreSQL :5432   private uploads
                         loopback        /var/lib/salaam/storage
```

The SPA, API, uploads served through authorized endpoints, and attendance WebSocket share
this origin. Caddy supplies TLS and WebSocket proxying. Start with native services to keep
administration simple and leave memory for the database. No panel, container orchestrator,
Redis, or local student-code runner is needed.

Yahoot's `deploy/README.md`, `deploy/yahoot.service`, and deployment workflow demonstrate
this native-service pattern. Adapt the architecture, not its setup script: that script
overwrites the host Caddyfile, uses SQLite, and updates the working checkout in place.
Yahoot commits its frontend bundle; SALAAM must keep `dist/` out of Git and ship CI artifacts.
Yahoot's published load measurements do not establish SALAAM capacity.

## Starting resource budget

These are planning envelopes, not measurements or enforced memory limits.

| Component | Initial RAM budget |
| --- | --- |
| OS, systemd, SSH, logs, Caddy | 350 MiB |
| Bun application | 450 MiB |
| PostgreSQL total working budget | 550 MiB |
| Cache and transient headroom | approximately 650 MiB |

On a new host, add 2 GiB swap as an emergency buffer; sustained swapping is a capacity problem. Build and
test in CI, outside the VPS. Keep the existing Bun SQL pool at four connections. Start
PostgreSQL with `shared_buffers=256MB`, `work_mem=4MB`, `maintenance_work_mem=64MB`,
`autovacuum_work_mem=32MB`, `effective_cache_size=768MB`, `max_connections=20`, and
`max_parallel_workers_per_gather=0`, then measure. Leave durability and autovacuum enabled.
On the shared pilot host, account for Yahoot and Beszel in addition to this budget.
These PostgreSQL values do not cap its total memory; query operations and concurrent
connections multiply allocations. `effective_cache_size` is a planner estimate.

The product target is 50–125 concurrent students for a pilot on this size, not a tested
guarantee. Begin load tests at 25 and 50, then test 100 and 125 with representative course
data, login bursts, autosave/submission, attendance sockets, uploads, and report reads.
Proposed acceptance: no OOM/restart, no unexpected 5xx, correct submissions after retries,
at least 300 MiB available RAM, and p95 below one second for ordinary API operations.
Measure expensive login, uploads, and reports separately. Upgrade RAM when representative
load exhausts headroom or causes sustained swapping; increase CPU when sustained CPU
pressure produces unacceptable latency. Full-school production needs separate sizing;
the product document recommends at least four cores and 8 GB for a production LAN.

## Domain and configuration

Point the domain's A record at the VPS. Publish AAAA only if IPv6 is configured and tested.
Expose HTTP/HTTPS and restricted SSH; keep application and database ports private.

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_BASE_URL=https://salaam.hsibs.my.id
DATABASE_URL=postgres://salaam:REPLACE_PRIVATELY@127.0.0.1:5432/salaam
STORAGE_ROOT=/var/lib/salaam/storage
SCHOOL_TIMEZONE=Asia/Jakarta
SESSION_TTL_HOURS=12
BACKUP_ROOT=/var/backups/salaam
BACKUP_RETENTION_DAYS=14
```

Keep real values in a protected `/etc/salaam/salaam.env`, loaded through systemd for both
the app and operational jobs. A file outside the working directory is not automatically
loaded by Bun. Use a dedicated non-root app user and a database role without superuser,
role-creation, or database-creation privileges. Bootstrap the first administrator using
the existing command, then remove bootstrap credentials. Do not run demo seeds.

Baseline Caddy site:

```caddy
salaam.hsibs.my.id {
  encode zstd gzip
  request_body {
    max_size 11MB
  }
  reverse_proxy 127.0.0.1:3000
}
```

Preserve Origin and cookies; private files must never be exposed by a static file server.
Validate configuration before reload and verify upload limits against the actual flows.
Use systemd restart-on-failure, a stop timeout above the app's ten-second shutdown window,
read-only application releases, and writable access only to application storage and
required temporary paths. Bound journald retention, for example to 200 MiB.

## Release and rollback

1. CI checks out an exact commit, installs frozen dependencies, runs PostgreSQL-backed
   tests and typecheck, then builds using the pinned Bun version on Linux matching the VPS
   architecture. Test the packaged release itself before uploading it.
2. Package `dist/`, migration files, the migration/bootstrap/backup command sources and
   their local imports, and required package/configuration files. Do not assume
   `dist/server.js` alone contains the separate administrative commands or SQL files.
   Exclude secrets, school data, and local storage. Record commit and artifact checksum.
3. Upload into `/srv/salaam/releases/<commit>`, leaving `/srv/salaam/current` running.
   Serialize deployments and verify the artifact checksum. Keep three releases initially.
4. During a scheduled maintenance window, stop application writes, back up the database
   and storage together, and verify backup completion. Run production migrations from
   the candidate release using the protected environment.
5. Switch `current` atomically and start the service. Check local and public
   `/health/live` and `/health/ready`, then login, scoped access, upload/download,
   attendance WebSocket, and an activity submission through the public HTTPS domain.
6. A failed release may switch back only when the previous application is compatible
   with the migrated schema. Otherwise fix forward; restoring a backup is a maintenance
   operation that discards newer writes. Never automatically run down migrations.

Use a deployment identity separate from the runtime user, pinned SSH host verification,
and narrowly scoped restart/operational permissions. Start with manual workflow dispatch;
enable automatic main-branch releases after the packaged rollout and rollback pass.
Expect a short maintenance outage; this design does not promise zero downtime.

## Required work before pilot

1. **Classroom login — implemented.** Login now has a ten-attempt limit per normalized
   email and a coarse 300-request/15-minute source budget shared with password changes.
   Forwarded addresses remain untrusted; spoofing them cannot bypass throttles. Password
   changes use authenticated user IDs for their separate account budget. The two-check
   Argon2 concurrency cap remains. Handler tests cover 125 distinct accounts behind one
   source, normalized account limits across sources, spoofed headers, the shared source
   ceiling, and the concurrency cap. This is correctness evidence, not a login load test;
   busy retries count against the shared source budget.
2. **Bounded-memory backup — implemented.** `scripts/backup.ts` streams SHA-256 checksums
   and passes the database password through the child environment. Archive publication
   remains atomic and failed staging directories are removed. The systemd backup job
   pauses SALAAM writes for a matching database/storage snapshot and then restarts it.
3. **Off-host recovery.** Schedule a nightly consistent backup window, encrypted off-host
   copies, and 14 daily recovery points initially. A local backup directory is staging,
   not protection against VPS loss. Alert if no verified copy exists within 26 hours.
   Restore database and matching storage to a disposable environment and verify records,
   file hashes, login, and migration checksums. Nightly-only recovery can lose up to
   24 hours of writes; agree a tighter backup interval if that is unacceptable.
4. **Host acceptance.** Inventory OS, disk, services, listeners, swap, firewall and DNS;
   establish external readiness monitoring, memory/CPU/disk alerts, and backup alerts.
   Keep at least 20% disk space free, accounting for database growth, WAL, upload
   retention, temporary archives, and release copies. Perform the load tests above
   before claiming capacity.

## References

- [Operations](operations.md) and [capacity target](product.md#capacity-target).
- [PostgreSQL 17 memory settings](https://www.postgresql.org/docs/17/runtime-config-resource.html):
  memory allocation semantics; the smaller shared-buffer starting point here is a design
  choice for a host shared with the application.
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https),
  [WebSocket proxying](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and
  [request body limits](https://caddyserver.com/docs/caddyfile/directives/request_body).
