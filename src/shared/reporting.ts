// Reporting is read-only: every row is derived from learning, attendance, assessment,
// project and gamification tables, so nothing here is stored.
export const reportKinds = ["courses", "attendance", "progress", "audit"] as const;
export type ReportKind = typeof reportKinds[number];
export const reportLabels: Record<ReportKind, string> = {
  courses: "Ringkasan course",
  attendance: "Rekap kehadiran",
  progress: "Kemajuan belajar",
  audit: "Audit log",
};
export interface ReportScope { yearId: string | null; termId: string | null; classId: string | null; courseId: string | null }
export interface FilterOption { id: string; name: string; parentId: string | null }
export interface ReportFilterOptions { years: FilterOption[]; terms: FilterOption[]; classes: FilterOption[]; courses: FilterOption[]; events: string[]; canViewAudit: boolean }
export interface OverviewSummary {
  students: number; courses: number; publishedCourses: number; activities: number;
  lessons: number; lessonCompletionRate: number | null;
  sessions: number; closedSessions: number; attendanceRate: number | null;
  submissions: number; pendingGrading: number; averageScore: number | null;
  attempts: number; averageAttemptScore: number | null;
  projects: number; pendingReviews: number; xpAwarded: number;
}
export interface CourseReportRow {
  courseId: string; courseName: string; className: string; termName: string; subjectName: string; published: boolean;
  students: number; lessons: number; activities: number; sessions: number; attendanceRate: number | null;
  submissions: number; pendingGrading: number; averageScore: number | null;
}
export interface AttendanceSummaryRow {
  studentId: string; studentName: string; identifier: string | null; className: string;
  courses: number; total: number; unrecorded: number; present: number; late: number; excused: number; sick: number; absent: number;
  closed: number; attended: number; rate: number | null;
}
export interface ProgressReportRow {
  studentId: string; studentName: string; identifier: string | null; className: string;
  courses: number; lessons: number; completed: number; lessonRate: number | null;
  activities: number; submitted: number; graded: number; averageScore: number | null;
  attempts: number; averageAttemptScore: number | null; xp: number;
}
export interface AuditReportRow {
  id: string; event: string; actor: string | null; resourceType: string | null; resourceId: string | null;
  requestId: string | null; createdAt: string;
}
