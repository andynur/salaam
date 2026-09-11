import { expect, test } from "bun:test";
import { pendingMigrations, readMigrations } from "../src/core/database/migrations";

test("migration discovery validates and hashes actual SQL files", async () => {
  const migrations = await readMigrations("database/migrations");
  expect(migrations[0]?.name).toBe("0001_identity.sql");
  expect(migrations[0]?.checksum).toHaveLength(64);
  expect(migrations[0]?.sql).toContain("CREATE TABLE sessions");
});
test("history rejects drift, missing source and out-of-order additions", () => {
  const migration = { name: "0002_test.sql", checksum: "abc", sql: "SELECT 1" };
  expect(pendingMigrations([migration], [])).toEqual([migration]);
  expect(pendingMigrations([migration], [migration])).toEqual([]);
  expect(() => pendingMigrations([migration], [{ ...migration, checksum: "edited" }])).toThrow("changed");
  expect(() => pendingMigrations([], [migration])).toThrow("missing");
  expect(() => pendingMigrations([{ ...migration, name: "0001_old.sql" }, migration], [migration])).toThrow("latest");
});
