#!/usr/bin/env bash
# Build a portable Bun JavaScript release; no secrets, dependencies, or school data.
set -euo pipefail
cd "$(dirname "$0")/.."
artifact=${1:?Usage: bash deploy/package.sh /absolute/path/release.tgz}
[[ "$artifact" = /* ]] || { echo "Use an absolute artifact path" >&2; exit 1; }
[[ "$(bun --version)" = "1.4.2" ]] || { echo "Bun 1.4.2 is required" >&2; exit 1; }
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
bun run build
mkdir -p "$stage/ops" "$stage/database"
cp -R dist "$stage/dist"
cp -R database/migrations "$stage/database/migrations"
bun build --target=bun --minify --outfile="$stage/ops/migrate.js" src/core/database/migrate.ts
bun build --target=bun --minify --outfile="$stage/ops/bootstrap-admin.js" database/seed/bootstrap-admin.ts
bun build --target=bun --minify --outfile="$stage/ops/backup.js" scripts/backup.ts
cp -R deploy "$stage/deploy"
git rev-parse HEAD > "$stage/SOURCE_COMMIT"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree snapshot; includes uncommitted changes." > "$stage/SOURCE_STATE"
else
  echo "Clean commit." > "$stage/SOURCE_STATE"
fi
COPYFILE_DISABLE=1 tar --format=ustar -czf "$artifact" -C "$stage" .
shasum -a 256 "$artifact"
