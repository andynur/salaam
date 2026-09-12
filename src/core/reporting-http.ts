import type { SQL } from "bun";
import type { Actor } from "./permissions";
import { HttpError } from "./errors";
import { databaseInputError, listInput } from "./validation";
import { attendanceSummary, auditReport, courseReport, exportRowLimit, filterOptions, overview, page, progressReport, reportTrends, recordExport } from "../modules/reporting/service";
import { auditFilters, reportScope } from "../modules/reporting/input";
import { csvResponse, type CsvValue } from "../modules/reporting/csv";
import { attendanceLabels } from "../shared/attendance";
import { reportKinds, type ReportKind } from "../shared/reporting";

const routeNotFound = () => new HttpError(404, "NOT_FOUND", "Halaman tidak ditemukan.");
type CsvRow = Record<string, CsvValue>;
const columns: Record<ReportKind, { headers: string[]; cells: (row: CsvRow) => CsvValue[] }> = {
  courses: {
    headers: ["Course", "Kelas", "Semester", "Mata pelajaran", "Terbit", "Santri", "Pelajaran", "Aktivitas", "Sesi", "Kehadiran (%)", "Pengumpulan", "Belum dinilai", "Rata-rata nilai"],
    cells: row => [row.courseName, row.className, row.termName, row.subjectName, row.published, row.students, row.lessons, row.activities, row.sessions, row.attendanceRate, row.submissions, row.pendingGrading, row.averageScore],
  },
  attendance: {
    headers: ["Santri", "NIS", "Kelas", "Course", "Sesi", "Belum tercatat", attendanceLabels.present, attendanceLabels.late, attendanceLabels.excused, attendanceLabels.sick, attendanceLabels.absent, "Sesi ditutup", "Hadir di sesi ditutup", "Kehadiran (%)"],
    cells: row => [row.studentName, row.identifier, row.className, row.courses, row.total, row.unrecorded, row.present, row.late, row.excused, row.sick, row.absent, row.closed, row.attended, row.rate],
  },
  progress: {
    headers: ["Santri", "NIS", "Kelas", "Course", "Pelajaran", "Selesai", "Pelajaran (%)", "Tugas", "Dikumpulkan", "Dinilai", "Rata-rata nilai", "Kuis & ujian", "Rata-rata skor (%)", "XP"],
    cells: row => [row.studentName, row.identifier, row.className, row.courses, row.lessons, row.completed, row.lessonRate, row.activities, row.submitted, row.graded, row.averageScore, row.attempts, row.averageAttemptScore, row.xp],
  },
  audit: {
    headers: ["Waktu", "Peristiwa", "Aktor", "Jenis sumber", "ID sumber", "ID permintaan"],
    cells: row => [row.createdAt, row.event, row.actor, row.resourceType, row.resourceId, row.requestId],
  },
};

// Reporting is read-only and cross-course: every route is a GET, scope comes from the
// query string, and an export repeats the same query with a hard row cap.
export function createReportingHandler(db: SQL, timezone: string) {
  return async (request: Request, actor: Actor | null, requestId: string): Promise<Response> => {
    const url = new URL(request.url);
    const resource = url.pathname.slice("/api/reports/".length);
    if (request.method !== "GET") throw new HttpError(405, "METHOD_NOT_ALLOWED", "Operasi tidak tersedia.");
    const csv = resource.endsWith(".csv");
    const name = csv ? resource.slice(0, -".csv".length) : resource;
    try {
      if (!csv) {
        if (resource === "filters") return Response.json(await filterOptions(db, actor));
        if (resource === "overview") return Response.json(await overview(db, actor, reportScope(url)));
        if (resource === "trends") return Response.json(await reportTrends(db, actor, reportScope(url), timezone));
      }
      if (!reportKinds.includes(name as ReportKind)) throw routeNotFound();
      const kind = name as ReportKind;
      const { pattern, offset } = listInput(url);
      const scope = reportScope(url);
      const limit = csv ? exportRowLimit : 51;
      const start = csv ? 0 : offset;
      const rows: CsvRow[] = (kind === "courses" ? await courseReport(db, actor, scope, pattern, start, limit)
        : kind === "attendance" ? await attendanceSummary(db, actor, scope, pattern, start, limit)
        : kind === "progress" ? await progressReport(db, actor, scope, pattern, start, limit)
        : await auditReport(db, actor, auditFilters(url), timezone, pattern, start, limit)) as unknown as CsvRow[];
      if (!csv) return Response.json(page(rows, offset));
      await recordExport(db, actor!, kind, scope, requestId);
      const { headers, cells } = columns[kind];
      return csvResponse(`laporan-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows.map(cells));
    } catch (error) { databaseInputError(error); }
  };
}
export type ReportingHandler = ReturnType<typeof createReportingHandler>;
