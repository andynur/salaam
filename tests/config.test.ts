import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/core/config";

const env = { DATABASE_URL: "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "./storage" };
describe("configuration", () => {
  test("typed defaults and opaque-session expiry", () => {
    expect(loadConfig(env)).toMatchObject({ port: 3000, timezone: "Asia/Jakarta", sessionTtlSeconds: 43200 });
  });
  test.each(["0", "65536", "3000oops", "1.5", ""])('rejects invalid port %s', port => {
    expect(() => loadConfig({ ...env, PORT: port })).toThrow("PORT");
  });
  test("requires DB and storage without exposing secrets", () => {
    expect(() => loadConfig({ ...env, DATABASE_URL: undefined })).toThrow("DATABASE_URL");
    expect(() => loadConfig({ ...env, STORAGE_ROOT: undefined })).toThrow("STORAGE_ROOT");
    expect(() => loadConfig({ ...env, DATABASE_URL: "redis://secret:password@localhost/db" })).toThrow("Invalid DATABASE_URL");
  });
  test("production requires HTTPS and valid origin", () => {
    expect(() => loadConfig({ ...env, NODE_ENV: "production" })).toThrow("APP_BASE_URL");
    expect(loadConfig({ ...env, NODE_ENV: "production", APP_BASE_URL: "https://school.example" }).environment).toBe("production");
    expect(() => loadConfig({ ...env, APP_BASE_URL: "http://localhost/path" })).toThrow("APP_BASE_URL");
  });
  test("rejects invalid timezone and session lifetime", () => {
    expect(() => loadConfig({ ...env, SCHOOL_TIMEZONE: "Mars/Base" })).toThrow("SCHOOL_TIMEZONE");
    expect(() => loadConfig({ ...env, SESSION_TTL_HOURS: "169" })).toThrow("SESSION_TTL_HOURS");
    expect(() => loadConfig({ ...env, NODE_ENV: "prod" })).toThrow("NODE_ENV");
  });
  test("validates the optional isolated coding runner", () => {
    expect(loadConfig({ ...env, CODE_RUNNER_URL: "https://runner.example/execute", CODE_RUNNER_TOKEN: "0123456789abcdef" })).toMatchObject({
      codingRunnerUrl: "https://runner.example/execute", codingRunnerTimeoutMs: 5000,
    });
    expect(() => loadConfig({ ...env, CODE_RUNNER_URL: "https://runner.example/execute" })).toThrow("CODE_RUNNER_TOKEN");
    expect(() => loadConfig({ ...env, CODE_RUNNER_TOKEN: "0123456789abcdef" })).toThrow("CODE_RUNNER_URL");
    expect(() => loadConfig({ ...env, NODE_ENV: "production", APP_BASE_URL: "https://school.example", CODE_RUNNER_URL: "http://runner.example/execute", CODE_RUNNER_TOKEN: "0123456789abcdef" })).toThrow("CODE_RUNNER_URL");
    expect(() => loadConfig({ ...env, CODE_RUNNER_TIMEOUT_MS: "10001" })).toThrow("CODE_RUNNER_TIMEOUT_MS");
  });
});
