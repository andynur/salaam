# Native deployment

The pilot shares an Ubuntu 24.04 / 2 vCPU / 2 GB VPS with Yahoot. SALAAM has its own
system user, release directories, PostgreSQL database, storage, systemd units, and Caddy
site. Its target public origin is `https://salaam.hsibs.my.id`. No server address or credentials
are embedded in these scripts. See [strategy](../docs/deployment-vps.md).

## First deployment

1. Verify SSH access, existing services, free memory, disk space, swap, and port 3000.
   Install Bun 1.4.2 and Caddy first. Point the public domain at the destination server.
2. Review and upload this `deploy/` directory. As root, run
   `bash deploy/setup.sh salaam.hsibs.my.id`. This installs PostgreSQL 17 if missing;
   initial provisioning refuses a PostgreSQL cluster containing other application
   databases. It preserves existing Caddy sites and adds an import for
   `/etc/caddy/sites-enabled/*.caddy`. Do not subsequently run Yahoot's setup script,
   which overwrites the main Caddyfile and would remove that import.
3. On a build machine with frozen dependencies, run the full PostgreSQL suite and
   typecheck, then `bash deploy/package.sh /absolute/path/release.tgz`.
   The artifact contains bundled application and operational JavaScript, migrations,
   and deployment templates. It contains no `node_modules`, secrets, or seed data.
   Native Bun JavaScript is portable; verify the artifact on the destination Linux
   runtime before admitting users. A working-tree build is explicitly marked as such.
4. Upload the archive, then run as root:
   `bash deploy/release.sh /path/release.tgz <sha256> <unique-release-id>`.
   This stops SALAAM, backs up an existing release, migrates, switches the symlink,
   and checks local readiness. It serializes with scheduled backups.
5. Bootstrap the first administrator using `ops/bootstrap-admin.js` from the release
   and the protected environment plus `BOOTSTRAP_ADMIN_*` variables. Use a private
   temporary EnvironmentFile with a random password; delete that file afterwards.
   Transfer the initial password privately and change it on first use.
6. Verify public TLS, authentication, authorized APIs, upload/download, and attendance
   WebSocket. Run `systemctl start salaam-backup.service`, verify the archive checksums,
   and perform a restore drill. Enable `salaam-backup.timer` after a release is active.

The runtime environment is root-readable `/etc/salaam/salaam.env`; systemd loads it
without exposing it in command arguments. The app runs as `salaam` with a read-only
release and writable `/var/lib/salaam/storage`. The application uses `MemoryHigh=512M`
and `MemoryMax=768M`; inspect actual usage and OOM events rather than assuming these
limits establish capacity. PostgreSQL uses the small-host settings from the strategy.

## Operations

When the school domain's DNS is not ready, the pilot can use a temporary IP-derived
HTTPS hostname. `APP_BASE_URL` must match that temporary origin, and the school-domain
Caddy block redirects there once it becomes reachable. To cut over, first verify the
school domain's DNS and certificate, replace its redirect with the proxy block, set
`APP_BASE_URL=https://salaam.hsibs.my.id`, and redirect the temporary hostname to the
school domain. Validate Caddy before reload and restart SALAAM to load the origin.
Repeat public login/logout checks; cookies are scoped to the hostname, so users sign
in again. Keep the same database and storage. Re-running setup alone does not change
the existing environment file.

- `systemctl status salaam` and `journalctl -u salaam` show service health.
- `/health/ready` probes PostgreSQL; `/health/live` only confirms the app is running.
- `systemctl start salaam-backup.service` makes a consistent backup while briefly
  stopping SALAAM. An exit trap restarts an app that was running before the backup.
  A forced kill or backup timeout requires checking/restarting the app manually.
- Backups run at 02:15 Asia/Jakarta, even if the host uses another timezone, with
  14-day retention. They are root-readable under `/var/backups/salaam`. Checksums
  stream through bounded buffers; the PostgreSQL URL is passed via environment.
- Arrange encrypted off-host copies and external health/backup alerts before using
  important data. Local backups alone do not protect against VPS loss. Backup runtime
  grows with storage and extends the maintenance outage.
- Keep three known-good releases after verifying a deployment. Never remove the
  current or previous release before health and rollback compatibility are checked.
- On deployment failure after migration starts, the script deliberately leaves
  recovery to the operator. Inspect schema compatibility before switching `current`
  back to the previous release. Never automatically roll back database migrations.

## GitHub Actions deployment

`.github/workflows/deploy.yml` runs typecheck, the full PostgreSQL-backed suite against a
disposable `postgres:17` service container, `bun run build`, and `deploy/package.sh` on
every push and pull request. Nothing is deployed automatically: the `deploy` job only runs
from a manual `workflow_dispatch` run (Actions tab → "Test, build, and deploy" → Run
workflow), gated by the `production` GitHub Environment, and only after the `test` job
passes on the chosen ref. Re-enable a push-triggered `deploy` job only after several manual
runs and at least one verified rollback.

One-time VPS setup, run once as root:

1. Create a deployment identity separate from the `salaam` runtime user, with no shell
   login beyond SSH key auth:
   `adduser --disabled-password --gecos "" salaam-deploy`.
2. Generate an ed25519 key pair for CI (`ssh-keygen -t ed25519 -C github-actions -f
   salaam-deploy-ci -N ""`); add the public half to
   `/home/salaam-deploy/.ssh/authorized_keys` (mode 700/600, owned by `salaam-deploy`).
   Keep the private half only in the GitHub secret below; do not leave a copy on disk.
3. Install a fixed, root-owned copy of the release script the deploy user cannot edit:
   `install -m 755 -o root -g root deploy/release.sh /usr/local/sbin/salaam-release.sh`.
   Re-run this whenever `deploy/release.sh` changes; CI never updates it automatically.
4. Grant exactly that command, nothing else, via
   `/etc/sudoers.d/salaam-deploy` (`visudo -cf` before installing it):
   ```
   salaam-deploy ALL=(root) NOPASSWD: /usr/local/sbin/salaam-release.sh *
   ```
5. Record the host's SSH fingerprint for pinned verification:
   `ssh-keyscan -t ed25519 <host> > known_hosts`.

Add these repository secrets, and create a `production` GitHub Environment with required
reviewers before granting deploy access:

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_HOST` | The VPS address |
| `DEPLOY_SSH_USER` | `salaam-deploy` |
| `DEPLOY_SSH_KEY` | The CI private key from step 2 |
| `DEPLOY_SSH_KNOWN_HOSTS` | The output of step 5 |

The workflow uploads the packaged artifact to `/tmp` over SSH, runs
`sudo /usr/local/sbin/salaam-release.sh <artifact> <sha256> <commit-sha>` (matching
`deploy/release.sh`'s own checksum and serialization checks), removes the uploaded artifact,
then checks public `/health/live` and `/health/ready`. It does not run migrations outside
`release.sh`, does not touch Yahoot, and cannot deploy without a maintainer starting the
run and the environment's reviewers approving it.

## Move to the school server

Provision the school server using the same versions and scripts, with a new database
password. Stop writes on the VPS, run a final backup, verify checksums, and securely
transfer the artifact and matching database/storage archives. Restore into an empty
database, restore storage ownership to `salaam`, and check migration checksums. Keep the
old app stopped to avoid two divergent databases. Validate the new host with the public
hostname before changing routing/DNS, then switch traffic and repeat smoke checks.

For a school LAN behind NAT, decide whether access is LAN-only or also available from
outside before cutover. Public HTTPS needs reachable challenge ports or a separately
configured DNS challenge; LAN clients can use split DNS, but the TLS certificate must
still be trusted for the canonical hostname. Retain HTTPS for cookies and camera access.
Keep the VPS backup until the school server's restore and backup jobs are verified.
