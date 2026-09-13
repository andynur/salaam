import type { SQL } from "bun";
import type { ProjectStatus } from "../shared/project";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput } from "./validation";
import { archiveClub, clubCandidates, clubChallenges, clubCourses, clubDetail, clubMeetings, clubMembers, clubProgress, createClub, listClubs, publishClub, setClubCourse, setClubGoals, setClubMember, updateClub } from "../modules/club/service";
import { listProjects } from "../modules/projects/service";
import { projectFilters } from "../modules/projects/input";
import { clubGroupCandidates, clubGroups, clubTracks, setClubGroup, setClubGroupMember, setClubTrack } from "../modules/club/groups";
import { clubGroupFilter, clubMeetingFilter, clubMemberFilter } from "../modules/club/input";
import { clubAccess } from "../modules/club/access";

function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }
const routeNotFound = (message = "Halaman tidak ditemukan.") => new HttpError(404, "NOT_FOUND", message);

// Club routes only orchestrate: every tab reads through the club's own scope check first and
// then through the scope rules of learning, projects, attendance and gamification.
export function createClubHandler(db: SQL) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "club.view");
    const url = new URL(request.url);
    const parts = url.pathname === "/api/clubs" ? [] : url.pathname.slice("/api/clubs/".length).split("/");
    if (parts.length > 2 || parts.some(part => !part)) throw routeNotFound();
    try {
      const [first, resource] = parts;
      const { pattern, offset } = listInput(url);
      if (request.method === "GET") {
        if (!first) return Response.json(page(await listClubs(db, actor, pattern, offset, url.searchParams.get("archived") === "1"), offset));
        const clubId = idField({ id: first }, "id");
        if (parts.length === 1) return Response.json(await clubDetail(db, actor, clubId));
        switch (resource) {
          case "courses": return Response.json(page(await clubCourses(db, actor, clubId, pattern, offset), offset));
          case "challenges": return Response.json(page(await clubChallenges(db, actor, clubId), offset));
          case "meetings": return Response.json(page(await clubMeetings(db, actor, clubId, pattern, offset, clubMeetingFilter(url)), offset));
          case "members": return Response.json(page(await clubMembers(db, actor, clubId, pattern, offset, clubMemberFilter(url)), offset));
          case "candidates": return Response.json(page(await clubCandidates(db, actor, clubId, pattern, offset), offset));
          case "progress": return Response.json(page(await clubProgress(db, actor, clubId, pattern, offset), offset));
          case "projects": return Response.json(page(await clubProjects(db, actor, clubId, pattern, offset, projectFilters(url).status), offset));
          case "tracks": return Response.json(page(await clubTracks(db, actor, clubId), offset));
          case "groups": {
            const filter = clubGroupFilter(url);
            return Response.json(page(await clubGroups(db, actor, clubId, pattern, offset, filter.trackId, filter.level), offset));
          }
          case "group-candidates": return Response.json(page(await clubGroupCandidates(db, actor, clubId, pattern, offset), offset));
        }
        throw routeNotFound();
      }
      if (request.method === "POST" && !first) {
        const created = await createClub(db, actor, await jsonObject(request, 65536), requestId);
        return Response.json(created, { status: 201 });
      }
      if ((request.method === "POST" || request.method === "PATCH") && first) {
        const clubId = idField({ id: first }, "id");
        const body = await jsonObject(request, 65536);
        if (request.method === "PATCH" && parts.length === 1) return Response.json(await updateClub(db, actor, clubId, body, requestId));
        if (request.method === "POST" && parts.length === 2) {
          if (resource === "archive") return Response.json(await archiveClub(db, actor, clubId, body, requestId));
          if (resource === "publish") return Response.json(await publishClub(db, actor, clubId, body, requestId));
          if (resource === "goals") return Response.json(await setClubGoals(db, actor, clubId, body, requestId));
          if (resource === "members") return Response.json(await setClubMember(db, actor, clubId, body, requestId));
          if (resource === "courses") return Response.json(await setClubCourse(db, actor, clubId, body, requestId));
          if (resource === "tracks") return Response.json(await setClubTrack(db, actor, clubId, body, requestId));
          if (resource === "groups") return Response.json(await setClubGroup(db, actor, clubId, body, requestId));
          if (resource === "group-members") return Response.json(await setClubGroupMember(db, actor, clubId, body, requestId));
        }
        throw routeNotFound("Operasi tidak ditemukan.");
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    } catch (error) { databaseInputError(error); }
  };
}

// Club projects are the existing project list filtered to the club's linked courses; a
// student still sees only their own projects.
async function clubProjects(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number, status: ProjectStatus | null) {
  await clubAccess(db, actor, clubId);
  requirePermission(actor, "learning.view");
  return listProjects(db, actor, pattern, offset, status, null, clubId);
}
export type ClubHandler = ReturnType<typeof createClubHandler>;
