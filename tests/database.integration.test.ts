import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectDatabase } from "../src/core/database/connection";
import { migrate, readMigrations, reset, rollback } from "../src/core/database/migrations";
import { hashPassword } from "../src/core/auth/password";
import { createAuthService } from "../src/core/auth/service";
import { createHttpHandler } from "../src/core/http";
import { loadConfig } from "../src/core/config";
import { hashToken } from "../src/core/auth/session";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL integration (isolated temporary schema)", () => {
  let db: SQL;
  let handle: ReturnType<typeof createHttpHandler>;
  let userId: string;
  const schema = `hsi_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const email = `test-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();
  const config = loadConfig({ DATABASE_URL: url ?? "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage", NODE_ENV: "test" });
  const request = (path: string, options: RequestInit = {}) => new Request(`${config.baseUrl}${path}`, options);
  const login = (candidate: string = password, cookie = "") => handle(request("/api/auth/login", { method: "POST", headers: { origin: config.baseUrl, "Content-Type": "application/json", cookie }, body: JSON.stringify({ email, password: candidate }) }), crypto.randomUUID());

  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL database name must end with _test");
    // A single connection keeps the temporary search_path consistent. No public tables are touched.
    db = new SQL(url, { max: 1 });
    await db.unsafe(`CREATE SCHEMA ${schema}`);
    await db.unsafe(`SET search_path TO ${schema}`);
    await migrate(db);
    const rows = await db<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash) VALUES (${email}, 'Integration Admin', ${await hashPassword(password)}) RETURNING id`;
    userId = rows[0]!.id;
    await db`INSERT INTO user_roles SELECT ${userId}, id FROM roles WHERE key = 'admin'`;
    handle = createHttpHandler(config, createAuthService(db, config), async () => { await db`SELECT 1`; });
  });
  afterAll(async () => {
    if (db) { await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
  });

  test("migration replay is idempotent and constraints are enforced", async () => {
    expect(await migrate(db)).toEqual([]);
    await expect((async () => await db`INSERT INTO user_roles SELECT ${userId}, id FROM roles WHERE key = 'admin'`)()).rejects.toThrow();
    await expect((async () => await db`INSERT INTO user_roles (user_id, role_id) VALUES (${crypto.randomUUID()}, ${crypto.randomUUID()})`)()).rejects.toThrow();
  });
  test("bad migration rolls back schema and history atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hsi-migration-"));
    try {
      const migrations = await readMigrations("database/migrations");
      for (const migration of migrations) await Bun.write(join(directory, migration.name), migration.sql);
      await Bun.write(join(directory, "9999_failure.sql"), "CREATE TABLE should_rollback (id int); SELECT * FROM missing_relation;");
      await expect(migrate(db, directory)).rejects.toThrow();
      const rows = await db`SELECT to_regclass('should_rollback') AS relation`;
      expect(rows[0].relation).toBeNull();
      expect((await db`SELECT * FROM schema_migrations`).length).toBe(migrations.length);
    } finally { await rm(directory, { recursive: true }); }
  });
  test("login, session reload, permission revocation, expiry and logout", async () => {
    expect((await login("wrong-password")).status).toBe(401);
    const result = await login();
    expect(result.status).toBe(200);
    const cookie = result.headers.get("set-cookie")!.split(";")[0]!;
    const token = cookie.split("=")[1]!;
    const rows = await db`SELECT token_hash FROM sessions WHERE user_id = ${userId}`;
    expect(rows[0].token_hash).toBe(hashToken(token));
    const authenticated = (path: string) => handle(request(path, { headers: { cookie } }));
    expect((await authenticated("/api/auth/me")).status).toBe(200);
    expect((await authenticated("/api/dashboard")).status).toBe(200);
    await db`DELETE FROM user_roles WHERE user_id = ${userId}`;
    expect((await authenticated("/api/dashboard")).status).toBe(403);
    await db`INSERT INTO user_roles SELECT ${userId}, id FROM roles WHERE key = 'admin'`;
    await db`UPDATE users SET is_active = false WHERE id = ${userId}`;
    expect((await authenticated("/api/auth/me")).status).toBe(401);
    await db`UPDATE users SET is_active = true WHERE id = ${userId}`;
    const rotated = await login(password, cookie);
    expect((await authenticated("/api/auth/me")).status).toBe(401);
    const nextCookie = rotated.headers.get("set-cookie")!.split(";")[0]!;
    const logout = await handle(request("/api/auth/logout", { method: "POST", headers: { cookie: nextCookie, origin: config.baseUrl } }));
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await handle(request("/api/auth/me", { headers: { cookie: nextCookie } }))).status).toBe(401);
    const expiry = await login();
    const expiredCookie = expiry.headers.get("set-cookie")!.split(";")[0]!;
    await db`UPDATE sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE user_id = ${userId}`;
    expect((await handle(request("/api/auth/me", { headers: { cookie: expiredCookie } }))).status).toBe(401);
    expect((await db`SELECT * FROM audit_logs WHERE actor_id = ${userId}`).length).toBeGreaterThanOrEqual(4);
  });
  test("connection helper can reach PostgreSQL", async () => {
    const pool = connectDatabase(url!);
    try { expect((await pool`SELECT 1 AS ok`)[0].ok).toBe(1); }
    finally { await pool.close(); }
  });
  // Runs last: rollback/reset undo application data, so nothing after this may rely on it.
  test("rollback undoes exactly the latest migration; reset replays every migration from empty", async () => {
    expect(await rollback(db)).toBe("0015_assessment_rubrics.sql");
    expect((await db`SELECT to_regclass('assessment_rubrics') AS relation`)[0].relation).toBeNull();
    expect((await db`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'attempt_question_grades' AND column_name = 'breakdown'`).length).toBe(0);
    expect(await rollback(db)).toBe("0014_assessment_written_answers.sql");
    expect((await db`SELECT to_regclass('attempt_question_grades') AS relation`)[0].relation).toBeNull();
    expect((await db`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'attempt_answers' AND column_name = 'answer_text'`).length).toBe(0);
    expect(await rollback(db)).toBe("0013_submission_lifecycle.sql");
    for (const table of ["submission_returns", "submission_deadline_exceptions"]) {
      expect((await db`SELECT to_regclass(${table}) AS relation`)[0].relation).toBeNull();
    }
    expect((await db`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'submissions' AND column_name IN ('revision', 'status')`).length).toBe(0);
    expect(await rollback(db)).toBe("0012_academic_lifecycle.sql");
    expect((await db`SELECT to_regclass('class_transfers') AS relation`)[0].relation).toBeNull();
    expect((await db`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'classes' AND column_name = 'archived_at'`).length).toBe(0);
    expect(await rollback(db)).toBe("0011_roster_meeting_series.sql");
    expect((await db`SELECT to_regclass('classroom_meeting_series') AS relation`)[0].relation).toBeNull();
    for (const table of ["classroom_meeting_series"]) {
      expect((await db`SELECT to_regclass(${table}) AS relation`)[0].relation).toBeNull();
    }
    expect((await db`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'classroom_sessions' AND column_name = 'series_id'`).length).toBe(0);
    expect(await rollback(db)).toBe("0010_calendar_notifications.sql");
    for (const table of ["academic_events", "notifications", "notification_preferences", "calendar_sources", "calendar_audience"]) {
      expect((await db`SELECT to_regclass(${table}) AS relation`)[0].relation).toBeNull();
    }
    expect((await db`SELECT to_regclass('attendance_checkins') AS relation`)[0].relation).not.toBeNull();

    const allNames = (await readMigrations("database/migrations")).map(migration => migration.name);
    const result = await reset(db);
    expect(result.rolledBack).toEqual(allNames.slice(0, -6).reverse());
    expect(result.applied).toEqual(allNames);
    expect((await db`SELECT to_regclass('users') AS relation`)[0].relation).not.toBeNull();
    expect((await db`SELECT * FROM users`).length).toBe(0);

    for (let i = 0; i < allNames.length; i++) expect(await rollback(db)).not.toBeNull();
    expect(await rollback(db)).toBeNull();
    expect((await db`SELECT to_regclass('users') AS relation`)[0].relation).toBeNull();
    await migrate(db);
  });
});
