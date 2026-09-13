import type { LearningCourse, Page } from "./learning";
export const attendanceLabels = { present: "Hadir", late: "Terlambat", excused: "Izin", sick: "Sakit", absent: "Alpa" } as const;
export type AttendanceStatus = keyof typeof attendanceLabels;
export const sessionLabels = { scheduled: "Terjadwal", open: "Berlangsung", closed: "Ditutup", cancelled: "Dibatalkan" } as const;
export type SessionStatus = keyof typeof sessionLabels;
export interface Meeting { id: string; courseId: string; title: string; startsAt: string; endsAt: string; status: SessionStatus; version: number; note: string | null; reason: string | null; seriesId?: string | null; occurrenceIndex?: number | null }
export interface MeetingSeriesInput { title: string; startsAt: string; endsAt: string; intervalDays: number; occurrenceCount: number; note: string; qrRotateSeconds: number; qrLateAfterMinutes: number | null; requestKey: string }
export interface AttendanceRow { studentId: string; studentName: string; identifier: string | null; recordId: string | null; status: AttendanceStatus | null; note: string | null; recordedAt: string | null; checkinStatus?: "present" | "late" | null; checkedInAt?: string | null }
export interface AttendanceDocumentation { id: string; caption: string; uploadedBy: string; uploaderName: string; createdAt: string; file: { id: string; name: string; mediaType: string; sizeBytes: number } }
export interface AttendanceCounts { total: number; unrecorded: number; present: number; late: number; excused: number; sick: number; absent: number }
export interface QrBreakdown { scanned: number; present: number; late: number; unscanned: number }
export interface MeetingDetail { course: LearningCourse; session: Meeting; counts: AttendanceCounts; qrBreakdown: QrBreakdown; roster: Page<AttendanceRow>; checkin: CheckinState; documentations: AttendanceDocumentation[] }
export interface RosterOption { studentId: string; studentName: string; identifier: string | null }
export interface AttendanceReport extends AttendanceCounts { studentId: string; studentName: string; closed: number; attended: number; rate: number | null }
// The Kehadiran landing agenda: today's sessions plus any still open, across every course in
// scope. Managers get roster progress; santri get only their own status.
export interface AgendaSession { id: string; courseId: string; courseName: string; className: string; title: string; startsAt: string; endsAt: string; status: SessionStatus; canManage: boolean; canAssist?: boolean; total: number | null; recorded: number | null; myStatus: AttendanceStatus | null; checkinOpen: boolean }
export interface CourseNextSession { courseId: string; courseName: string; sessionId: string; title: string; startsAt: string; endsAt: string; status: SessionStatus }
export interface AttendanceAgenda { now: string; sessions: AgendaSession[]; hasMore: boolean; courses: CourseNextSession[] }
export interface SessionEvent { id: string; sessionId: string; actorId: string; actorName: string; version: number; action: string; reason: string; note: string; createdAt: string }
// A check-in code proves presence while it is displayed; it never authenticates anyone.
export const checkinAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const checkinCodeLength = 10;
export const checkinCodePattern = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;
export interface CheckinWindow { status: "open" | "stopped"; rotateSeconds: number; lateAfter: string | null; checkedIn: number }
export interface CheckinState { window: CheckinWindow | null; me: { status: AttendanceStatus; createdAt: string } | null }
export interface CheckinCode { code: string; expiresAt: string; rotateSeconds: number }
