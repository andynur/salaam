#!/usr/bin/env bash
# Provision SALAAM alongside existing services; requires Bun 1.4.2 and Caddy.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
domain=${1:?Usage: setup.sh salaam.example.org}
[[ "$domain" =~ ^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$ ]] || exit 1
[[ "$(/usr/local/bin/bun --version)" = "1.4.2" ]] || { echo "Install Bun 1.4.2 first" >&2; exit 1; }
command -v caddy >/dev/null
template_dir=$(cd "$(dirname "$0")" && pwd)
if [[ ! -x /usr/lib/postgresql/17/bin/psql ]]; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsS https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  printf '%s\n' 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
  apt-get update -qq
  apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17
fi
id salaam >/dev/null 2>&1 || useradd --system --home-dir /var/lib/salaam --shell /usr/sbin/nologin salaam
install -d -m 755 /srv/salaam/releases /var/lib/salaam
install -d -m 700 /etc/salaam /var/backups/salaam
install -d -m 700 -o salaam -g salaam /var/lib/salaam/storage
# Tune only this newly provisioned cluster; on a shared PostgreSQL cluster, review first.
if [[ ! -f /etc/salaam/salaam.env ]]; then
  existing=$(runuser -u postgres -- psql -Atqc "SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')")
  [[ "$existing" = 0 ]] || { echo "Review existing PostgreSQL databases before provisioning" >&2; exit 1; }
  cat > /etc/postgresql/17/main/conf.d/salaam.conf <<'PG'
listen_addresses = '127.0.0.1'
shared_buffers = '256MB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
autovacuum_work_mem = '32MB'
effective_cache_size = '768MB'
max_connections = 20
max_parallel_workers_per_gather = 0
timezone = 'Asia/Jakarta'
PG
  systemctl restart postgresql@17-main
  python3 - "$domain" <<'PY'
import os, secrets, subprocess, sys
password = secrets.token_hex(32)
sql = "CREATE ROLE salaam LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '" + password + "';\nCREATE DATABASE salaam OWNER salaam;\n"
subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-v", "ON_ERROR_STOP=1"], input=sql, text=True, check=True, stdout=subprocess.DEVNULL)
values = {
    "NODE_ENV": "production", "HOST": "127.0.0.1", "PORT": "3000",
    "APP_BASE_URL": "https://" + sys.argv[1],
    "DATABASE_URL": "postgres://salaam:" + password + "@127.0.0.1:5432/salaam",
    "STORAGE_ROOT": "/var/lib/salaam/storage", "SCHOOL_TIMEZONE": "Asia/Jakarta",
    "SESSION_TTL_HOURS": "12", "BACKUP_ROOT": "/var/backups/salaam", "BACKUP_RETENTION_DAYS": "14",
}
fd = os.open("/etc/salaam/salaam.env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as out:
    out.write("".join(key + "=" + value + "\n" for key, value in values.items()))
PY
fi
install -m 644 "$template_dir/salaam.service" /etc/systemd/system/salaam.service
install -m 644 "$template_dir/salaam-backup.service" /etc/systemd/system/salaam-backup.service
install -m 644 "$template_dir/salaam-backup.timer" /etc/systemd/system/salaam-backup.timer
install -d -m 755 /etc/caddy/sites-enabled
cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-salaam-$(date -u +%Y%m%dT%H%M%SZ)"
cat > /etc/caddy/sites-enabled/salaam.caddy <<CADDY
$domain {
  encode zstd gzip
  request_body {
    max_size 11MB
  }
  reverse_proxy 127.0.0.1:3000
}
CADDY
if ! grep -qFx 'import /etc/caddy/sites-enabled/*.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/sites-enabled/*.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable salaam
systemctl reload caddy
echo "Provisioned. Deploy a release, bootstrap an administrator, then enable salaam-backup.timer."
