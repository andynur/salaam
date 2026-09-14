#!/usr/bin/env bash
# Invoked by the root-owned backup unit with EnvironmentFile already loaded.
set -euo pipefail
exec 9>/run/lock/salaam-deploy.lock
flock -n 9 || { echo "Another deployment or backup is running" >&2; exit 1; }
was_active=false
if systemctl is-active --quiet salaam; then was_active=true; fi
restore_service() { if "$was_active"; then systemctl start salaam; fi; }
trap restore_service EXIT
if "$was_active"; then systemctl stop salaam; fi
cd /srv/salaam/current
/usr/local/bin/bun ops/backup.js
