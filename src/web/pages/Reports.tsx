import { useState, type ReactNode } from "react";
import type { Actor } from "../../core/permissions";
import type { Page } from "../../shared/learning";
import { attendanceLabels } from "../../shared/attendance";
import type {
  AttendanceSummaryRow, AuditReportRow, CourseReportRow, OverviewSummary,
  ProgressReportRow, ReportFilterOptions, ReportKind, ReportScope,
} from "../../shared/reporting";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Pager, Search, formatDateTime, useData } from "../components/learning";
import { Icon, type IconName } from "../components/icons";

const emptyScope: ReportScope = { yearId: null, termId: null, classId: null, courseId: null };
const percent = (value: number | null) => value === null ? "—" : `${value}%`;
const score = (value: number | null) => value === null ? "—" : String(value);

function query(scope: ReportScope, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...scope, ...extra })) if (value) params.set(key, value);
  return params;
}

// One filter bar drives every report. Terms and classes belong to a year, courses to a
// term, so choosing a wider filter clears the narrower ones instead of leaving a
// combination that matches nothing.
function ScopeFilters({ options, scope, change }: { options: ReportFilterOptions; scope: ReportScope; change: (scope: ReportScope) => void }) {
  const terms = options.terms.filter(term => !scope.yearId || term.parentId === scope.yearId);
  const classes = options.classes.filter(item => !scope.yearId || item.parentId === scope.yearId);
  const courses = options.courses.filter(course => !scope.termId || course.parentId === scope.termId);
  const select = (label: string, key: keyof ReportScope, items: { id: string; name: string }[], next: Partial<ReportScope>) =>
    <label className="report-filter" key={key}><span>{label}</span>
      <select className="input filter-select" value={scope[key] ?? ""} onChange={event => change({ ...scope, ...next, [key]: event.target.value || null })}>
        <option value="">Semua</option>
        {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>;
  return <div className="filter-bar report-filters">
    {select("Tahun ajaran", "yearId", options.years, { termId: null, classId: null, courseId: null })}
    {select("Semester", "termId", terms, { courseId: null })}
    {select("Kelas", "classId", classes, {})}
    {select("Course", "courseId", courses, {})}
    <Button className="button-secondary button-small" onClick={() => change(emptyScope)}>Atur ulang</Button>
  </div>;
}

function ExportLink({ kind, params }: { kind: ReportKind; params: URLSearchParams }) {
  return <a className="button button-secondary button-small" href={`/api/reports/${kind}.csv?${params}`}>
    <Icon name="archive" />Unduh CSV
  </a>;
}

function Overview({ scope, onExpired }: { scope: ReportScope; onExpired: () => void }) {
  const { data, error, retry } = useData<OverviewSummary>(`/api/reports/overview?${query(scope)}`, onExpired);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  const stats: { icon: IconName; tone: string; label: string; value: string | number; hint: string }[] = [
    { icon: "users", tone: "stat-blue", label: "Santri", value: data.students, hint: "Santri aktif di kelas yang tercakup filter." },
    { icon: "book", tone: "stat-purple", label: "Course", value: `${data.publishedCourses}/${data.courses}`, hint: "Course terbit dibanding seluruh course." },
    { icon: "attendance", tone: "stat-gold", label: "Kehadiran", value: percent(data.attendanceRate), hint: `${data.closedSessions} sesi ditutup dari ${data.sessions} sesi.` },
    { icon: "check", tone: "stat-blue", label: "Pelajaran selesai", value: percent(data.lessonCompletionRate), hint: `${data.lessons} pelajaran dalam cakupan.` },
    { icon: "pen", tone: "stat-gold", label: "Menunggu penilaian", value: data.pendingGrading, hint: `${data.submissions} pengumpulan tugas diterima.` },
    { icon: "board", tone: "stat-purple", label: "Proyek", value: `${data.pendingReviews}/${data.projects}`, hint: "Proyek menunggu review dibanding seluruh proyek." },
  ];
  const rates = [
    { label: "Rata-rata nilai tugas", value: score(data.averageScore) },
    { label: "Rata-rata skor kuis & ujian", value: percent(data.averageAttemptScore) },
    { label: "Kuis & ujian selesai", value: String(data.attempts) },
    { label: "Aktivitas aktif", value: String(data.activities) },
    { label: "XP diberikan", value: String(data.xpAwarded) },
  ];
  return <>
    <div className="summary-grid">{stats.map(stat => <Card className="stat-card" key={stat.label}>
      <span className={`stat-icon ${stat.tone}`} aria-hidden="true"><Icon name={stat.icon} size={20} /></span>
      <div><span className="summary-label">{stat.label}</span><strong className="summary-value">{stat.value}</strong><p>{stat.hint}</p></div>
    </Card>)}</div>
    <Card><div className="card-heading"><h2>Angka operasional</h2></div>
      <p className="card-hint">Dihitung dari data pembelajaran, penilaian, kehadiran, dan proyek dalam cakupan filter.</p>
      <ul className="report-metrics">{rates.map(rate => <li key={rate.label}><span className="summary-label">{rate.label}</span><strong>{rate.value}</strong></li>)}</ul>
    </Card>
  </>;
}

// Keyed by report kind at the call site: the table keeps one component instance per kind,
// so rows fetched for the previous report are never rendered with this report's columns.
function ReportTable<T>({ kind, title, params, headers, row, keyOf, empty, onExpired, search, offset, setOffset }: {
  kind: ReportKind; title: string; params: URLSearchParams; headers: string[]; row: (item: T) => ReactNode;
  keyOf: (item: T) => string; empty: string; onExpired: () => void; search: (q: string) => void; offset: number; setOffset: (value: number) => void;
}) {
  const { data, error, retry } = useData<Page<T>>(`/api/reports/${kind}?${params}`, onExpired);
  return <Card>
    <div className="card-heading"><h2>{title}</h2><div className="card-tools"><Search change={search} /><ExportLink kind={kind} params={params} /></div></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="chart" title="Belum ada data" description={empty} />
      : <><div className="table-scroll"><table className="data-table">
        <thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
        <tbody>{data.items.map(item => <tr key={keyOf(item)}>{row(item)}</tr>)}</tbody>
      </table></div>
      <Pager offset={offset} next={data.nextOffset} change={setOffset} /></>}
  </Card>;
}

function AuditFilters({ options, filters, change }: { options: ReportFilterOptions; filters: { event: string; from: string; to: string }; change: (value: { event: string; from: string; to: string }) => void }) {
  return <div className="filter-bar report-filters">
    <label className="report-filter"><span>Peristiwa</span>
      <select className="input filter-select" value={filters.event} onChange={event => change({ ...filters, event: event.target.value })}>
        <option value="">Semua</option>
        {options.events.map(event => <option key={event} value={event}>{event}</option>)}
      </select></label>
    <label className="report-filter"><span>Dari tanggal</span>
      <input className="input filter-select" type="date" value={filters.from} max={filters.to || undefined} onChange={event => change({ ...filters, from: event.target.value })} /></label>
    <label className="report-filter"><span>Sampai tanggal</span>
      <input className="input filter-select" type="date" value={filters.to} min={filters.from || undefined} onChange={event => change({ ...filters, to: event.target.value })} /></label>
    <Button className="button-secondary button-small" onClick={() => change({ event: "", from: "", to: "" })}>Atur ulang</Button>
  </div>;
}

export function Reports({ actor, timezone, onExpired }: { actor: Actor; timezone: string; onExpired: () => void }) {
  const [scope, setScope] = useState<ReportScope>(emptyScope);
  const [audit, setAudit] = useState({ event: "", from: "", to: "" });
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState("overview");
  const { data: options, error, retry } = useData<ReportFilterOptions>("/api/reports/filters", onExpired);
  if (!actor.permissions.includes("reports.view")) return <ErrorState message="Anda tidak memiliki akses ke halaman ini." />;
  const tabs = [
    { id: "overview", label: "Ringkasan" },
    { id: "courses", label: "Course" },
    { id: "attendance", label: "Kehadiran" },
    { id: "progress", label: "Kemajuan belajar" },
    ...(options?.canViewAudit ? [{ id: "audit", label: "Audit log" }] : []),
  ];
  const reset = (next: () => void) => { next(); setOffset(0); };
  const listParams = (extra: Record<string, string> = {}) => query(scope, { ...extra, q, offset: String(offset) });
  const table = (kind: ReportKind) => kind === "courses"
    ? <ReportTable<CourseReportRow> key="courses" kind="courses" title="Ringkasan course" params={listParams()} onExpired={onExpired} offset={offset} setOffset={setOffset}
        search={value => reset(() => setQ(value))} keyOf={row => row.courseId} empty="Course dalam cakupan Anda akan tampil di sini."
        headers={["Course", "Kelas", "Semester", "Santri", "Pelajaran", "Aktivitas", "Sesi", "Kehadiran", "Belum dinilai", "Rata-rata nilai"]}
        row={row => <>
          <td><strong className="table-link">{row.courseName}</strong><span className="table-sub">{row.subjectName} · {row.published ? "Terbit" : "Draft"}</span></td>
          <td>{row.className}</td><td>{row.termName}</td><td>{row.students}</td><td>{row.lessons}</td><td>{row.activities}</td>
          <td>{row.sessions}</td><td>{percent(row.attendanceRate)}</td><td>{row.pendingGrading}</td><td>{score(row.averageScore)}</td>
        </>} />
    : kind === "attendance"
    ? <ReportTable<AttendanceSummaryRow> key="attendance" kind="attendance" title="Rekap kehadiran" params={listParams()} onExpired={onExpired} offset={offset} setOffset={setOffset}
        search={value => reset(() => setQ(value))} keyOf={row => row.studentId} empty="Rekap muncul setelah sesi kelas dibuat dan kehadiran dicatat."
        headers={["Santri", "Kelas", "Sesi", "Belum tercatat", attendanceLabels.present, attendanceLabels.late, attendanceLabels.excused, attendanceLabels.sick, attendanceLabels.absent, "Kehadiran"]}
        row={row => <>
          <td><strong className="table-link">{row.studentName}</strong><span className="table-sub">{row.identifier ?? "Tanpa NIS"} · {row.courses} course</span></td>
          <td>{row.className}</td><td>{row.total}</td><td>{row.unrecorded}</td><td>{row.present}</td><td>{row.late}</td>
          <td>{row.excused}</td><td>{row.sick}</td><td>{row.absent}</td><td>{percent(row.rate)}</td>
        </>} />
    : kind === "progress"
    ? <ReportTable<ProgressReportRow> key="progress" kind="progress" title="Kemajuan belajar" params={listParams()} onExpired={onExpired} offset={offset} setOffset={setOffset}
        search={value => reset(() => setQ(value))} keyOf={row => `${row.studentId}-${row.className}`} empty="Kemajuan muncul setelah course terbit dan santri mulai belajar."
        headers={["Santri", "Kelas", "Pelajaran", "Tugas", "Dinilai", "Rata-rata nilai", "Kuis & ujian", "Rata-rata skor", "XP"]}
        row={row => <>
          <td><strong className="table-link">{row.studentName}</strong><span className="table-sub">{row.identifier ?? "Tanpa NIS"} · {row.courses} course</span></td>
          <td>{row.className}</td>
          <td>{row.completed}/{row.lessons} · {percent(row.lessonRate)}</td>
          <td>{row.submitted}/{row.activities}</td><td>{row.graded}</td><td>{score(row.averageScore)}</td>
          <td>{row.attempts}</td><td>{percent(row.averageAttemptScore)}</td><td>{row.xp}</td>
        </>} />
    : <ReportTable<AuditReportRow> key="audit" kind="audit" title="Audit log" params={listParams({ event: audit.event, from: audit.from, to: audit.to })} onExpired={onExpired} offset={offset} setOffset={setOffset}
        search={value => reset(() => setQ(value))} keyOf={row => row.id} empty="Peristiwa audit akan tampil setelah ada aktivitas dalam rentang ini."
        headers={["Waktu", "Peristiwa", "Aktor", "Sumber", "ID permintaan"]}
        row={row => <>
          <td>{formatDateTime(row.createdAt, timezone)}</td>
          <td><strong className="table-link">{row.event}</strong></td>
          <td>{row.actor ?? "Sistem"}</td>
          <td>{row.resourceType ?? "—"}{row.resourceId && <span className="table-sub">{row.resourceId}</span>}</td>
          <td>{row.requestId ?? "—"}</td>
        </>} />;
  return <>
    <PageHeader title="Laporan" description="Ringkasan operasional, rekap kehadiran, kemajuan belajar, dan audit lintas course." />
    <nav className="tabs" aria-label="Bagian laporan">{tabs.map(item =>
      <button key={item.id} type="button" className={item.id === tab ? "tab-active" : ""} aria-current={item.id === tab ? "page" : undefined}
        onClick={() => reset(() => setTab(item.id))}>{item.label}</button>)}</nav>
    {error ? <ErrorState message={error} retry={retry} /> : !options ? <LoadingState /> : <>
      {tab === "audit"
        ? <Card className="report-filter-card"><AuditFilters options={options} filters={audit} change={value => reset(() => setAudit(value))} /></Card>
        : <Card className="report-filter-card"><ScopeFilters options={options} scope={scope} change={value => reset(() => setScope(value))} /></Card>}
      {tab === "overview" ? <Overview scope={scope} onExpired={onExpired} /> : table(tab as ReportKind)}
    </>}
  </>;
}
