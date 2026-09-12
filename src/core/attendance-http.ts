import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput } from "./validation";
import { adjustRoster, attendanceReport, changeMeeting, createMeeting, createMeetingSeries, listMeetings, meetingDetail, recordAttendance, recordAttendanceBulk, rosterOptions, sessionHistory } from "../modules/attendance/service";
import { changeCheckinWindow, issueCheckinCode, submitCheckin } from "../modules/attendance/checkin";
export function createAttendanceHandler(db: SQL, changed: (courseId: string, sessionId: string) => void = () => {}) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "learning.view");
    const url = new URL(request.url);
    const rosterMatch = /^\/api\/attendance\/courses\/([^/]+)\/sessions\/([^/]+)\/(roster|roster-options)$/.exec(url.pathname);
    if (rosterMatch) {
      const rosterCourseId = idField({ id: rosterMatch[1] }, "id").toLowerCase();
      const rosterSessionId = idField({ id: rosterMatch[2] }, "id").toLowerCase();
      if (rosterMatch[3] === "roster-options" && request.method === "GET") return Response.json(await rosterOptions(db, actor, rosterCourseId, rosterSessionId));
      if (rosterMatch[3] === "roster" && request.method === "PATCH") {
        const result = await adjustRoster(db, actor, rosterCourseId, rosterSessionId, await jsonObject(request, 4096), requestId);
        changed(rosterCourseId, rosterSessionId);
        return Response.json(result);
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    }
    const match = /^\/api\/attendance\/courses\/([^/]+)\/(sessions|report)(?:\/([^/]+)(?:\/attendance\/([^/]+)|\/(checkin)(\/codes)?|\/(history|bulk-attendance))?)?$/.exec(url.pathname);
    if (!match) throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
    const courseId = idField({ id: match[1] }, "id").toLowerCase();
    const seriesRoute = match[3] === "series" && !match[4] && !match[5];
    const sessionId = match[3] && !seriesRoute ? idField({ id: match[3] }, "id").toLowerCase() : null;
    try {
      if (request.method === "GET" && sessionId && match[7] === "history") {
        const { offset } = listInput(url);
        return Response.json(await sessionHistory(db, actor, courseId, sessionId, offset));
      }
      if (request.method === "GET" && !match[4] && !match[5]) {
        const { pattern, offset } = listInput(url);
        if (match[2] === "report" && !sessionId) return Response.json(await attendanceReport(db, actor, courseId, pattern, offset));
        if (match[2] === "sessions") return Response.json(sessionId ? await meetingDetail(db, actor, courseId, sessionId, pattern, offset) : await listMeetings(db, actor, courseId, pattern, offset));
      }
      if (match[5] && sessionId && match[2] === "sessions") {
        if (request.method === "POST" && match[6]) return Response.json(await issueCheckinCode(db, actor, courseId, sessionId));
        if (request.method === "PATCH" && !match[6]) {
          const result = await changeCheckinWindow(db, actor, courseId, sessionId, await jsonObject(request, 4096), requestId);
          changed(courseId, sessionId);
          return Response.json(result);
        }
        if (request.method === "POST" && !match[6]) {
          const result = await submitCheckin(db, actor, courseId, sessionId, await jsonObject(request, 4096), requestId);
          changed(courseId, sessionId);
          return Response.json(result, { status: 201 });
        }
        throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
      }
      if (match[2] === "sessions") {
        if (request.method === "POST" && seriesRoute) {
          const result = await createMeetingSeries(db, actor, courseId, await jsonObject(request, 16384), requestId);
          changed(courseId, result.id);
          return Response.json(result, { status: 201 });
        }
        if (request.method === "POST" && !sessionId) {
          const result = await createMeeting(db, actor, courseId, await jsonObject(request, 16384), requestId);
          changed(courseId, result.id);
          return Response.json(result, { status: 201 });
        }
        if (request.method === "PATCH" && sessionId) {
          const body = await jsonObject(request, 16384);
          const result = match[4] ? await recordAttendance(db, actor, courseId, sessionId, idField({ id: match[4] }, "id"), body, requestId) : await changeMeeting(db, actor, courseId, sessionId, body, requestId);
          changed(courseId, sessionId);
          return Response.json(result);
        }
        if (request.method === "POST" && sessionId && match[7] === "bulk-attendance") {
          const result = await recordAttendanceBulk(db, actor, courseId, sessionId, await jsonObject(request, 65536), requestId);
          changed(courseId, sessionId);
          return Response.json(result);
        }
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    } catch (error) { databaseInputError(error); }
  };
}
export type AttendanceHandler = ReturnType<typeof createAttendanceHandler>;
