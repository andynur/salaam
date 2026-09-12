import { createCalendarHandler } from "./core/calendar-http";
import { startNotificationWorker } from "./modules/calendar/worker";
import { createAttendanceHandler } from "./core/attendance-http";
import { createAttendanceRealtime } from "./core/attendance-realtime";
import index from "./web/index.html";
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./core/config";
import { connectDatabase, checkDatabase } from "./core/database/connection";
import { createAuthService } from "./core/auth/service";
import { createHttpHandler, securityHeaders } from "./core/http";
import { brandAssetRoutes } from "./core/brand-assets";
import { errorResponse } from "./core/errors";
import { academicSummary } from "./modules/academic/summary";
import { learningTasks } from "./modules/learning/dashboard";
import { createFoundationHandler } from "./core/foundation-http";
import { createLearningHandler, maxLearningUploadRequestBytes } from "./core/learning-http";
import { createProjectHandler } from "./core/project-http";
import { createGamificationHandler } from "./core/gamification-http";
import { createReportingHandler } from "./core/reporting-http";
import { studentGrowthCard } from "./modules/gamification/service";
import { log } from "./core/logger";

const config = loadConfig();
await mkdir(config.storageRoot, { recursive: true, mode: 0o700 });
const db = connectDatabase(config.databaseUrl);
const auth = createAuthService(db, config);
const realtime = createAttendanceRealtime(db, auth, config);
const stopNotifications = startNotificationWorker(db);
const handle = createHttpHandler(config, auth, () => checkDatabase(db), { calendar: createCalendarHandler(db), attendance: createAttendanceHandler(db, realtime.changed), foundation: createFoundationHandler(db), learning: createLearningHandler(db, config.storageRoot), projects: createProjectHandler(db), gamification: createGamificationHandler(db), reports: createReportingHandler(db, config.timezone), dashboard: async actor => ({ ...(await academicSummary(db, actor, config.timezone)), tasks: await learningTasks(db, actor), growth: await studentGrowthCard(db, actor) }) });
// Bun 1.4.2 resolves prebuilt HTML assets from cwd. Resolve config/storage first,
// then use the bundle directory; development HTML imports do not need this.
if (index.files) process.chdir(import.meta.dir);
// Bun's ahead-of-time HTML manifest accepts headers on each generated asset.
for (const file of index.files ?? []) {
  Object.assign(file.headers, securityHeaders(config.environment === "production"));
  if (file.loader === "html") {
    file.headers["cache-control"] = "no-cache";
    file.headers["content-security-policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
  }
}
const brandRoutes = await brandAssetRoutes(config.environment === "production");
const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  development: config.environment === "development" ? { hmr: true, console: false } : false,
  // Sized for learning uploads; login, administration, and JSON routes enforce smaller limits.
  maxRequestBodySize: maxLearningUploadRequestBytes,
  routes: { ...brandRoutes, "/": index, "/login": index, "/dashboard": index, "/calendar": index, "/notifications": index, "/admin/users": index, "/admin/import": index, "/admin/academic": index, "/admin/audit": index, "/learning": index, "/learning/courses/:id": index, "/learning/courses/:id/attempts/:attemptId": index, "/projects": index, "/projects/:id": index, "/gamification": index, "/reports": index, "/attendance": index, "/attendance/courses/:id": index, "/attendance/courses/:id/sessions/:sessionId": index },
  websocket: realtime.websocket,
  fetch(request, server) { if (new URL(request.url).pathname === "/api/attendance/live") return realtime.upgrade(request, server); return handle(request, server.requestIP(request)?.address ?? "unknown"); },
  error(error) {
    const requestId = crypto.randomUUID();
    log({ level: "error", event: "http.unhandled", requestId });
    const response = errorResponse(error, requestId);
    response.headers.set("X-Request-ID", requestId);
    return response;
  },
});
log({ level: "info", event: "server.started" });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  realtime.stop();
  await stopNotifications();
  await server.stop();
  await db.close({ timeout: 5 });
  clearTimeout(timeout);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
