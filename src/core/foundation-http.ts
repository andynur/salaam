import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput } from "./validation";
import { createUser, listUsers, resetPassword } from "../modules/users/service";
import { archiveAcademic, createAcademic, listAcademic, transferStudent } from "../modules/academic/service";
import { archiveInput, transferInput } from "../modules/academic/input";
import { updateUser } from "../modules/users/service";
import { listAudit } from "./audit/repository";
import { academicResources, type AcademicResource, type RecordPage, type RecordRow } from "../shared/foundation";
import { importStudents } from "../modules/academic/import";

export function createFoundationHandler(db: SQL) {
  let activeCreates = 0;
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    const url = new URL(request.url);
    const resource = url.pathname.slice("/api/admin/".length);
    const archive = /^academic\/(years|terms|classes)\/([^/]+)\/archive$/.exec(resource);
    if (archive) {
      requirePermission(actor, "academic.manage");
      if (request.method !== "PATCH") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      try { return Response.json(await archiveAcademic(db, archive[1] as "years" | "terms" | "classes", idField({ id: archive[2] }, "id").toLowerCase(), archiveInput(await jsonObject(request)), actor.id, requestId)); }
      catch (error) { databaseInputError(error); }
    }
    if (resource === "transfers") {
      requirePermission(actor, "academic.manage");
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      try { const input = transferInput(await jsonObject(request)); return Response.json(await transferStudent(db, input.studentId, input.toClassId, input.reason, actor.id, requestId), { status: 201 }); }
      catch (error) { databaseInputError(error); }
    }
    if (resource === "imports/students") {
      requirePermission(actor, "admin.users.manage");
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      try { return Response.json(await importStudents(db, actor.id, await jsonObject(request, 256 * 1024), requestId)); }
      catch (error) { databaseInputError(error); }
    }
    const recovery = /^users\/([^/]+)\/password$/.exec(resource);
    if (recovery) {
      requirePermission(actor, "admin.users.manage");
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      const userId = idField({ id: recovery[1] }, "id").toLowerCase();
      try { return Response.json(await resetPassword(db, userId, await jsonObject(request), actor.id, requestId)); }
      catch (error) { databaseInputError(error); }
    }
    const userEdit = /^users\/([^/]+)$/.exec(resource);
    if (userEdit) {
      requirePermission(actor, "admin.users.manage");
      if (request.method !== "PATCH") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      try { return Response.json(await updateUser(db, idField({ id: userEdit[1] }, "id").toLowerCase(), await jsonObject(request), actor.id, requestId)); }
      catch (error) { databaseInputError(error); }
    }
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
