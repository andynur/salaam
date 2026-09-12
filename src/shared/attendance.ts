import type { LearningCourse, Page } from "./learning";
export const attendanceLabels = { present: "Hadir", late: "Terlambat", excused: "Izin", sick: "Sakit", absent: "Alpa" } as const;
export type AttendanceStatus = keyof typeof attendanceLabels;
export const sessionLabels = { scheduled: "Terjadwal", open: "Berlangsung", closed: "Ditutup", cancelled: "Dibatalkan" } as const;
export type SessionStatus = keyof typeof sessionLabels;
export interface Meeting { id: string; courseId: string; title: string; startsAt: string; endsAt: string; status: SessionStatus; version: number; note: string | null; reason: string | null }
export interface AttendanceRow { studentId: string; studentName: string; identifier: string | null; recordId: string | null; status: AttendanceStatus | null; note: string | null; recordedAt: string | null }
export interface AttendanceCounts { total: number; unrecorded: number; present: number; late: number; excused: number; sick: number; absent: number }
export interface MeetingDetail { course: LearningCourse; session: Meeting; counts: AttendanceCounts; roster: Page<AttendanceRow> }
export interface AttendanceReport extends AttendanceCounts { studentId: string; studentName: string; closed: number; attended: number; rate: number | null }
