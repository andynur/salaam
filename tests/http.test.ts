import { expect, test } from "bun:test";
import { loadConfig } from "../src/core/config";
import { createHttpHandler, loginInput, requireSameOrigin } from "../src/core/http";
import type { AuthService } from "../src/core/auth/service";

const config = loadConfig({ DATABASE_URL: "postgres://localhost/hsi_test", APP_BASE_URL: "http://localhost:3000", STORAGE_ROOT: "storage" });
const auth: AuthService = { actor: async () => null, login: async () => Response.json({ ok: true }), logout: async () => new Response(null, { status: 204 }) };
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
