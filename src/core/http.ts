import type { CalendarHandler } from "./calendar-http";
import type { Config } from "./config";
import type { AuthService } from "./auth/service";
import { LoginLimiter } from "./auth/rate-limit";
import { errorResponse, HttpError } from "./errors";
import { requirePermission } from "./permissions";
import { log } from "./logger";
import type { FoundationHandler } from "./foundation-http";
import type { Actor } from "./permissions";
import type { LearningHandler } from "./learning-http";
import type { ProjectHandler } from "./project-http";
import type { AttendanceHandler } from "./attendance-http";
import type { GamificationHandler } from "./gamification-http";
import type { ReportingHandler } from "./reporting-http";
import type { ShareHandler } from "./share-http";
import type { ClubHandler } from "./club-http";
import type { CurriculumHandler } from "./curriculum-http";
import type { LinksHandler } from "./links-http";
import { jsonObject } from "./validation";

export function securityHeaders(production: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...(production ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}

export function requireSameOrigin(request: Request, config: Config): void {
  if (request.headers.get("origin") !== config.baseUrl || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "INVALID_ORIGIN", "Permintaan tidak diizinkan. Muat ulang halaman.");
  }
}

export async function loginInput(request: Request): Promise<{ email: string; password: string }> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan format JSON.");
  }
  let body: unknown;
  body = await jsonObject(request);
  if (!body || typeof body !== "object" || !("email" in body) || !("password" in body) ||
    typeof body.email !== "string" || typeof body.password !== "string" ||
    body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    body.password.length < 1 || body.password.length > 128) {
    throw new HttpError(400, "INVALID_INPUT", "Isi email dan kata sandi yang valid.");
  }
  return { email: body.email.trim().toLowerCase(), password: body.password };
}

export function createHttpHandler(config: Config, auth: AuthService, ready: () => Promise<void>, services?: { foundation: FoundationHandler; dashboard: (actor: Actor) => Promise<unknown>; learning?: LearningHandler; projects?: ProjectHandler; gamification?: GamificationHandler; attendance?: AttendanceHandler; reports?: ReportingHandler; calendar?: CalendarHandler; share?: ShareHandler; clubs?: ClubHandler; curriculum?: CurriculumHandler; links?: LinksHandler }) {
  const limiter = new LoginLimiter();
  // A classroom shares a proxy/NAT address. Keep a coarse source budget plus account limits.
  // Forwarded headers remain untrusted; they cannot bypass either budget.
  const sourceLimiter = new LoginLimiter(300);
  let activeLogins = 0;
  return async (request: Request, ip = "unknown"): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    let response: Response;
    try {
      const path = new URL(request.url).pathname;
      const method = request.method;
      if (path === "/health/live" && method === "GET") {
        response = Response.json({ status: "ok" });
      } else if (path === "/health/ready" && method === "GET") {
        try { await ready(); }
        catch { throw new HttpError(503, "NOT_READY", "Layanan belum siap."); }
        response = Response.json({ status: "ready" });
      } else if (path === "/api/auth/login" && method === "POST") {
        requireSameOrigin(request, config);
        sourceLimiter.consume(ip);
        if (activeLogins >= 2) throw new HttpError(429, "BUSY", "Layanan sedang sibuk. Silakan coba kembali.");
        activeLogins++;
        try {
          const input = await loginInput(request);
          limiter.consume(`login:${input.email}`);
          response = await auth.login(input.email, input.password, request, requestId);
        } finally { activeLogins--; }
      } else if (path === "/api/auth/logout" && method === "POST") {
        requireSameOrigin(request, config);
        response = await auth.logout(request, requestId);
      } else if (path === "/api/auth/account" && method === "GET") {
        response = Response.json(await auth.account(request));
      } else if (path === "/api/auth/password" && method === "POST") {
        requireSameOrigin(request, config);
        sourceLimiter.consume(ip);
        const actor = await auth.actor(request);
        if (!actor) throw new HttpError(401, "UNAUTHENTICATED", "Silakan masuk untuk melanjutkan.");
        limiter.consume(`password:${actor.id}`);
        if (activeLogins >= 2) throw new HttpError(429, "BUSY", "Layanan sedang sibuk. Silakan coba kembali.");
        activeLogins++;
        try { response = Response.json(await auth.changePassword(request, await jsonObject(request), requestId)); }
        finally { activeLogins--; }
      } else if ((path === "/api/auth/me" || path === "/api/dashboard") && method === "GET") {
        const actor = await auth.actor(request);
        if (path === "/api/auth/me") {
          if (!actor) throw new HttpError(401, "UNAUTHENTICATED", "Silakan masuk untuk melanjutkan.");
          response = Response.json({ actor, timezone: config.timezone });
        } else {
          requirePermission(actor, "dashboard:view");
          response = Response.json(services ? await services.dashboard(actor) : { academic: null, courses: 0, classes: 0, tasks: [], events: [] });
        }
      } else if (path.startsWith("/api/learning/") && services?.learning) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.learning(request, await auth.actor(request), requestId);
      } else if ((path === "/api/projects" || path.startsWith("/api/projects/")) && services?.projects) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.projects(request, await auth.actor(request), requestId);
      } else if ((path === "/api/clubs" || path.startsWith("/api/clubs/")) && services?.clubs) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.clubs(request, await auth.actor(request), requestId);
      } else if ((path === "/api/curriculum" || path.startsWith("/api/curriculum/")) && services?.curriculum) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.curriculum(request, await auth.actor(request), requestId);
      } else if ((path === "/api/links" || path.startsWith("/api/links/")) && services?.links) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.links(request, await auth.actor(request), requestId);
      } else if (path.startsWith("/api/gamification/") && services?.gamification) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.gamification(request, await auth.actor(request), requestId);
      } else if (path.startsWith("/api/reports/") && services?.reports) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.reports(request, await auth.actor(request), requestId);
      } else if (path.startsWith("/api/attendance/") && services?.attendance) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.attendance(request, await auth.actor(request), requestId);
      } else if ((path === "/api/calendar" || path.startsWith("/api/calendar/") || path === "/api/notifications" || path.startsWith("/api/notifications/")) && services?.calendar) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.calendar(request, await auth.actor(request), requestId);
      } else if (path.startsWith("/share/") && services?.share) {
        // Public lesson pages: the slug is the only credential, so no session is read and
        // nothing but GET is accepted.
        if (method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
        response = await services.share(request);
      } else if (path.startsWith("/api/admin/") && services) {
        if (method !== "GET") requireSameOrigin(request, config);
        response = await services.foundation(request, await auth.actor(request), requestId);
      } else {
        throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
      }
    } catch (error) {
      response = errorResponse(error, requestId);
    }
    for (const [key, value] of Object.entries(securityHeaders(config.environment === "production"))) response.headers.set(key, value);
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "no-store");
    log({ level: response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info",
      event: "http.request", requestId, status: response.status, durationMs: Math.round(performance.now() - started) });
    return response;
  };
}
