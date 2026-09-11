# Deployment & Operations

## 1. Development / Pilot VPS

Target:

- Ubuntu Server.
- 2 vCPU.
- 2 GB RAM.
- Sumopod VPS.

Services:

```text
Caddy
Bun application
PostgreSQL
systemd
local storage
backup scripts
```

Avoid Docker unless it clearly simplifies your own operational workflow. The application should not *require* Docker for deployment.

## 2. Suggested paths

```text
/srv/hsi-learning/
  app/
  storage/
    avatars/
    courses/
    assignments/
    projects/
    temp/
  backups/
  logs/
```

Runtime user should have only required permissions.

## 3. Reverse proxy

Caddy responsibilities:

- HTTPS,
- certificate management,
- request forwarding,
- safe upload/request size limits where appropriate.

Application remains aware of trusted proxy setup.

## 4. Service manager

Use `systemd`.

Requirements:

- restart on unexpected failure,
- startup after boot,
- environment file or secure env mechanism,
- working directory fixed,
- logs accessible through journal or configured logger.

## 5. PostgreSQL

For 2 GB VPS:

- keep connection pool conservative,
- monitor RAM,
- avoid excessive max connections,
- index based on workload,
- use slow-query review when performance issues appear.

## 6. Health endpoints

Example:

- `/health/live`
- `/health/ready`

Readiness may test DB connectivity with lightweight query.

Do not expose sensitive runtime information.

## 7. Backup

Automate:

- `pg_dump` or appropriate PostgreSQL backup method,
- storage archive/sync,
- checksum,
- retention cleanup.

Copy backup away from the same server.

## 8. Production school LAN

Recommended:

```text
Internet (optional)
      |
Gateway/Firewall
      |
HSI Server
  |-- Caddy
  |-- Bun
  |-- PostgreSQL
  |-- Storage
      |
Gigabit LAN
  |--- AP
  |--- AP
  |--- AP
```

Main exam traffic stays in LAN.

## 9. HTTPS on LAN

Keep HTTPS even for internal deployment because modern browser functionality such as camera/PWA/service-worker features generally expects secure context.

Plan internal DNS/certificate strategy deliberately.

## 10. Production migration checklist

- freeze deployment window,
- fresh backup,
- provision server,
- install Bun pinned baseline,
- PostgreSQL migration,
- copy storage,
- restore DB,
- run migrations,
- validate permissions,
- smoke test,
- load test,
- verify HTTPS,
- verify backup target,
- DNS cutover,
- rollback plan.

## 11. Observability V1

Keep it light:

- structured application log,
- request ID,
- request duration,
- error counts,
- DB failure log,
- disk usage check,
- backup status.

Do not deploy a heavyweight monitoring stack until needed.

## 12. Capacity test before school-wide exam

Simulate:

- 125 logged-in users,
- start exam wave,
- answer autosave burst,
- reconnect,
- final submit wave,
- teacher dashboard open.

Test over realistic WLAN, not only localhost.
