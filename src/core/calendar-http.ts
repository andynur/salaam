import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput } from "./validation";
import { calendarEntries, createEvent, eventDetail, updateEvent } from "../modules/calendar/service";
import { inbox, markRead, preferences, savePreferences } from "../modules/calendar/notifications";
export function createCalendarHandler(db: SQL) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "dashboard:view");
    const url = new URL(request.url), path = url.pathname, method = request.method;
    try {
      if (method === "GET") {
        if (path === "/api/calendar") return Response.json(await calendarEntries(db, actor, url));
        if (path === "/api/notifications") return Response.json(await inbox(db, actor, listInput(url).offset, url.searchParams.get("unread") === "true"));
        if (path === "/api/notifications/preferences") return Response.json(await preferences(db, actor));
        const match = path.match(/^\/api\/calendar\/events\/([^/]+)$/);
        if (match) return Response.json(await eventDetail(db, actor, idField({ id: match[1] }, "id")));
      }
      if (method === "POST" || method === "PATCH") {
        const body = await jsonObject(request, 16384);
        if (path === "/api/calendar/events" && method === "POST") return Response.json(await createEvent(db, actor, body, requestId), { status: 201 });
        if (path === "/api/notifications/preferences" && method === "PATCH") return Response.json(await savePreferences(db, actor, body, requestId));
        const event = path.match(/^\/api\/calendar\/events\/([^/]+)$/);
        if (event && method === "PATCH") return Response.json(await updateEvent(db, actor, idField({ id: event[1] }, "id"), body, requestId));
        const read = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
        if (read && method === "POST") return Response.json(await markRead(db, actor, idField({ id: read[1] }, "id")));
      }
      throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
    } catch (error) { databaseInputError(error); }
  };
}
export type CalendarHandler = ReturnType<typeof createCalendarHandler>;
