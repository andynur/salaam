import type { Server, ServerWebSocket, SQL } from "bun";
import type { AuthService } from "./auth/service";
import type { Config } from "./config";
import { errorResponse, HttpError } from "./errors";
import { requireSameOrigin, securityHeaders } from "./http";
import { requirePermission } from "./permissions";
import { idField } from "./validation";
import { canReadMeeting } from "../modules/attendance/service";
export interface ClassroomSocket { request: Request; actorId: string; courseId: string; sessionId: string; checking: boolean; dirty: boolean }
// Socket payloads contain no student data. HTTP remains the canonical, scoped read path.
export function createAttendanceRealtime(db: SQL, auth: AuthService, config: Config) {
  const sockets = new Set<ServerWebSocket<ClassroomSocket>>();
  const counts = new Map<string, number>();
  let total = 0;
  async function refresh(ws: ServerWebSocket<ClassroomSocket>, changed: boolean) {
    if (ws.data.checking) { ws.data.dirty ||= changed; return; }
    ws.data.checking = true;
    try {
      do {
        const notify = changed || ws.data.dirty;
        ws.data.dirty = false;
        const actor = await auth.actor(ws.data.request);
        requirePermission(actor, "learning.view");
        await canReadMeeting(db, actor, ws.data.courseId, ws.data.sessionId);
        if (notify && sockets.has(ws)) ws.send(JSON.stringify({ type: "changed" }));
        changed = false;
      } while (ws.data.dirty && sockets.has(ws));
    } catch { ws.close(1008, "Akses sesi berakhir"); }
    finally { ws.data.checking = false; }
  }
  const timer = setInterval(() => { for (const ws of sockets) void refresh(ws, false); }, 10000);
  timer.unref();
  return {
    async upgrade(request: Request, server: Server<ClassroomSocket>) {
      const requestId = crypto.randomUUID();
      const headers = { ...securityHeaders(config.environment === "production"), "X-Request-ID": requestId, "Cache-Control": "no-store" };
      try {
        requireSameOrigin(request, config);
        if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
        const url = new URL(request.url);
        const courseId = idField({ id: url.searchParams.get("courseId") }, "id").toLowerCase();
        const sessionId = idField({ id: url.searchParams.get("sessionId") }, "id").toLowerCase();
        const actor = await auth.actor(request);
        requirePermission(actor, "learning.view");
        await canReadMeeting(db, actor, courseId, sessionId);
        if (total >= 512 || (counts.get(actor.id) ?? 0) >= 4) throw new HttpError(429, "SOCKET_LIMIT", "Terlalu banyak koneksi kelas. Tutup tab lain.");
        if (!server.upgrade(request, { headers, data: { request, actorId: actor.id, courseId, sessionId, checking: false, dirty: false } })) throw new HttpError(400, "INVALID_UPGRADE", "Koneksi kelas tidak valid.");
        total++; counts.set(actor.id, (counts.get(actor.id) ?? 0) + 1);
        return undefined;
      } catch (error) {
        const response = errorResponse(error, requestId);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        return response;
      }
    },
    websocket: {
      maxPayloadLength: 256,
      backpressureLimit: 4096,
      closeOnBackpressureLimit: true,
      idleTimeout: 60,
      sendPings: true,
      open(ws: ServerWebSocket<ClassroomSocket>) { sockets.add(ws); void refresh(ws, true); },
      message(ws: ServerWebSocket<ClassroomSocket>) { ws.close(1008, "Koneksi hanya untuk pembaruan kelas"); },
      close(ws: ServerWebSocket<ClassroomSocket>) { sockets.delete(ws); total--; const count = (counts.get(ws.data.actorId) ?? 1) - 1; if (count) counts.set(ws.data.actorId, count); else counts.delete(ws.data.actorId); },
    },
    changed(courseId: string, sessionId: string) { for (const ws of sockets) if (ws.data.courseId === courseId && ws.data.sessionId === sessionId) void refresh(ws, true); },
    stop() { clearInterval(timer); for (const ws of sockets) ws.close(1001, "Layanan dimulai ulang"); },
  };
}
