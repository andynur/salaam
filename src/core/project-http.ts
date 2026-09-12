import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput } from "./validation";
import { listProjects, projectDetail, reviewProject, setProjectMembers, showcaseProject, submitProject, updateProject } from "../modules/projects/service";
import { archiveTask, createTask, moveTask, updateTask } from "../modules/projects/board";
import { createTaskComment, listTaskComments } from "../modules/projects/comments";
import { archivePortfolio, listPortfolio, listShowcase, savePortfolio } from "../modules/projects/portfolio";
import { projectFilters } from "../modules/projects/input";

function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }
const routeNotFound = (message = "Halaman tidak ditemukan.") => new HttpError(404, "NOT_FOUND", message);

// Project routes address projects by ID; the service resolves the course and checks access.
export function createProjectHandler(db: SQL) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "learning.view");
    const url = new URL(request.url);
    const parts = url.pathname === "/api/projects" ? [] : url.pathname.slice("/api/projects/".length).split("/");
    if (parts.length > 4 || parts.some(part => !part)) throw routeNotFound();
    try {
      const [first, resource, item, action] = parts;
      if (request.method === "GET") {
        const { pattern, offset } = listInput(url);
        if (!first) {
          const { status, activityId } = projectFilters(url);
          return Response.json(page(await listProjects(db, actor, pattern, offset, status, activityId), offset));
        }
        if (parts.length === 1 && first === "showcase") return Response.json(page(await listShowcase(db, actor, pattern, offset), offset));
        if (parts.length === 1 && first === "portfolio") return Response.json(page(await listPortfolio(db, actor, offset), offset));
        if (parts.length === 1) return Response.json(await projectDetail(db, actor, idField({ id: first }, "id")));
        if (parts.length === 4 && resource === "tasks" && taskIdFrom(parts)) return Response.json(await listTaskComments(db, actor, idField({ id: first }, "id"), taskIdFrom(parts)!));
        throw routeNotFound();
      }
      if ((request.method === "POST" || request.method === "PATCH") && first) {
        const id = idField({ id: first }, "id");
        const taskId = resource === "tasks" && item ? idField({ id: item }, "id") : null;
        const body = await jsonObject(request, 65536);
        if (request.method === "PATCH") {
          if (parts.length === 1) return Response.json(await updateProject(db, actor, id, body, requestId));
          if (parts.length === 3 && taskId) return Response.json(await updateTask(db, actor, id, taskId, body));
        } else if (parts.length === 2) {
          if (resource === "tasks") return Response.json(await createTask(db, actor, id, body), { status: 201 });
          if (resource === "members") return Response.json(await setProjectMembers(db, actor, id, body, requestId));
          if (resource === "submit") return Response.json(await submitProject(db, actor, id, requestId));
          if (resource === "reviews") return Response.json(await reviewProject(db, actor, id, body, requestId));
          if (resource === "showcase") return Response.json(await showcaseProject(db, actor, id, body, requestId));
          if (resource === "portfolio") return Response.json(await savePortfolio(db, actor, id, body, requestId));
        } else if (parts.length === 3 && resource === "portfolio" && item === "archive") {
          return Response.json(await archivePortfolio(db, actor, id, body, requestId));
        } else if (parts.length === 4 && taskId) {
          if (resource === "tasks" && action === "comments") return Response.json(await createTaskComment(db, actor, id, taskId, body), { status: 201 });
          if (action === "move") return Response.json(await moveTask(db, actor, id, taskId, body));
          if (action === "archive") return Response.json(await archiveTask(db, actor, id, taskId, body));
        }
        throw routeNotFound("Operasi tidak ditemukan.");
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    } catch (error) { databaseInputError(error); }
  };
}

function taskIdFrom(parts: string[]) { return parts[1] === "tasks" && parts[2] && parts[3] === "comments" ? idField({ id: parts[2] }, "id") : null; }
export type ProjectHandler = ReturnType<typeof createProjectHandler>;
