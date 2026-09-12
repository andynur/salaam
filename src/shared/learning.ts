import type { Assessment } from "./assessment";
import type { Challenge } from "./project";

export interface Page<T> { items: T[]; nextOffset: number | null }
export interface StoredFile { id: string; name: string; mediaType: string; sizeBytes: number }
export interface LearningCourse { id: string; name: string; className: string; term: string; year: string; published: boolean; canManage: boolean }
export interface CourseModule { id: string; title: string; position: number; published: boolean; archived: boolean }
export interface Lesson { id: string; moduleId: string; title: string; content: string; position: number; published: boolean; archived: boolean; completed: boolean }
export interface Material { id: string; lessonId: string; title: string; kind: "text" | "link" | "file"; content: string; file: StoredFile | null; archived: boolean }
export interface Grade { id: string; score: number; feedback: string; createdAt: string }
export interface Submission { id: string; activityId: string; studentId: string; studentName: string; content: string; file: StoredFile | null; submittedAt: string; grade: Grade | null }
export interface Activity { id: string; lessonId: string; kind: "assignment"; title: string; instructions: string; dueAt: string | null; published: boolean; archived: boolean; submission: Submission | null }
export interface Progress { studentId: string; studentName: string; lessons: number; completed: number; activities: number; submitted: number; graded: number }
export interface CourseDetail { course: LearningCourse; canParticipate: boolean; modules: CourseModule[]; lessons: Lesson[]; materials: Material[]; activities: Activity[]; assessments: Assessment[]; challenges: Challenge[]; progress: Progress | null }
// `projectId` is set for a student's challenge task when their project already exists.
export interface LearningTask { type: "assignment" | "quiz" | "exam" | "lesson" | "grading" | "challenge" | "review" | "attendance"; id: string; courseId: string; courseName: string; lessonId: string; title: string; dueAt: string | null; pending: number; projectId?: string | null }

// Extension allowlist for uploads. The server also checks each file's leading bytes.
export const uploadTypes = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
} as const;
export const maxUploadBytes = 10 * 1024 * 1024;
