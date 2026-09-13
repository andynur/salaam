import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgendaSession, AttendanceAgenda, AttendanceDocumentation, AttendanceReport, AttendanceRow, AttendanceStatus, Meeting, MeetingDetail, RosterOption, SessionEvent, SessionStatus } from "../../shared/attendance";
import { attendanceLabels, sessionLabels } from "../../shared/attendance";
import type { LearningCourse, Page } from "../../shared/learning";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, PersonName, gradeOf } from "../components/ui";
import { CourseCatalog } from "../components/courses";
import { Icon, type IconName } from "../components/icons";
import { deviceTimezone, errorMessage, Field, formatDateTime, fromLocalInput, MutationForm, Pager, Search, useData } from "../components/learning";
import { CheckinManager, CheckinStudent } from "../components/checkin";
const root = "/api/attendance/courses";
const sessionEventLabels: Record<string, string> = { open: "Sesi dibuka", close: "Sesi ditutup", reopen: "Sesi dibuka untuk koreksi", cancel: "Sesi dibatalkan", note: "Catatan diperbarui" };
const sessionEventIcons: Record<string, IconName> = { open: "success", close: "lock", reopen: "refresh", cancel: "close", note: "pen" };
const href = (courseId: string, sessionId?: string) => `/attendance/courses/${courseId}${sessionId ? `/sessions/${sessionId}` : ""}`;
// Each attendance status and session state keeps one colour across tiles, pills, and bars.
const statusTones: Record<AttendanceStatus, string> = { present: "success", late: "gold", excused: "blue", sick: "discovery", absent: "danger" };
const statusShort: Record<AttendanceStatus, string> = { present: "H", late: "T", excused: "I", sick: "S", absent: "A" };
const sessionTones: Record<SessionStatus, string> = { scheduled: "blue", open: "success", closed: "neutral", cancelled: "danger" };
const statuses = Object.keys(attendanceLabels) as AttendanceStatus[];
const percent = (value: number, total: number) => total ? Math.round(value / total * 100) : 0;
const datePart = (value: string, timezone: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: timezone, ...options }).format(new Date(value));
const timeRange = (session: Meeting, timezone: string) => `${datePart(session.startsAt, timezone, { hour: "2-digit", minute: "2-digit" })}–${datePart(session.endsAt, timezone, { hour: "2-digit", minute: "2-digit" })}`;
function dayDistance(value: string, timezone: string) {
  const day = (date: Date) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date));
  return Math.round((day(new Date(value)) - day(new Date())) / 86400000);
}
function relativeDay(value: string, timezone: string) {
  const days = dayDistance(value, timezone);
  return days === 0 ? "Hari ini" : days === 1 ? "Besok" : days === -1 ? "Kemarin" : days > 1 ? `${days} hari lagi` : `${-days} hari lalu`;
}
function SessionPill({ status }: { status: SessionStatus }) {
  return <span className={`session-pill tone-${sessionTones[status]}`}><span className="session-dot" aria-hidden="true" />{sessionLabels[status]}</span>;
}
function StatusPill({ status }: { status: AttendanceStatus | null }) {
  return <span className={`session-pill tone-${status ? statusTones[status] : "neutral"}`}>{status ? attendanceLabels[status] : "Belum dicatat"}</span>;
}
function DateBlock({ value, timezone }: { value: string; timezone: string }) {
  return <span className={`date-block ${dayDistance(value, timezone) === 0 ? "is-today" : ""}`} aria-hidden="true"><small>{datePart(value, timezone, { weekday: "short" })}</small><strong>{datePart(value, timezone, { day: "numeric" })}</strong><small>{datePart(value, timezone, { month: "short" })}</small></span>;
}
// A stacked bar of status counts; the numbers stay in the table or tiles beside it.
function StatusBar({ counts, total, label }: { counts: Record<AttendanceStatus, number>; total: number; label: string }) {
  return <span className="status-bar" role="img" aria-label={`${label}: ${statuses.map(key => `${attendanceLabels[key]} ${counts[key]}`).join(", ")}`}>{statuses.map(key => counts[key] ? <span key={key} className={`tone-fill-${statusTones[key]}`} style={{ width: `${counts[key] / Math.max(total, 1) * 100}%` }} title={`${attendanceLabels[key]}: ${counts[key]}`} /> : null)}</span>;
}
function StatusLegend() {
  return <div className="status-legend" aria-hidden="true">{statuses.map(key => <span key={key}><span className={`legend-dot tone-fill-${statusTones[key]}`} />{attendanceLabels[key]}</span>)}</div>;
}
function openRow(event: React.MouseEvent<HTMLTableRowElement>, target: string) {
  if ((event.target as HTMLElement).closest("a, button, input, select")) return;
  location.assign(target);
}
export function Attendance({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const match = /^\/attendance\/courses\/([^/]+)(?:\/sessions\/([^/]+))?$/.exec(location.pathname);
  return match ? match[2] ? <SessionView courseId={match[1]!} sessionId={match[2]} timezone={timezone} onExpired={onExpired} /> : <CourseSessions courseId={match[1]!} timezone={timezone} onExpired={onExpired} /> : <AttendanceCourses timezone={timezone} onExpired={onExpired} />;
}
const clock = (value: string, timezone: string) => datePart(value, timezone, { hour: "2-digit", minute: "2-digit" });
function duration(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes < 60 ? `${minutes} menit` : `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`;
}
// Loads the agenda, then refreshes it every minute and whenever the tab becomes visible again,
// keeping the loaded list on screen. `skew` aligns relative times with the database clock.
function useAgenda(onExpired: () => void) {
  const [data, setData] = useState<AttendanceAgenda | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [skew, setSkew] = useState(0);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try { const result = await api<AttendanceAgenda>("/api/attendance/agenda"); if (current === sequence.current) { setData(result); setError(""); const server = Date.parse(result.now); setSkew(Number.isNaN(server) ? 0 : server - Date.now()); } }
    catch (cause) { if (current !== sequence.current) return; if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [onExpired]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { sequence.current++; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  return { data, error, loading, skew, load };
}
function useNow(skew: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  return now + skew;
}
// Task-first landing: today's sessions with the one action each role needs, then the catalog.
function AttendanceCourses({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const agenda = useAgenda(onExpired);
  const next = useMemo(() => new Map((agenda.data?.courses ?? []).map(item => [item.courseId, item])), [agenda.data]);
  return <div className="lesson-workspace"><PageHeader title="Kehadiran" description="Sesi kelas hari ini dan riwayat kehadiran per course." />
    <AgendaCard agenda={agenda} timezone={timezone} />
    <CourseCatalog endpoint="/api/learning/courses" href={course => href(course.id)} openLabel={() => "Lihat semua sesi"} emptyIcon="attendance" emptyDescription="Course akan tampil setelah Anda terdaftar pada course." onExpired={onExpired}
      badge={course => { if (!agenda.data) return null; const item = next.get(course.id); return !item ? <span className="badge badge-draft">Belum ada jadwal</span> : item.status === "open" ? <SessionPill status="open" /> : <span className="session-pill tone-blue">{relativeDay(item.startsAt, timezone)}, {clock(item.startsAt, timezone)}</span>; }} />
  </div>;
}
function AgendaCard({ agenda, timezone }: { agenda: ReturnType<typeof useAgenda>; timezone: string }) {
  const { data, error, loading, skew, load } = agenda;
  const now = useNow(skew);
  const upcoming = data && !data.sessions.length ? [...data.courses].filter(item => item.status === "scheduled").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] : undefined;
  const live = data?.sessions.filter(session => session.status === "open").length ?? 0;
  return <Card className="agenda-card"><div className="card-heading"><div><h2>Agenda hari ini</h2><p className="card-heading-hint">{datePart(new Date(now).toISOString(), timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{data ? ` · ${data.sessions.length} sesi${live ? `, ${live} berlangsung` : ""}` : ""}</p></div>
    <Button className="button-secondary button-small" disabled={loading} onClick={() => void load()}><Icon name="refresh" size={15} />{loading ? "Memuat…" : "Muat ulang"}</Button></div>
    {error && data && <div className="roster-error" role="alert"><Icon name="error" size={16} />Agenda belum diperbarui: {error}</div>}
    {!data ? error ? <ErrorState message={error} retry={() => void load()} /> : <LoadingState />
      : !data.sessions.length ? <EmptyState icon="calendar" title="Tidak ada sesi hari ini" description={upcoming ? `Sesi berikutnya: ${upcoming.courseName} · ${upcoming.title}, ${relativeDay(upcoming.startsAt, timezone).toLowerCase()} pukul ${clock(upcoming.startsAt, timezone)}.` : "Pilih course di bawah untuk melihat atau membuat sesi."} action={upcoming ? <a className="button button-secondary button-small" href={href(upcoming.courseId, upcoming.sessionId)}>Lihat sesi berikutnya</a> : undefined} />
      : <><ol className="agenda-list">{data.sessions.map(session => <AgendaItem key={session.id} session={session} now={now} timezone={timezone} />)}</ol>
        {data.hasMore && <p className="card-hint table-note">Menampilkan 50 sesi pertama. Buka course untuk sesi lainnya.</p>}</>}
  </Card>;
}
function AgendaItem({ session, now, timezone }: { session: AgendaSession; now: number; timezone: string }) {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  const live = session.status === "open";
  const late = session.status === "scheduled" && now >= start;
  const overtime = live && now > end;
  const otherDay = dayDistance(session.startsAt, timezone) !== 0;
  const timing = session.status === "cancelled" ? "Sesi dibatalkan" : session.status === "closed" ? "Sesi selesai"
    : live ? overtime ? session.canManage ? "Melewati jam selesai, tutup setelah pencatatan lengkap" : "Melewati jam selesai" : `Berakhir ${duration(end - now)} lagi`
    : late ? session.canManage ? "Waktu mulai lewat, sesi belum dibuka" : "Menunggu guru membuka sesi" : `Mulai ${duration(start - now)} lagi`;
  const action = session.canManage
    ? live ? { label: "Catat kehadiran", tab: "", icon: "attendance" as IconName, primary: true }
      : session.status === "scheduled" ? { label: "Buka sesi", tab: "manage", icon: "lock" as IconName, primary: late || start - now <= 30 * 60000 }
      : { label: session.status === "closed" ? "Lihat rekap" : "Lihat sesi", tab: "", icon: null, primary: false }
    : session.canAssist && live ? { label: "Catat kehadiran", tab: "", icon: "attendance" as IconName, primary: true }
    : live && session.checkinOpen && !session.myStatus ? { label: "Absen QR", tab: "checkin", icon: "qr" as IconName, primary: true }
      : { label: "Lihat sesi", tab: "", icon: null, primary: false };
  const target = href(session.courseId, session.id);
  return <li className={`agenda-item ${live ? "is-live" : ""} ${session.status === "closed" ? "is-done" : ""} ${session.status === "cancelled" ? "is-cancelled" : ""}`}>
    <span className="agenda-time"><strong>{clock(session.startsAt, timezone)}</strong><small>s.d. {clock(session.endsAt, timezone)}</small>{otherDay && <small className="agenda-day tone-text-gold">{relativeDay(session.startsAt, timezone)}</small>}</span>
    <div className="agenda-body">
      <span className="agenda-course"><span className={`grade-chip grade-chip-${gradeOf(session.className).toLowerCase()}`}>{session.className}</span>{session.courseName}</span>
      <a className="agenda-title" href={target}>{session.title}</a>
      <span className="agenda-meta"><SessionPill status={session.status} /><span className={late || overtime ? "tone-text-gold" : ""}>{timing}</span></span>
      {(session.canManage || session.canAssist) && session.total !== null && session.recorded !== null && (live || session.status === "closed") && <span className="agenda-progress"><span className="rate-meter" role="progressbar" aria-label={`Pencatatan ${session.title}`} aria-valuemin={0} aria-valuemax={session.total} aria-valuenow={session.recorded}><span className={`tone-fill-${session.recorded === session.total ? "success" : "blue"}`} style={{ width: `${percent(session.recorded, session.total)}%` }} /></span>{session.recorded}/{session.total} dicatat</span>}
      {!session.canManage && !session.canAssist && (live || session.status === "closed") && <span className="agenda-meta">Status Anda: <StatusPill status={session.myStatus} /></span>}
    </div>
    <a className={`button button-small agenda-action ${action.primary ? "" : "button-secondary"}`} href={action.tab ? `${target}?tab=${action.tab}` : target}>{action.icon && <Icon name={action.icon} size={15} />}{action.label}</a>
  </li>;
}
function CourseSessions({ courseId, timezone, onExpired }: { courseId: string; timezone: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("sessions");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const { data, error, retry } = useData<Page<Meeting> & { course: LearningCourse }>(`${root}/${courseId}/sessions?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired, revision);
  const items = data?.items ?? [];
  const rows = status === "all" ? items : items.filter(session => session.status === status);
  const live = items.find(session => session.status === "open");
  const upcoming = items.filter(session => session.status === "scheduled" && Date.parse(session.endsAt) > Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const spotlight = live ?? upcoming;
  const tabButton = (key: string, label: string, icon: IconName) => <button className={tab === key ? "tab-active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}><Icon name={icon} size={15} />{label}</button>;
  return <div className="lesson-workspace"><PageHeader breadcrumbs={[{ label: "Kehadiran", href: "/attendance" }]} title={data?.course.name ?? "Sesi kelas"} description={data ? `${data.course.className} · ${data.course.term} · Kehadiran selalu dicatat pada sesi pertemuan.` : "Kehadiran selalu dicatat pada sesi pertemuan."} actions={data?.course.canManage && tab === "sessions" ? <><Button aria-expanded={creating && !recurring} aria-controls="create-session" onClick={() => { setCreating(!creating || recurring); setRecurring(false); setRequestKey(crypto.randomUUID()); }}><Icon name="plus" size={16} />Buat sesi</Button><Button className="button-secondary" aria-pressed={recurring} onClick={() => { setRecurring(!recurring); setCreating(!recurring); setRequestKey(crypto.randomUUID()); }}><Icon name="history" size={16} />Sesi berulang</Button></> : undefined} />
    <nav className="tabs icon-tabs" aria-label="Halaman course kehadiran">{tabButton("sessions", "Sesi", "calendar")}{tabButton("report", "Laporan kehadiran", "chart")}</nav>
    {tab === "report" ? <Report courseId={courseId} classroom={data?.course.className} onExpired={onExpired} /> : <>
      {creating && <Card className="lesson-card"><div id="create-session"><h2>{recurring ? "Sesi berulang" : "Sesi baru"}</h2><MutationForm path={`${root}/${courseId}/sessions${recurring ? "/series" : ""}`} label={recurring ? "Buat sesi berulang" : "Simpan sesi"} onExpired={onExpired} saved={() => { setCreating(false); setRecurring(false); setRevision(v => v + 1); }} body={form => recurring ? ({ title: form.get("title"), startsAt: fromLocalInput(form.get("startsAt")), endsAt: fromLocalInput(form.get("endsAt")), note: form.get("note"), intervalDays: Number(form.get("intervalDays")), occurrenceCount: Number(form.get("occurrenceCount")), qrRotateSeconds: Number(form.get("qrRotateSeconds")), qrLateAfterMinutes: form.get("qrLateAfterMinutes") ? Number(form.get("qrLateAfterMinutes")) : null, requestKey }) : ({ title: form.get("title"), startsAt: fromLocalInput(form.get("startsAt")), endsAt: fromLocalInput(form.get("endsAt")), note: form.get("note"), requestKey })}>
        <Field label="Judul sesi" name="title" /><Field label={`Mulai (${deviceTimezone()})`} name="startsAt" type="datetime-local" /><Field label={`Selesai (${deviceTimezone()})`} name="endsAt" type="datetime-local" /><Field label="Catatan privat guru" name="note" area required={false} max={2000} />
        {recurring && <><Field label="Interval (hari)" name="intervalDays" type="number" min={1} max={365} value="7" /><Field label="Jumlah sesi (maksimal 52)" name="occurrenceCount" type="number" min={1} max={52} value="8" /><Field label="Rotasi kode QR (detik)" name="qrRotateSeconds" type="number" min={15} max={300} value="30" /><Field label="Terlambat setelah mulai (menit, opsional)" name="qrLateAfterMinutes" type="number" min={0} max={1440} required={false} /></>}
      </MutationForm><p className="card-hint">Daftar santri aktif disimpan sebagai snapshot pada setiap sesi. Sesi berulang dibatasi 52 occurrence dan saat dibuka akan memakai konfigurasi QR seri.</p></div></Card>}
      {spotlight && !offset && !q && <a className={`session-spotlight ${live ? "is-live" : ""}`} href={href(courseId, spotlight.id)}>
        <DateBlock value={spotlight.startsAt} timezone={timezone} />
        <span className="session-spotlight-body"><span className="session-spotlight-label">{live ? <><span className="live-dot" aria-hidden="true" />Sesi sedang berlangsung</> : `Sesi berikutnya · ${relativeDay(spotlight.startsAt, timezone)}`}</span><strong>{spotlight.title}</strong><span className="session-spotlight-meta">{formatDateTime(spotlight.startsAt, timezone)} – {datePart(spotlight.endsAt, timezone, { hour: "2-digit", minute: "2-digit" })}</span></span>
        <span className="session-spotlight-action">{live ? "Catat kehadiran" : "Lihat sesi"}<Icon name="arrowRight" size={16} /></span>
      </a>}
      <Card><div className="card-heading"><h2>Daftar sesi</h2><Search change={value => { setQ(value); setOffset(0); setStatus("all"); }} /></div>
        {data && items.length > 0 && <div className="filter-bar segmented-bar"><div className="segmented" role="group" aria-label="Filter status sesi di halaman ini">{(["all", "open", "scheduled", "closed", "cancelled"] as const).map(value => { const count = value === "all" ? items.length : items.filter(session => session.status === value).length; return (value === "all" || count > 0) && <button type="button" key={value} className={`segmented-option ${status === value ? "is-active" : ""}`} aria-pressed={status === value} onClick={() => setStatus(value)}>{value !== "all" && <span className={`legend-dot tone-fill-${sessionTones[value]}`} aria-hidden="true" />}{value === "all" ? "Semua" : sessionLabels[value]}<span className="segmented-count">{count}</span></button>; })}</div></div>}
        {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !items.length ? <EmptyState icon="calendar" title={q ? "Tidak ada sesi yang cocok" : "Belum ada sesi"} description={q ? "Coba kata kunci lain." : data.course.canManage ? "Buat sesi pertama untuk mulai mencatat kehadiran." : "Sesi pertemuan akan tampil di sini."} /> : !rows.length ? <EmptyState icon="calendar" title="Tidak ada sesi dengan status ini" description="Pilih status lain di atas." /> : <><div className="table-scroll"><table className="data-table session-table"><thead><tr><th>Pertemuan</th><th>Status</th><th><span className="visually-hidden">Aksi</span></th></tr></thead><tbody>{rows.map(s => <tr key={s.id} className={`is-clickable ${s.status === "open" ? "is-live" : ""}`} onClick={event => openRow(event, href(courseId, s.id))}>
          <td><span className="session-cell"><DateBlock value={s.startsAt} timezone={timezone} /><span className="session-cell-text"><a className="table-link" href={href(courseId, s.id)}><strong>{s.title}</strong></a><span className="table-sub">{timeRange(s, timezone)} · {relativeDay(s.startsAt, timezone)}{s.occurrenceIndex ? ` · Seri ke-${s.occurrenceIndex}` : ""}</span></span></span></td>
          <td className="session-status-cell"><SessionPill status={s.status} /></td>
          <td className="table-action"><a className="row-open" href={href(courseId, s.id)} aria-label={`Buka ${s.title}`}>Buka<Icon name="chevronRight" size={16} /></a></td>
        </tr>)}</tbody></table></div>{status !== "all" && <p className="card-hint table-note">Filter status berlaku untuk halaman ini.</p>}<Pager offset={offset} next={data.nextOffset} change={value => { setOffset(value); setStatus("all"); }} /></>}
      </Card></>}
  </div>;
}
function rateTone(rate: number | null) { return rate === null ? "neutral" : rate >= 90 ? "success" : rate >= 75 ? "gold" : "danger"; }
function Report({ courseId, classroom, onExpired }: { courseId: string; classroom?: string | undefined; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const { data, error, retry } = useData<Page<AttendanceReport>>(`${root}/${courseId}/report?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  const rows = useMemo(() => {
    const items = [...(data?.items ?? [])];
    if (sort === "name") return items;
    const rate = (row: AttendanceReport) => row.rate ?? (sort === "low" ? 101 : -1);
    return items.sort((a, b) => sort === "low" ? rate(a) - rate(b) : rate(b) - rate(a));
  }, [data, sort]);
  const rated = (data?.items ?? []).filter(row => row.rate !== null);
  const average = rated.length ? Math.round(rated.reduce((sum, row) => sum + row.rate!, 0) / rated.length) : null;
  const atRisk = rated.filter(row => row.rate! < 75).length;
  return <>
    {data && data.items.length > 0 && <div className="summary-grid report-glance">
      <Card className="stat-card"><span className={`stat-icon tone-soft-${rateTone(average)}`} aria-hidden="true"><Icon name="chart" size={20} /></span><div><span className="summary-label">Rata-rata kehadiran</span><strong className="summary-value">{average === null ? "—" : `${average}%`}</strong><p>Santri di halaman ini.</p></div></Card>
      <Card className="stat-card"><span className="stat-icon tone-soft-danger" aria-hidden="true"><Icon name="error" size={20} /></span><div><span className="summary-label">Di bawah 75%</span><strong className="summary-value">{atRisk}</strong><p>Perlu perhatian wali kelas.</p></div></Card>
      <Card className="stat-card"><span className="stat-icon stat-blue" aria-hidden="true"><Icon name="lock" size={20} /></span><div><span className="summary-label">Sesi ditutup</span><strong className="summary-value">{Math.max(0, ...data.items.map(row => row.closed))}</strong><p>Dasar perhitungan persentase.</p></div></Card>
    </div>}
    <Card><div className="card-heading"><h2>Laporan kehadiran</h2><div className="card-tools"><Search change={value => { setQ(value); setOffset(0); }} /><label><span className="visually-hidden">Urutkan laporan</span><select className="input filter-select" value={sort} onChange={event => setSort(event.target.value)}><option value="name">Nama A–Z</option><option value="low">Kehadiran terendah</option><option value="high">Kehadiran tertinggi</option></select></label></div></div><p className="card-hint report-hint">Persentase: hadir + terlambat dibagi sesi yang sudah ditutup. Sesi dibatalkan tidak dihitung. Jumlah status mencakup semua sesi lainnya.</p>
      {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState icon="chart" title={q ? "Tidak ada santri yang cocok" : "Belum ada laporan"} description={q ? "Coba kata kunci lain." : "Laporan tersedia setelah roster sesi dibuat."} /> : <><div className="filter-bar"><StatusLegend /></div><div className="table-scroll"><table className="data-table attendance-report-table"><thead><tr><th>Santri</th><th>Sebaran status</th>{statuses.map(key => <th key={key} className="count-col" title={attendanceLabels[key]}>{attendanceLabels[key]}</th>)}<th className="count-col">Belum dicatat</th><th>Kehadiran</th></tr></thead><tbody>{rows.map(r => { const tone = rateTone(r.rate); return <tr key={r.studentId}><td><PersonName name={r.studentName} classroom={classroom} sub={`${r.closed} sesi ditutup`} /></td><td><StatusBar counts={r} total={statuses.reduce((sum, key) => sum + r[key], 0) + r.unrecorded} label={`Sebaran ${r.studentName}`} /></td>{statuses.map(key => <td key={key} className={`count-col ${r[key] ? `tone-text-${statusTones[key]}` : "is-zero"}`}>{r[key]}</td>)}<td className={`count-col ${r.unrecorded ? "" : "is-zero"}`}>{r.unrecorded}</td><td><span className="rate-cell"><strong className={`tone-text-${tone}`}>{r.rate === null ? "—" : `${r.rate}%`}</strong><span className="rate-meter" role="progressbar" aria-label={`Kehadiran ${r.studentName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.rate ?? 0}><span className={`tone-fill-${tone}`} style={{ width: `${r.rate ?? 0}%` }} /></span></span></td></tr>; })}</tbody></table></div><Pager offset={offset} next={data.nextOffset} change={setOffset} /></>}
    </Card>
  </>;
}
function SessionView({ courseId, sessionId, timezone, onExpired }: { courseId: string; sessionId: string; timezone: string; onExpired: () => void }) {
  const [data, setData] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [connected, setConnected] = useState(false);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  // `?tab=` deep-links from the agenda (QR check-in, session management) and survives reloads.
  const [requestedTab, setDetailTab] = useState(() => { const tab = new URLSearchParams(location.search).get("tab"); return tab && ["checkin", "manage", "history"].includes(tab) ? tab : "attendance"; });
  const detailTab = data && !data.course.canManage && ["manage", "history"].includes(requestedTab) ? "attendance" : requestedTab;
  useEffect(() => { window.history.replaceState(window.history.state, "", requestedTab === "attendance" ? location.pathname : `${location.pathname}?tab=${requestedTab}`); }, [requestedTab]);
  const [noteDraft, setNoteDraft] = useState<{ note: string; version: number } | null>(null);
  const [filter, setFilter] = useState<AttendanceStatus | "unrecorded" | "all">("all");
  const [marking, setMarking] = useState("");
  const [markError, setMarkError] = useState("");
  const markingRef = useRef(false);
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing) editor.current?.querySelector("select")?.focus(); }, [editing]);
  const sequence = useRef(0);
  const path = `${root}/${courseId}/sessions/${sessionId}`;
  const [historyOffset, setHistoryOffset] = useState(0);
  const history = useData<Page<SessionEvent>>(`${path}/history?${new URLSearchParams({ offset: String(historyOffset) })}`, onExpired, data?.session.version);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try { const result = await api<MeetingDetail>(`${path}?${new URLSearchParams({ q, offset: String(offset) })}`); if (current === sequence.current) { setData(result); setError(""); } }
    catch (cause) { if (current !== sequence.current) return; if (cause instanceof ApiError && cause.status === 401) onExpired(); else { if (cause instanceof ApiError && [403, 404].includes(cause.status)) { setData(null); setEditing(null); setNoteDraft(null); } setError(cause instanceof Error ? cause.message : "Sesi tidak dapat dimuat."); } }
  }, [path, q, offset, onExpired]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket;
    let reconnect: ReturnType<typeof setTimeout>;
    function connect() {
      const url = new URL("/api/attendance/live", location.origin); url.protocol = location.protocol === "https:" ? "wss:" : "ws:"; url.search = new URLSearchParams({ courseId, sessionId }).toString();
      socket = new WebSocket(url);
      socket.onopen = () => { setConnected(true); void loadRef.current(); };
      socket.onmessage = () => { void loadRef.current(); };
      socket.onclose = () => { setConnected(false); if (!stopped) { void loadRef.current(); reconnect = setTimeout(connect, 5000); } };
    }
    connect();
    return () => { stopped = true; clearTimeout(reconnect); socket.close(); };
  }, [courseId, sessionId]);
  const finishEditing = () => { const studentId = editing?.studentId; setEditing(null); if (studentId) document.querySelector<HTMLButtonElement>(`button[data-student-id="${studentId}"]`)?.focus(); };
  const saved = () => { finishEditing(); void load(); };
  // One-click marking keeps the row's note and its current record as the predecessor, so a
  // concurrent change by another teacher still fails with 409 instead of being overwritten.
  const mark = async (row: AttendanceRow, status: AttendanceStatus) => {
    if (markingRef.current || row.status === status) return;
    markingRef.current = true; setMarking(row.studentId); setMarkError("");
    try { await api(`${path}/attendance/${row.studentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note: row.note ?? "", previousId: row.recordId }) }); await load(); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else { setMarkError(`${row.studentName}: ${errorMessage(cause)}`); void load(); } }
    finally { markingRef.current = false; setMarking(""); }
  };
  const detailTabButton = (key: string, label: string, icon: IconName) => <button className={detailTab === key ? "tab-active" : ""} aria-current={detailTab === key ? "page" : undefined} onClick={() => { setDetailTab(key); setEditing(null); }}><Icon name={icon} size={15} />{label}</button>;
  const counts = data?.counts;
  const recorded = counts ? counts.total - counts.unrecorded : 0;
  const roster = data ? filter === "all" ? data.roster.items : data.roster.items.filter(row => filter === "unrecorded" ? !row.status : row.status === filter) : [];
  const open = data?.session.status === "open";
  const canAttend = !!(data?.course.canManage || data?.course.canAssist);
  const pickFilter = (value: typeof filter) => setFilter(filter === value ? "all" : value);
  return <div className="lesson-workspace"><PageHeader breadcrumbs={[{ label: "Kehadiran", href: "/attendance" }, ...(data ? [{ label: data.course.name, href: href(courseId) }] : [])]} title={data?.session.title ?? "Sesi kelas"} description={data ? `${data.course.name} · ${formatDateTime(data.session.startsAt, timezone)} – ${formatDateTime(data.session.endsAt, timezone)}` : "Memuat sesi kelas"} actions={<div className="attendance-status-actions">{data && <SessionPill status={data.session.status} />}<span role="status" className={`live-status ${connected ? "is-connected" : ""}`}><span className="live-dot" aria-hidden="true" />{connected ? "Live aktif" : "Menghubungkan…"}</span><Button className="button-secondary button-small" onClick={() => void load()}><Icon name="refresh" size={15} />Muat ulang</Button></div>} />
    {error && <ErrorState message={error} retry={() => void load()} />}{!data || !counts ? !error && <LoadingState /> : <>
      <nav className="tabs icon-tabs" aria-label="Bagian sesi kehadiran">{detailTabButton("attendance", canAttend ? "Kehadiran" : "Kehadiran saya", "attendance")}{detailTabButton("checkin", "Absensi QR", "qr")}{data.course.canManage && detailTabButton("manage", "Kelola sesi", "edit")}{data.course.canManage && detailTabButton("history", "Riwayat", "history")}</nav>
      {detailTab === "attendance" && <>
        <Card className="attendance-overview-card"><div className="card-heading"><div><h2>Ringkasan kehadiran</h2><p className="card-heading-hint">{recorded} dari {counts.total} santri sudah dicatat</p></div><strong className="attendance-progress-value">{percent(recorded, counts.total)}%</strong></div>
          <div className="attendance-progress"><StatusBar counts={counts} total={counts.total} label="Sebaran kehadiran sesi" /></div>
          <div className="status-tiles" role="group" aria-label="Saring daftar santri menurut status">{statuses.map(key => <button type="button" key={key} className={`status-tile tone-${statusTones[key]} ${filter === key ? "is-active" : ""}`} aria-pressed={filter === key} onClick={() => pickFilter(key)}><span className="status-tile-label"><span className={`legend-dot tone-fill-${statusTones[key]}`} aria-hidden="true" />{attendanceLabels[key]}</span><strong>{counts[key]}</strong><small>{percent(counts[key], counts.total)}%</small></button>)}
            <button type="button" className={`status-tile tone-neutral ${filter === "unrecorded" ? "is-active" : ""}`} aria-pressed={filter === "unrecorded"} onClick={() => pickFilter("unrecorded")}><span className="status-tile-label"><span className="legend-dot tone-fill-neutral" aria-hidden="true" />Belum dicatat</span><strong>{counts.unrecorded}</strong><small>{percent(counts.unrecorded, counts.total)}%</small></button></div>
          {data.course.canManage && <p className="attendance-qr-line"><Icon name="qr" size={16} /><span><strong>{data.qrBreakdown.scanned}</strong> dipindai ({data.qrBreakdown.present} hadir, {data.qrBreakdown.late} terlambat) · <strong>{data.qrBreakdown.unscanned}</strong> belum dipindai</span></p>}
        </Card>
        {data.course.canManage && <RosterManager path={path} session={data.session} roster={data.roster.items} onExpired={onExpired} saved={() => void load()} />}
        {canAttend && <DocumentationCard path={path} items={data.documentations} timezone={timezone} onExpired={onExpired} saved={() => void load()} />}
        {editing && <div ref={editor}><Card className="lesson-card"><div className="card-heading"><h2>Catat kehadiran: {editing.studentName}</h2><Button className="button-secondary button-small" onClick={finishEditing}>Batal</Button></div><MutationForm key={`${editing.studentId}-${editing.recordId}`} path={`${path}/attendance/${editing.studentId}`} method="PATCH" label="Simpan kehadiran" onExpired={onExpired} saved={saved} disabled={!open} body={form => ({ status: form.get("status"), note: form.get("note"), previousId: editing.recordId })}>
          <label className="learning-field"><span>Status kehadiran</span><select className="input" name="status" defaultValue={editing.status ?? ""} required><option value="" disabled>Pilih status</option>{Object.entries(attendanceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><Field label="Catatan privat santri" name="note" value={editing.note ?? ""} area required={false} max={2000} />
        </MutationForm></Card></div>}
        <Card><div className="card-heading"><div><h2>{canAttend ? "Daftar santri" : "Kehadiran saya"}</h2>{canAttend && <p className="card-heading-hint">{open ? "Klik huruf status untuk mencatat: H hadir, T terlambat, I izin, S sakit, A alpa." : "Buka sesi untuk mencatat kehadiran."}</p>}</div><Search change={value => { setQ(value); setOffset(0); }} /></div>
          {filter !== "all" && <div className="filter-bar"><span className="card-heading-hint">Menampilkan {filter === "unrecorded" ? "belum dicatat" : attendanceLabels[filter].toLowerCase()} di halaman ini</span><Button className="button-secondary button-small" onClick={() => setFilter("all")}><Icon name="close" size={14} />Hapus filter</Button></div>}
          {markError && <div className="roster-error" role="alert"><Icon name="error" size={16} />{markError}</div>}
          {!data.roster.items.length ? <EmptyState icon="users" title="Tidak ada santri" description={q ? "Tidak ada roster yang sesuai pencarian." : "Roster sesi ini masih kosong."} /> : !roster.length ? <EmptyState icon="users" title="Tidak ada santri dengan status ini" description="Pilih status lain pada ringkasan." /> : <><div className="table-scroll"><table className="data-table roster-table"><thead><tr><th>Santri</th><th>Status</th><th>Dicatat</th>{canAttend && <><th>Tandai cepat</th><th>Catatan privat</th><th><span className="visually-hidden">Aksi</span></th></>}</tr></thead><tbody>{roster.map(r => <tr key={r.studentId} className={marking === r.studentId ? "is-pending" : ""}>
            <td><PersonName name={r.studentName} classroom={data.course.className} sub={r.identifier ? `NIS ${r.identifier}` : undefined} /></td>
            <td><span className="roster-status"><StatusPill status={r.status} />{r.checkinStatus && <span className="qr-mark" title={r.checkedInAt ? `Memindai QR ${formatDateTime(r.checkedInAt, timezone)}` : "Memindai QR"}><Icon name="qr" size={13} /><span className="visually-hidden">Memindai QR</span></span>}</span></td>
            <td className="roster-time">{r.recordedAt ? datePart(r.recordedAt, timezone, { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
            {canAttend && <><td><span className="quick-mark" role="group" aria-label={`Tandai cepat ${r.studentName}`}>{statuses.map(key => <button type="button" key={key} className={`quick-mark-option tone-${statusTones[key]} ${r.status === key ? "is-active" : ""}`} aria-pressed={r.status === key} aria-label={`${attendanceLabels[key]}: ${r.studentName}`} title={attendanceLabels[key]} disabled={!open || !!marking} onClick={() => void mark(r, key)}>{statusShort[key]}</button>)}</span></td>
              <td>{r.note || <span className="is-zero">—</span>}</td>
              <td className="table-action"><Button className="button-secondary button-small" disabled={!open} onClick={() => setEditing(r)} data-student-id={r.studentId} aria-label={`Catat ${r.studentName} dengan catatan`}><Icon name="pen" size={14} />Catatan</Button></td></>}
          </tr>)}</tbody></table></div><Pager offset={offset} next={data.roster.nextOffset} change={setOffset} /></>}
        </Card>
      </>}
      {detailTab === "checkin" && (data.course.canManage
        ? <CheckinManager path={path} session={data.session} checkin={data.checkin} timezone={timezone} onExpired={onExpired} saved={() => void load()} />
        : <CheckinStudent path={path} session={data.session} checkin={data.checkin} timezone={timezone} onExpired={onExpired} saved={() => void load()} />)}
      {detailTab === "manage" && data.course.canManage && <>
        <Card className="lesson-card"><div className="card-heading"><h2>Kelola sesi</h2><SessionPill status={data.session.status} /></div>
          <SessionStepper status={data.session.status} />
          <SessionActions session={data.session} path={path} onExpired={onExpired} saved={() => void load()} />
          {data.session.reason && <p className="card-hint">Alasan terakhir: {data.session.reason}</p>}
          <div className="session-note"><Icon name="pen" size={16} /><div><span className="summary-label">Catatan privat</span><p>{data.session.note || "Belum ada catatan"}</p></div><Button className="button-secondary button-small" disabled={data.session.status === "cancelled"} aria-expanded={!!noteDraft} aria-controls="session-note-editor" onClick={() => setNoteDraft(noteDraft ? null : { note: data.session.note ?? "", version: data.session.version })}>{noteDraft ? "Batal" : "Edit catatan"}</Button></div>
          {noteDraft && <div id="session-note-editor"><MutationForm key={noteDraft.version} path={path} method="PATCH" label="Simpan catatan" onExpired={onExpired} saved={() => { setNoteDraft(null); void load(); }} disabled={data.session.status === "cancelled"} body={form => ({ action: "note", version: noteDraft.version, note: form.get("note") })}><Field label="Catatan privat guru" name="note" value={noteDraft.note} area required={false} max={2000} /></MutationForm></div>}
        </Card>
        {open && <Card className="lesson-card"><div className="card-heading"><h2>Penandaan massal</h2><span className="badge badge-gold">{data.roster.items.filter(row => !row.recordId).length} belum dicatat</span></div>
        <MutationForm path={`${path}/bulk-attendance`} method="POST" label="Tandai santri belum dicatat" onExpired={onExpired} saved={() => void load()} disabled={!data.roster.items.some(row => !row.recordId)} body={() => ({ records: data.roster.items.filter(row => !row.recordId).map(row => ({ studentId: row.studentId, status: "present", note: "", previousId: null })) })}>
          <p className="card-hint">Menandai semua santri yang terlihat di halaman ini sebagai hadir. Gunakan pencarian dan pager untuk halaman lain.</p>
        </MutationForm>
        </Card>}
      </>}
      {detailTab === "history" && data.course.canManage && <Card className="lesson-card"><div className="card-heading"><h2>Riwayat sesi</h2></div>
        {history.error ? <ErrorState message={history.error} retry={history.retry} /> : !history.data ? <LoadingState /> : !history.data.items.length ? <EmptyState icon="history" title="Belum ada riwayat" description="Perubahan sesi akan tercatat di sini." /> : <><ol className="session-timeline">{history.data.items.map(event => <li key={event.id} className={`timeline-${event.action}`}><span className="timeline-icon" aria-hidden="true"><Icon name={sessionEventIcons[event.action] ?? "history"} size={15} /></span><div className="timeline-body"><strong>{sessionEventLabels[event.action] ?? event.action}</strong><span className="timeline-meta">{event.actorName} · <time dateTime={event.createdAt}>{formatDateTime(event.createdAt, timezone)}</time></span>{event.reason && <p>{event.reason}</p>}</div></li>)}</ol><Pager offset={historyOffset} next={history.data.nextOffset} change={setHistoryOffset} /></>}
      </Card>}
    </>}
  </div>;
}
function SessionStepper({ status }: { status: SessionStatus }) {
  const steps: [SessionStatus, string][] = [["scheduled", "Terjadwal"], ["open", "Berlangsung"], [status === "cancelled" ? "cancelled" : "closed", status === "cancelled" ? "Dibatalkan" : "Ditutup"]];
  const current = status === "scheduled" ? 0 : status === "open" ? 1 : 2;
  return <ol className="session-stepper" aria-label="Tahap sesi">{steps.map(([key, label], index) => <li key={key} className={`${index < current ? "is-done" : ""} ${index === current ? `is-current tone-${sessionTones[key]}` : ""}`} aria-current={index === current ? "step" : undefined}><span className="step-mark" aria-hidden="true">{index < current ? <Icon name="check" size={13} /> : index + 1}</span>{label}</li>)}</ol>;
}
function DocumentationCard({ path, items, timezone, onExpired, saved }: { path: string; items: AttendanceDocumentation[]; timezone: string; onExpired: () => void; saved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || pending) return;
    setPending(true); setError("");
    const form = new FormData(); form.set("file", file); form.set("caption", caption);
    try { await api(`${path}/documentation`, { method: "POST", body: form }); setFile(null); setCaption(""); event.currentTarget.reset(); saved(); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { setPending(false); }
  };
  return <Card className="attendance-documentation"><div className="card-heading"><div><h2>Dokumentasi sesi</h2><p className="card-heading-hint">Lampirkan minimal satu foto kegiatan pembelajaran.</p></div><span className="badge badge-gold">{items.length} foto</span></div>
    <form className="documentation-form" onSubmit={upload}><label className="learning-field"><span>Foto dokumentasi</span><input className="input" name="file" type="file" accept=".png,.jpg,.jpeg,.webp" required onChange={event => setFile(event.target.files?.[0] ?? null)} /><small>PNG, JPG, atau WebP, maksimal 10 MB.</small></label><label className="learning-field"><span>Keterangan <em>opsional</em></span><input className="input" name="caption" maxLength={500} value={caption} onChange={event => setCaption(event.target.value)} placeholder="Contoh: Praktik HTML kelas X-A" /></label><Button type="submit" disabled={!file || pending}><Icon name="upload" size={16} />{pending ? "Mengunggah…" : "Unggah foto"}</Button></form>
    {error && <div className="roster-error" role="alert"><Icon name="error" size={16} />{error}</div>}
    {!items.length ? <p className="documentation-empty">Belum ada foto dokumentasi untuk sesi ini.</p> : <ul className="documentation-list">{items.map(item => <li key={item.id}><a href={`${path}/documentation/${item.id}/file`} target="_blank" rel="noreferrer"><img src={`${path}/documentation/${item.id}/file`} alt={item.caption || `Dokumentasi oleh ${item.uploaderName}`} /></a><div><strong>{item.caption || item.file.name}</strong><span>{item.uploaderName} · {formatDateTime(item.createdAt, timezone)}</span></div></li>)}</ul>}
  </Card>;
}
function RosterManager({ path, session, roster, onExpired, saved }: { path: string; session: Meeting; roster: AttendanceRow[]; onExpired: () => void; saved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const options = useData<RosterOption[]>(`${path}/roster-options`, onExpired, session.version);
  if (session.status !== "scheduled" && session.status !== "open") return null;
  const students = [...roster.map(row => ({ studentId: row.studentId, studentName: row.studentName, identifier: row.identifier })), ...(options.data ?? [])].filter((student, index, all) => all.findIndex(item => item.studentId === student.studentId) === index);
  return <Card className="lesson-card attendance-roster-card"><div className="card-heading"><div><h2>Kelola roster</h2><p className="card-heading-hint">Tambahkan atau keluarkan santri dari sesi ini.</p></div><Button className="button-secondary button-small" aria-expanded={expanded} aria-controls="roster-manager" onClick={() => setExpanded(!expanded)}><Icon name={expanded ? "chevronUp" : "chevronDown"} size={15} />{expanded ? "Tutup" : "Ubah roster"}</Button></div>
    {expanded && <div id="roster-manager">{options.error ? <ErrorState message={options.error} retry={options.retry} /> : <MutationForm key={session.version} path={`${path}/roster`} method="PATCH" label="Simpan perubahan roster" onExpired={onExpired} saved={saved} disabled={!students.length} body={form => ({ studentId: form.get("studentId"), active: form.get("active") === "true", scope: form.get("scope"), version: session.version })}>
      <p className="card-hint field-wide attendance-form-note">Roster sesi adalah snapshot. Mengeluarkan santri tetap menyimpan riwayat absensinya; perubahan seri berlaku untuk sesi mendatang yang masih terjadwal atau berlangsung.</p>
      <label className="learning-field"><span>Santri</span><select className="input" name="studentId" required>{students.map(student => <option key={student.studentId} value={student.studentId}>{student.studentName}{student.identifier ? ` (${student.identifier})` : ""}</option>)}</select></label>
      <label className="learning-field"><span>Perubahan</span><select className="input" name="active" defaultValue="true"><option value="true">Tambahkan / aktifkan</option><option value="false">Keluarkan dari sesi</option></select></label>
      {session.seriesId && <label className="learning-field"><span>Cakupan</span><select className="input" name="scope" defaultValue="session"><option value="session">Sesi ini saja</option><option value="future_series">Sesi mendatang dalam seri</option></select></label>}
    </MutationForm>}</div>}
  </Card>;
}
function SessionActions({ session, path, onExpired, saved }: { session: Meeting; path: string; onExpired: () => void; saved: () => void }) {
  const actions = session.status === "scheduled" ? [["open", "Buka sesi"], ["cancel", "Batalkan sesi"]] : session.status === "open" ? [["close", "Tutup sesi"], ["cancel", "Batalkan sesi"]] : session.status === "closed" ? [["reopen", "Buka untuk koreksi"]] : [];
  if (!actions.length) return <p className="card-hint">Sesi dibatalkan tidak dapat diubah lagi.</p>;
  return <div className="attendance-actions">{actions.map(([action, label]) => <div key={action} className={`attendance-action action-${action}`}><MutationForm path={path} method="PATCH" label={label!} onExpired={onExpired} saved={saved} body={form => ({ action, version: session.version, reason: form.get("reason") ?? "" })}>{["reopen", "cancel"].includes(action!) && <Field label={action === "cancel" ? "Alasan pembatalan" : "Alasan koreksi"} name="reason" max={500} />}</MutationForm></div>)}</div>;
}
