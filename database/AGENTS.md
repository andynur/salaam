# database — schema rules

Use skill `add-migration` for the step-by-step procedure.

- `migrations/NNNN_snake_case.sql` files apply in name order, in one transaction under an
  advisory lock. Applied names and SHA-256 checksums are stored in `schema_migrations`.
- Never edit, rename, or reorder an applied migration: a changed checksum stops
  `db:migrate` on every machine. Add the next number instead.
- Every migration has `migrations/down/<same name>.sql` that reverses it completely,
  dropping objects in reverse dependency order and deleting seeded permissions.
- Put invariants in the schema: foreign keys (composite keys such as
  `(activity_id, course_id)` keep rows inside their course), `CHECK` constraints, and
  unique or partial unique indexes. Services still validate for friendly messages.
- Follow the latest migration's conventions: `uuid PRIMARY KEY DEFAULT gen_random_uuid()`,
  `timestamptz NOT NULL DEFAULT clock_timestamp()`, `archived_at` for archiving,
  `published boolean`, append-only history rows for grades, reviews, and adjustments, and
  an index for each real query path.
- Kind-specific activity configuration lives in a settings table keyed by `activity_id`
  (see `assessment_settings`, `challenge_settings`).
- A migration that adds capabilities inserts them into `permissions` and
  `role_permissions`.
- Seeds: `seed/admin.ts` creates a development-only admin; `seed/bootstrap-admin.ts` creates
  the first admin in any environment and refuses when one exists; `seed/demo.ts` fills a
  freshly migrated development database with a full realistic demo dataset covering every
  delivered phase, and refuses if it already ran. It reuses the application's own award and
  notification code rather than writing derived rows by hand, and audits synthetic history
  under `demo_seed.*` event names. See the README's "Demo dataset"
  section.
