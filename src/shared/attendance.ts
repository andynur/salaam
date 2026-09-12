import type { LearningCourse, Page } from "./learning";
export const attendanceLabels = { present: "Hadir", late: "Terlambat", excused: "Izin", sick: "Sakit", absent: "Alpa" } as const;
export type AttendanceStatus = keyof typeof attendanceLabels;
export const sessionLabels = { scheduled: "Terjadwal", open: "Berlangsung", closed: "Ditutup", cancelled: "Dibatalkan" } as const;
export type SessionStatus = keyof typeof sessionLabels;
export interface Meeting { id: string; courseId: string; title: string; startsAt: string; endsAt: string; status: SessionStatus; version: number; note: string | null; reason: string | null }
export interface AttendanceRow { studentId: string; studentName: string; identifier: string | null; recordId: string | null; status: AttendanceStatus | null; note: string | null; recordedAt: string | null }
export interface AttendanceCounts { total: number; unrecorded: number; present: number; late: number; excused: number; sick: number; absent: number }
export interface MeetingDetail { course: LearningCourse; session: Meeting; counts: AttendanceCounts; roster: Page<AttendanceRow>; checkin: CheckinState }
export interface AttendanceReport extends AttendanceCounts { studentId: string; studentName: string; closed: number; attended: number; rate: number | null }
// A check-in code proves presence while it is displayed; it never authenticates anyone.
export const checkinAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const checkinCodeLength = 10;
export const checkinCodePattern = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;
export interface CheckinWindow { status: "open" | "stopped"; rotateSeconds: number; lateAfter: string | null; checkedIn: number }
export interface CheckinState { window: CheckinWindow | null; me: { status: AttendanceStatus; createdAt: string } | null }
export interface CheckinCode { code: string; expiresAt: string; rotateSeconds: number }
