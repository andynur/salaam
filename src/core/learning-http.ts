import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { requirePermission } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, idField, jsonObject, listInput, multipartInput } from "./validation";
import { fileResponse } from "./storage/files";
import { maxUploadBytes } from "../shared/learning";
import { archiveContent, completeLesson, courseDetail, courseProgress, listCourses, materialFile, publishContent, saveContent } from "../modules/learning/service";
import { grantDeadlineException, gradeHistory, gradeSubmission, listSubmissions, returnSubmission, saveActivity, submissionFile, submitActivity } from "../modules/activities/service";
import { archiveQuestion, listQuestions, saveQuestion } from "../modules/assessments/questions";
import { saveAssessment, setAssessmentItems } from "../modules/assessments/service";
import { attemptDetail, saveAnswer, startAttempt, submitAttempt } from "../modules/assessments/attempts";
import { adjustmentHistory, adjustScore, listAttempts } from "../modules/assessments/grading";
import { saveChallenge } from "../modules/projects/challenges";
import { createProject } from "../modules/projects/service";

// Room for multipart boundaries and text fields around one maximum-size file.
export const maxLearningUploadRequestBytes = maxUploadBytes + 256 * 1024;

function page<T>(rows: T[], offset: number) { return { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null }; }
export function createLearningHandler(db: SQL, storageRoot: string) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    requirePermission(actor, "learning.view");
    const url = new URL(request.url);
    const parts = url.pathname.slice("/api/learning/".length).split("/");
    const [root, course, resource, item, action] = parts;
    if (root !== "courses" || parts.length > 5) throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
    try {
      const { pattern, offset } = listInput(url);
      if (parts.length === 1 && request.method === "GET") return Response.json(page(await listCourses(db, actor, pattern, offset), offset));
      const courseId = idField({ courseId: course }, "courseId");
      if (request.method === "GET") {
        if (parts.length === 2) return Response.json(await courseDetail(db, actor, courseId));
        if (parts.length === 3 && resource === "progress") return Response.json(page(await courseProgress(db, actor, courseId, pattern, offset), offset));
        if (parts.length === 3 && resource === "questions") return Response.json(page(await listQuestions(db, actor, courseId, pattern, offset, url.searchParams.get("archived") === "1"), offset));
        if (parts.length === 4 && resource === "attempts") return Response.json(await attemptDetail(db, actor, courseId, idField({ id: item }, "id"), requestId));
        if (parts.length === 5) {
          const id = idField({ id: item }, "id");
          if (resource === "activities" && action === "submissions") return Response.json(page(await listSubmissions(db, actor, courseId, id, pattern, offset), offset));
          if (resource === "submissions" && action === "grades") return Response.json(page(await gradeHistory(db, actor, courseId, id, offset), offset));
          if (resource === "materials" && action === "file") return fileResponse(storageRoot, await materialFile(db, actor, courseId, id));
          if (resource === "submissions" && action === "file") return fileResponse(storageRoot, await submissionFile(db, actor, courseId, id));
          if (resource === "assessments" && action === "attempts") return Response.json(page(await listAttempts(db, actor, courseId, id, pattern, offset, requestId), offset));
          if (resource === "attempts" && action === "adjustments") return Response.json(page(await adjustmentHistory(db, actor, courseId, id, offset), offset));
        }
      } else if (request.method === "POST" || request.method === "PATCH") {
        const method = request.method;
        const id = item ? idField({ id: item }, "id") : undefined;
        const contentSave = (method === "POST" && parts.length === 3) || (method === "PATCH" && parts.length === 4 && id !== undefined);
        const submit = method === "POST" && parts.length === 5 && resource === "activities" && action === "submit";
        const itemAction = method === "POST" && parts.length === 5 && id !== undefined;
        // Only material authoring and assignment submission accept multipart uploads.
        const multipart = request.headers.get("content-type")?.split(";")[0]?.trim() === "multipart/form-data";
        const { body, file } = multipart && ((contentSave && resource === "materials") || submit)
          ? await multipartInput(request, maxLearningUploadRequestBytes)
          : { body: await jsonObject(request, 65536), file: null };
        let result: unknown;
        let created = false;
        if (method === "POST" && parts.length === 3 && resource === "publish") {
          result = await publishContent(db, actor, courseId, "courses", courseId, body, requestId);
        } else if (itemAction && action === "publish" && (resource === "modules" || resource === "lessons" || resource === "activities")) {
          result = await publishContent(db, actor, courseId, resource, id, body, requestId);
        } else if (itemAction && action === "archive" && (resource === "modules" || resource === "lessons" || resource === "materials" || resource === "activities")) {
          result = await archiveContent(db, actor, courseId, resource, id, body, requestId);
        } else if (itemAction && action === "archive" && resource === "questions") {
          result = await archiveQuestion(db, actor, courseId, id, body, requestId);
        } else if (itemAction && resource === "lessons" && action === "complete") {
          result = await completeLesson(db, actor, courseId, id, requestId);
        } else if (submit && id) {
          result = await submitActivity(db, storageRoot, actor, courseId, id, body, file, requestId);
        } else if (itemAction && resource === "submissions" && action === "grade") {
          result = await gradeSubmission(db, actor, courseId, id, body, requestId);
        } else if (itemAction && resource === "submissions" && action === "return") {
          result = await returnSubmission(db, actor, courseId, id, body, requestId);
        } else if (itemAction && resource === "activities" && action === "deadline-exception") {
          const studentId = idField(body, "studentId");
          result = await grantDeadlineException(db, actor, courseId, id, studentId, body, requestId);
        } else if (itemAction && resource === "assessments" && action === "items") {
          result = await setAssessmentItems(db, actor, courseId, id, body, requestId);
        } else if (itemAction && resource === "assessments" && action === "attempts") {
          const started = await startAttempt(db, actor, courseId, id, requestId);
          return Response.json(started, { status: started.resumed ? 200 : 201 });
        } else if (itemAction && resource === "attempts" && action === "answers") {
          result = await saveAnswer(db, actor, courseId, id, body);
        } else if (itemAction && resource === "attempts" && action === "submit") {
          result = await submitAttempt(db, actor, courseId, id, requestId);
        } else if (itemAction && resource === "attempts" && action === "adjust") {
          result = await adjustScore(db, actor, courseId, id, body, requestId);
        } else if (itemAction && resource === "challenges" && action === "projects") {
          const project = await createProject(db, actor, courseId, id, body, requestId);
          return Response.json(project, { status: project.resumed ? 200 : 201 });
        } else if (contentSave) {
          created = method === "POST";
          if (resource === "modules" || resource === "lessons" || resource === "materials") result = await saveContent(db, storageRoot, actor, courseId, resource, body, file, requestId, id);
          else if (resource === "activities") result = await saveActivity(db, actor, courseId, body, requestId, id);
          else if (resource === "questions") result = await saveQuestion(db, actor, courseId, body, requestId, id);
          else if (resource === "assessments") result = await saveAssessment(db, actor, courseId, body, requestId, id);
          else if (resource === "challenges") result = await saveChallenge(db, actor, courseId, body, requestId, id);
          else throw new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
        } else throw new HttpError(404, "NOT_FOUND", "Operasi tidak ditemukan.");
        return Response.json(result, { status: created ? 201 : 200 });
      }
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    } catch (error) { databaseInputError(error); }
  };
}
export type LearningHandler = ReturnType<typeof createLearningHandler>;
