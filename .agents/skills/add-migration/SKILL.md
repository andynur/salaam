---
name: add-migration
description: Add a PostgreSQL schema change to SALAAM as the next numbered migration with a down script, seeded capabilities, and updated tests. Use for any new or changed table, column, constraint, index, or permission.
---

# Add a migration

1. Find the next number with `ls database/migrations`. Name the file `NNNN_snake_case.sql`
   (the runner requires `^\d{4}_[a-z0-9_]+\.sql$`). Never edit, rename, or reorder a file
   that has been applied anywhere; its checksum is recorded.
2. Write `database/migrations/NNNN_name.sql` in the style of the latest migration:
   - Open with a short comment naming the capabilities it uses or adds.
   - Use `uuid PRIMARY KEY DEFAULT gen_random_uuid()` and
     `timestamptz NOT NULL DEFAULT clock_timestamp()`.
   - Encode rules as `CHECK`, `UNIQUE`, partial unique indexes, and composite foreign keys
     that keep rows inside their course, for example
     `FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id)`.
   - A new activity kind gets a settings table keyed by `activity_id` with
     `FOREIGN KEY (activity_id, kind) REFERENCES activities(id, kind)`, like
     `challenge_settings` in `0005_project_learning.sql`.
   - Keep history append-only (a new row per grade, review, or adjustment) with an index
     that finds the latest row.
   - Add indexes for the queries the service will run.
   - New capabilities: insert into `permissions (key, description)` and `role_permissions`
     by role key, as in `0003_learning_core.sql`.
   - Don't write `BEGIN` or `COMMIT`; the runner wraps the file in a transaction.
3. Write `database/migrations/down/NNNN_name.sql` that reverses everything: drop tables with
   `DROP TABLE IF EXISTS … CASCADE` in reverse dependency order, drop added columns and
   constraints, and delete the seeded `role_permissions` and `permissions` rows.
4. Update `tests/database.integration.test.ts`: the rollback test expects the latest
   migration name and checks that the latest tables disappear.
5. In services, bind JSON as `${JSON.stringify(value)}::text::jsonb`, and let
   `databaseInputError` turn constraint errors into 409 or 400. Add integration tests that
   hit the new constraints.
6. Verify:

   ```sh
   TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test tests/database.integration.test.ts tests/migrations.test.ts
   bun run db:migrate    # local app database; a second run prints "Database is up to date."
   ```

   To exercise the down script on the local app database, run
   `bun run db:migrate:rollback && bun run db:migrate`. This drops the migration's data.
7. Mention it in the phase record: "Migration `NNNN_name.sql` with a matching down script."
