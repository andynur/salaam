#!/usr/bin/env bash
# Run as root on the server after uploading a locally/CI built archive.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
artifact=${1:?Usage: release.sh archive.tgz sha256 release-id}
checksum=${2:?SHA256 is required}
release_id=${3:?Release ID is required}
[[ "$release_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ && "$checksum" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ "$(sha256sum "$artifact" | cut -d ' ' -f 1)" = "$checksum" ]] || { echo "Checksum mismatch" >&2; exit 1; }
exec 9>/run/lock/salaam-deploy.lock
flock -n 9 || { echo "Another deployment or backup is running" >&2; exit 1; }
release=/srv/salaam/releases/$release_id
[[ ! -e "$release" ]] || { echo "Release already exists" >&2; exit 1; }
install -d -m 755 "$release"
tar -xzf "$artifact" --no-same-owner -C "$release"
chown -R root:root "$release"
chmod -R u=rwX,go=rX "$release"
test -s "$release/dist/server.js"
test -s "$release/ops/migrate.js"
previous=""
if [[ -L /srv/salaam/current ]]; then previous=$(readlink -f /srv/salaam/current); fi
was_active=false
if systemctl is-active --quiet salaam; then was_active=true; fi
phase=before_migration
recover() {
  status=$?
  if [[ $status -ne 0 ]]; then
    if [[ "$phase" = before_migration ]] && "$was_active"; then systemctl start salaam; fi
    echo "Release failed in phase $phase; previous release: ${previous:-none}. No automatic database rollback." >&2
  fi
}
trap recover EXIT
if "$was_active"; then systemctl stop salaam; fi
if [[ -n "$previous" && -d "$previous" ]]; then
  systemd-run --quiet --wait --pipe --collect --property=EnvironmentFile=/etc/salaam/salaam.env \
    --property=WorkingDirectory="$previous" /usr/local/bin/bun "$release/ops/backup.js"
fi
phase=migration
systemd-run --quiet --wait --pipe --collect --uid=salaam \
  --property=EnvironmentFile=/etc/salaam/salaam.env --property=WorkingDirectory="$release" \
  /usr/local/bin/bun ops/migrate.js
phase=activation
ln -s "$release" /srv/salaam/current.next
mv -Tf /srv/salaam/current.next /srv/salaam/current
systemctl start salaam
for attempt in {1..20}; do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/health/ready >/dev/null; then
    echo "Release $release_id ready; previous release: ${previous:-none}"
    exit 0
  fi
  sleep 1
done
echo "Readiness failed; inspect journalctl -u salaam" >&2
exit 1
