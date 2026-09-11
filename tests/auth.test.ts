import { expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../src/core/auth/password";
import { createSessionToken, hashToken, readSessionToken, sessionCookie } from "../src/core/auth/session";
import { loadConfig } from "../src/core/config";
import { requirePermission, type Actor } from "../src/core/permissions";
import { LoginLimiter } from "../src/core/auth/rate-limit";

const config = loadConfig({ DATABASE_URL: "postgres://localhost/hsi_test", APP_BASE_URL: "https://school.example", STORAGE_ROOT: "storage", NODE_ENV: "production" });
test("Argon2id password verification and length limits", async () => {
  const hash = await hashPassword("test-only-long-password");
  expect(hash.startsWith("$argon2id$")).toBe(true);
  expect(await verifyPassword("test-only-long-password", hash)).toBe(true);
  expect(await verifyPassword("incorrect-password", hash)).toBe(false);
  expect(() => hashPassword("short")).toThrow();
  expect(await verifyPassword("x".repeat(129), hash)).toBe(false);
});
test("random opaque tokens, hashed persistence, production cookie and revocation", () => {
  const token = createSessionToken();
  expect(token).toHaveLength(43);
  expect(createSessionToken()).not.toBe(token);
  expect(hashToken(token)).toHaveLength(64);
  const cookie = sessionCookie(config, token);
  for (const flag of ["__Host-hsi_session=", "HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=43200"]) expect(cookie).toContain(flag);
  expect(sessionCookie(config, "", true)).toContain("Max-Age=0");
  expect(readSessionToken(new Request(config.baseUrl, { headers: { cookie } }), config)).toBe(token);
  expect(readSessionToken(new Request(config.baseUrl, { headers: { cookie: "__Host-hsi_session=bad" } }), config)).toBeNull();
});
test("authorization denies missing session and permission, even admin role alone", () => {
  const actor: Actor = { id: "test", displayName: "Test", roles: ["admin"], permissions: [] };
  expect(() => requirePermission(null, "dashboard:view")).toThrow("Silakan masuk");
  expect(() => requirePermission(actor, "dashboard:view")).toThrow("tidak memiliki akses");
  actor.permissions.push("dashboard:view");
  expect(() => requirePermission(actor, "dashboard:view")).not.toThrow();
});
test("login throttle rejects bursts and resets after window", () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 10; i++) limiter.consume("127.0.0.1", 0);
  expect(() => limiter.consume("127.0.0.1", 0)).toThrow("Terlalu banyak");
  expect(() => limiter.consume("127.0.0.2", 0)).not.toThrow();
  expect(() => limiter.consume("127.0.0.1", 900001)).not.toThrow();
});
