import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, invalid, jsonObject, multipartInput } from "./validation";
import { curriculumLimits } from "../shared/curriculum";
import { curriculumGradeParam } from "../modules/curriculum/input";
import { curriculumDetail, curriculumOverview, importCurriculumCsv, updateCurriculumGrade, updateCurriculumWeek } from "../modules/curriculum/service";

const routeNotFound = () => new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
function gradeKey(value: string) {
  const grade = curriculumGradeParam(value);
  if (!grade) throw new HttpError(404, "NOT_FOUND", "Kurikulum tidak ditemukan.");
  return grade;
}

export type CurriculumHandler = ReturnType<typeof createCurriculumHandler>;

// GET /api/curriculum, GET|PATCH /api/curriculum/grades/:grade, PATCH /api/curriculum/weeks/:id,
// and POST /api/curriculum/import (multipart `file`). Writes check academic.manage before
// reading the body.
export function createCurriculumHandler(db: SQL) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "learning.view");
    const url = new URL(request.url);
    const parts = url.pathname === "/api/curriculum" ? [] : url.pathname.slice("/api/curriculum/".length).split("/");
    if (parts.length > 2 || parts.some(part => !part)) throw routeNotFound();
    const [resource, key] = parts;
    try {
      if (request.method === "GET") {
        if (!resource) return Response.json(await curriculumOverview(db, actor));
        if (resource === "grades" && key) return Response.json(await curriculumDetail(db, actor, gradeKey(key)));
        throw routeNotFound();
      }
      if (request.method === "POST" && resource === "import" && !key) {
        requirePermission(actor, "academic.manage");
        const { file } = await multipartInput(request, curriculumLimits.csvBytes + 16384);
        if (!file) invalid("Pilih berkas CSV kurikulum.");
        if (file.size > curriculumLimits.csvBytes) throw new HttpError(413, "BODY_TOO_LARGE", "Berkas CSV maksimal 512 KB.");
        return Response.json(await importCurriculumCsv(db, actor, await file.text(), requestId));
      }
      if (request.method === "PATCH" && key && (resource === "grades" || resource === "weeks")) {
        requirePermission(actor, "academic.manage");
        const body = await jsonObject(request, 32768);
        if (resource === "grades") return Response.json(await updateCurriculumGrade(db, actor, gradeKey(key), body, requestId));
        return Response.json(await updateCurriculumWeek(db, actor, idField({ id: key }, "id"), body, requestId));
      }
      if (resource === "import" || resource === "grades" || resource === "weeks") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      throw routeNotFound();
    } catch (error) { databaseInputError(error); }
  };
}
