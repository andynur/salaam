import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput } from "./validation";
import { growthSummary, leaderboard, listBadges, listRules, saveBadge, updateRule } from "../modules/gamification/service";
import { leaderboardFilter, studentIdInput } from "../modules/gamification/input";

function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }
const routeNotFound = (message = "Halaman tidak ditemukan.") => new HttpError(404, "NOT_FOUND", message);

// Growth routes read the actor's own XP by default; reward rules and the badge catalogue
// are administration and check academic.manage in the service.
export function createGamificationHandler(db: SQL) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "learning.view");
    const url = new URL(request.url);
    const parts = url.pathname.slice("/api/gamification/".length).split("/");
    if (parts.length > 2 || parts.some(part => !part)) throw routeNotFound();
    try {
      const [resource, item] = parts;
      if (request.method === "GET") {
        const { pattern, offset } = listInput(url);
        if (parts.length === 1) {
          if (resource === "me") return Response.json(await growthSummary(db, actor, null));
          if (resource === "leaderboard") return Response.json(page(await leaderboard(db, actor, leaderboardFilter(url), pattern, offset), offset));
          if (resource === "rules") return Response.json(await listRules(db, actor));
          if (resource === "badges") return Response.json(page(await listBadges(db, actor, pattern, offset), offset));
        } else if (resource === "students" && item) {
          return Response.json(await growthSummary(db, actor, studentIdInput(item)));
        }
        throw routeNotFound();
      }
      if (request.method === "POST" || request.method === "PATCH") {
        const body = await jsonObject(request);
        if (request.method === "POST" && parts.length === 1 && resource === "badges") return Response.json(await saveBadge(db, actor, null, body, requestId), { status: 201 });
        if (request.method === "PATCH" && parts.length === 2 && item) {
          if (resource === "rules") return Response.json(await updateRule(db, actor, item, body, requestId));
          if (resource === "badges") return Response.json(await saveBadge(db, actor, idField({ id: item }, "id"), body, requestId));
        }
        throw routeNotFound("Operasi tidak ditemukan.");
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    } catch (error) { databaseInputError(error); }
  };
}
export type GamificationHandler = ReturnType<typeof createGamificationHandler>;
