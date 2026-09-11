import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SQL } from "bun";

export interface Migration { name: string; sql: string; checksum: string }

export async function readMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter(name => name.endsWith(".sql")).sort();
  return Promise.all(names.map(async name => {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error(`Invalid migration filename: ${name}`);
    const sql = await Bun.file(join(directory, name)).text();
    return { name, sql, checksum: new Bun.CryptoHasher("sha256").update(sql).digest("hex") };
  }));
}

export function pendingMigrations(migrations: Migration[], applied: { name: string; checksum: string }[]): Migration[] {
  for (const existing of applied) {
    const source = migrations.find(migration => migration.name === existing.name);
    if (!source || source.checksum !== existing.checksum) throw new Error(`Applied migration changed or missing: ${existing.name}`);
  }
  const latest = applied.map(row => row.name).sort().at(-1);
  const pending = migrations.filter(migration => !applied.some(row => row.name === migration.name));
  if (latest && pending.some(migration => migration.name < latest)) throw new Error("Migration must follow the latest applied migration");
  return pending;
}

export async function migrate(db: SQL, directory = "database/migrations"): Promise<string[]> {
  const migrations = await readMigrations(directory);
  return db.begin(async tx => {
    // Transaction-scoped lock serializes concurrent deploys, including first boot.
    await tx`SELECT pg_advisory_xact_lock(741926301)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const applied = await tx<{ name: string; checksum: string }[]>`SELECT name, checksum FROM schema_migrations`;
    const pending = pendingMigrations(migrations, applied);
    for (const migration of pending) {
      // Only version-controlled SQL files enter this raw SQL boundary.
      await tx.unsafe(migration.sql).simple();
      await tx`INSERT INTO schema_migrations (name, checksum) VALUES (${migration.name}, ${migration.checksum})`;
    }
    return pending.map(migration => migration.name);
  });
}

// Rolls back exactly the most recently applied migration, using its hand-written
// down script. Names are sequential and application order is enforced by
// pendingMigrations, so the lexicographically latest applied name is the last one in.
export async function rollback(db: SQL, downDirectory = "database/migrations/down"): Promise<string | null> {
  return db.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(741926301)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const [latest] = await tx<{ name: string }[]>`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`;
    if (!latest) return null;
    const path = join(downDirectory, latest.name);
    if (!(await Bun.file(path).exists())) throw new Error(`Missing down migration: ${path}`);
    const sql = await Bun.file(path).text();
    // Same raw SQL boundary as migrate(): only version-controlled down files enter here.
    await tx.unsafe(sql).simple();
    await tx`DELETE FROM schema_migrations WHERE name = ${latest.name}`;
    return latest.name;
  });
}

// Rolls every applied migration back to an empty schema, then replays all migrations
// from scratch. Equivalent to Laravel's migrate:reset followed by migrate.
export async function reset(db: SQL, directory = "database/migrations", downDirectory = "database/migrations/down"): Promise<{ rolledBack: string[]; applied: string[] }> {
  const rolledBack: string[] = [];
  for (;;) {
    const name = await rollback(db, downDirectory);
    if (!name) break;
    rolledBack.push(name);
  }
  const applied = await migrate(db, directory);
  return { rolledBack, applied };
}
