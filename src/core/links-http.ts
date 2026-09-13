import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { databaseInputError, idField, jsonObject } from "./validation";
import { HttpError } from "./errors";
import { archiveItem, createCollection, createItem, listLinks, updateCollection, updateItem } from "../modules/links/service";

export function createLinksHandler(db: SQL) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    const path = new URL(request.url).pathname;
    try {
      if (request.method === "GET" && path === "/api/links") return Response.json(await listLinks(db, actor!));
      if (request.method === "POST" && path === "/api/links/collections") return Response.json(await createCollection(db, actor!, await jsonObject(request, 16384), requestId), { status: 201 });
      const collection = path.match(/^\/api\/links\/collections\/([^/]+)$/);
      if (collection && request.method === "PATCH") return Response.json(await updateCollection(db, actor!, idField({ id: collection[1] }, "id"), await jsonObject(request, 16384), requestId));
      if (request.method === "POST" && path === "/api/links/items") return Response.json(await createItem(db, actor!, await jsonObject(request, 65536), requestId), { status: 201 });
      const item = path.match(/^\/api\/links\/items\/([^/]+)$/);
      if (item && request.method === "PATCH") return Response.json(await updateItem(db, actor!, idField({ id: item[1] }, "id"), await jsonObject(request, 65536), requestId));
      const archived = path.match(/^\/api\/links\/items\/([^/]+)\/archive$/);
      if (archived && request.method === "POST") return Response.json(await archiveItem(db, actor!, idField({ id: archived[1] }, "id"), requestId));
      throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
    } catch (error) { databaseInputError(error); }
  };
}
export type LinksHandler = ReturnType<typeof createLinksHandler>;
