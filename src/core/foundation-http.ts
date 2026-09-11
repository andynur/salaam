import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, jsonObject, listInput } from "./validation";
import { createUser, listUsers } from "../modules/users/service";
import { createAcademic, listAcademic } from "../modules/academic/service";
import { listAudit } from "./audit/repository";
import { academicResources, type AcademicResource, type RecordPage, type RecordRow } from "../shared/foundation";

export function createFoundationHandler(db: SQL) {
  let activeCreates = 0;
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    const url = new URL(request.url);
    const resource = url.pathname.slice("/api/admin/".length);
    const academic = academicResources.includes(resource as AcademicResource);
    if (resource !== "users" && resource !== "audit" && !academic) throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
    requirePermission(actor, resource === "users" ? "admin.users.manage" : resource === "audit" ? "audit.view" : "academic.manage");
    if (request.method === "GET") {
      const { pattern, offset } = listInput(url);
      let rows: RecordRow[];
      if (resource === "users") rows = await listUsers(db, pattern, offset, url.searchParams.get("role") ?? "");
      else if (resource === "audit") rows = await listAudit(db, pattern, offset);
      else rows = await listAcademic(db, resource as AcademicResource, pattern, offset);
      const page: RecordPage = { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null };
      return Response.json(page);
    }
    if (request.method !== "POST" || resource === "audit") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    try {
      const body = await jsonObject(request);
      let created: { id: string };
      if (resource === "users") {
        if (activeCreates >= 2) throw new HttpError(429, "BUSY", "Pembuatan akun sedang sibuk. Silakan coba kembali.");
        activeCreates++;
        try { created = await createUser(db, body, actor.id, requestId); }
        finally { activeCreates--; }
      } else created = await createAcademic(db, resource as AcademicResource, body, actor.id, requestId);
      return Response.json(created, { status: 201 });
    } catch (error) { databaseInputError(error); }
  };
}
export type FoundationHandler = ReturnType<typeof createFoundationHandler>;
