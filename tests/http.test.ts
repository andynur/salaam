import { expect, test } from "bun:test";
import { loadConfig } from "../src/core/config";
import { createHttpHandler, loginInput, requireSameOrigin } from "../src/core/http";
import type { AuthService } from "../src/core/auth/service";
import { HttpError } from "../src/core/errors";

const config = loadConfig({ DATABASE_URL: "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage" });
const unauthenticated = async () => { throw new HttpError(401, "UNAUTHENTICATED", "Silakan masuk untuk melanjutkan."); };
const auth: AuthService = { actor: async () => null, account: unauthenticated, changePassword: unauthenticated, login: async () => Response.json({ ok: true }), logout: async () => new Response(null, { status: 204 }) };
test("liveness does not touch DB; readiness returns safe 503", async () => {
  let checks = 0;
  const handle = createHttpHandler(config, auth, async () => { checks++; throw new Error("postgres://secret"); });
  const live = await handle(new Request("http://localhost:3000/health/live"));
  expect(live.status).toBe(200);
  expect(await live.json()).toEqual({ status: "ok" });
  expect(checks).toBe(0);
  expect(live.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
  expect(live.headers.get("x-content-type-options")).toBe("nosniff");
  const ready = await handle(new Request("http://localhost:3000/health/ready"));
  expect(ready.status).toBe(503);
  expect(await ready.text()).not.toContain("secret");
  expect(checks).toBe(1);
});
test("centralized unknown errors omit stack, credentials and details", async () => {
  const handle = createHttpHandler(config, { ...auth, actor: async () => { throw new Error("password=SECRET"); } }, async () => {});
  const result = await handle(new Request("http://localhost:3000/api/auth/me"));
  expect(result.status).toBe(500);
  expect(await result.json()).toMatchObject({ error: { code: "INTERNAL_ERROR", requestId: result.headers.get("x-request-id") } });
});
test("dashboard requires authentication", async () => {
  const result = await createHttpHandler(config, auth, async () => {})(new Request("http://localhost:3000/api/dashboard"));
  expect(result.status).toBe(401);
});
test("login and logout reject cross-origin and missing-origin writes", async () => {
  for (const origin of [undefined, "https://evil.example", "null"]) {
    const request = new Request("http://localhost:3000/api/auth/logout", { method: "POST", headers: origin ? { origin } : {} });
    expect(() => requireSameOrigin(request, config)).toThrow();
  }
  const handle = createHttpHandler(config, auth, async () => {});
  for (const path of ["login", "logout"]) {
    const result = await handle(new Request(`http://localhost:3000/api/auth/${path}`, { method: "POST" }));
    expect(result.status).toBe(403);
  }
});
test("login validates JSON and normalizes email", async () => {
  const request = (body: string, contentType = "application/json") => new Request(config.baseUrl, { method: "POST", headers: { "Content-Type": contentType }, body });
  expect(await loginInput(request(JSON.stringify({ email: " TEACHER@example.com ", password: "unchanged " })))).toEqual({ email: "teacher@example.com", password: "unchanged " });
  for (const invalid of ["null", "{}", "{", JSON.stringify({ email: "bad", password: "p" })]) {
    await expect(loginInput(request(invalid))).rejects.toThrow();
  }
  await expect(loginInput(request("{}", "text/plain"))).rejects.toThrow("JSON");
});

const loginRequest = (email: string, forwarded = "203.0.113.1") => new Request(`${config.baseUrl}/api/auth/login`, {
  method: "POST", headers: { origin: config.baseUrl, "content-type": "application/json", "x-forwarded-for": forwarded },
  body: JSON.stringify({ email, password: "test-password" }),
});
test("125 students behind one proxy have independent login budgets", async () => {
  const handle = createHttpHandler(config, auth, async () => {});
  for (let i = 0; i < 125; i++) expect((await handle(loginRequest(`student${i}@example.com`), "127.0.0.1")).status).toBe(200);
});
test("account throttle follows normalized email across source addresses and spoofed headers", async () => {
  const handle = createHttpHandler(config, auth, async () => {});
  for (let i = 0; i < 10; i++) expect((await handle(loginRequest("STUDENT@example.com"), `203.0.113.${i}`)).status).toBe(200);
  expect((await handle(loginRequest(" student@example.com ", "192.0.2.2"), "192.0.2.1")).status).toBe(429);
  expect((await handle(loginRequest("other@example.com"), "192.0.2.1")).status).toBe(200);
});
test("source throttle bounds attempts across accounts and ignores forwarded headers", async () => {
  const handle = createHttpHandler(config, auth, async () => {});
  for (let i = 0; i < 300; i++) expect((await handle(loginRequest(`student${i}@example.com`, `192.0.2.${i % 250}`), "127.0.0.1")).status).toBe(200);
  expect((await handle(loginRequest("another@example.com", "198.51.100.1"), "127.0.0.1")).status).toBe(429);
});
test("password verification remains limited to two concurrent logins", async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const handle = createHttpHandler(config, { ...auth, login: async () => { await blocked; return Response.json({ ok: true }); } }, async () => {});
  const first = handle(loginRequest("one@example.com"));
  const second = handle(loginRequest("two@example.com"));
  try {
    expect((await handle(loginRequest("three@example.com"))).status).toBe(429);
  } finally { release(); }
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
});
