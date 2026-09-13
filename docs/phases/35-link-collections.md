# Phase 35 — Link collections

SALAAM now has a `Tautan` workspace for links users should not lose. It shows the
school-wide collection to every signed-in role and lets each user create private
collections. Administrators and teachers with `links.manage` can create and curate
school-wide collections.

The feature uses `link_collections` and `link_items` in migration `0033_link_collections.sql`
with a matching down script. URLs accept HTTP/HTTPS only, item descriptions are stored as
Markdown and rendered through the existing safe renderer, and create/update/archive actions
are audited. Validation: `tests/links.test.ts`, migration integration, typecheck pending an
existing `AuthService` mock mismatch in `tests/http.test.ts`, and `bun run build`.
