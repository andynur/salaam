export type CalendarKind = "event" | "deadline" | "assessment_open" | "assessment_close" | "session";
export interface CalendarEntry {
  kind: CalendarKind; id: string; courseId: string | null; courseName: string | null; lessonId: string | null;
  title: string; description: string; startsAt: string; endsAt: string; version: number | null; canManage: boolean;
}
// Mirrors the `level BETWEEN 2 AND 12` CHECK in 0010_calendar_notifications.sql. Levels are
// derived from `levelThresholds`, which is meant to change without a backfill, so the ceiling
// lives here and is asserted against `maxLevel` in tests/calendar.test.ts.
export const maxNotifiableLevel = 12;
export interface NotificationPreferences { reminders: boolean; levelUp: boolean; checkin: boolean }
export interface NotificationItem {
  id: string; kind: "reminder" | "level_up" | "checkin"; status: "pending" | "delivered" | "suppressed";
  title: string; href: string; scheduledAt: string; deliveredAt: string | null; readAt: string | null;
}
export type AcademicCalendarCategory = "academic" | "holiday" | "assessment" | "student" | "learning";
export interface AcademicCalendarYear { id: string; name: string; startsOn: string; endsOn: string }
export interface AcademicCalendarClass { id: string; name: string }
export interface AcademicCalendarEvent {
  id: string; academicYearId: string; classId: string | null; className: string | null;
  title: string; description: string; category: AcademicCalendarCategory; startsOn: string; endsOn: string; version: number;
}
export interface AcademicCalendarData {
  year: AcademicCalendarYear; years: AcademicCalendarYear[]; classes: AcademicCalendarClass[];
  events: AcademicCalendarEvent[]; canManage: boolean;
}
export const calendarLabels: Record<CalendarKind, string> = {
  event: "Acara akademik", deadline: "Batas pengumpulan", assessment_open: "Asesmen dibuka", assessment_close: "Asesmen ditutup", session: "Sesi kelas",
};
export function calendarHref(entry: Pick<CalendarEntry, "kind" | "id" | "courseId" | "lessonId">) {
  if (entry.kind === "event") return `/calendar?event=${entry.id}`;
  if (entry.kind === "session") return `/attendance/courses/${entry.courseId}/sessions/${entry.id}`;
  return `/learning/courses/${entry.courseId}?lesson=${entry.lessonId}`;
}
