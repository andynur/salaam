import { useCallback, useEffect, useRef, useState } from "react";
import type { AttendanceReport, AttendanceRow, Meeting, MeetingDetail, RosterOption, SessionEvent } from "../../shared/attendance";
import { attendanceLabels, sessionLabels } from "../../shared/attendance";
import type { LearningCourse, Page } from "../../shared/learning";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon } from "../components/icons";
import { deviceTimezone, Field, formatDateTime, fromLocalInput, MutationForm, Pager, Search, useData } from "../components/learning";
import { CheckinManager, CheckinStudent } from "../components/checkin";
const root = "/api/attendance/courses";
const sessionEventLabels: Record<string, string> = { open: "Sesi dibuka", close: "Sesi ditutup", reopen: "Sesi dibuka untuk koreksi", cancel: "Sesi dibatalkan", note: "Catatan diperbarui" };
const href = (courseId: string, sessionId?: string) => `/attendance/courses/${courseId}${sessionId ? `/sessions/${sessionId}` : ""}`;
export function Attendance({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const match = /^\/attendance\/courses\/([^/]+)(?:\/sessions\/([^/]+))?$/.exec(location.pathname);
  return match ? match[2] ? <SessionView courseId={match[1]!} sessionId={match[2]} timezone={timezone} onExpired={onExpired} /> : <CourseSessions courseId={match[1]!} timezone={timezone} onExpired={onExpired} /> : <AttendanceCourses onExpired={onExpired} />;
}
function AttendanceCourses({ onExpired }: { onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<LearningCourse>>(`/api/learning/courses?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <div className="lesson-workspace"><PageHeader title="Kehadiran" description="Sesi kelas dan riwayat kehadiran santri." /><Card><div className="card-heading"><h2>Course Anda</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState icon="attendance" title="Belum ada course" description="Course yang dapat Anda akses akan tampil di sini." /> : <div className="course-grid">{data.items.map(c => <a className="course-tile attendance-course-tile" href={href(c.id)} key={c.id}><div className="learning-row"><span className="course-avatar" aria-hidden="true">{c.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word.charAt(0)).join("").toUpperCase()}</span><span className="badge">Kehadiran</span></div><h3>{c.name}</h3><p>{c.className} · {c.term} · {c.year}</p><span className="course-open">Lihat sesi<Icon name="arrowRight" /></span></a>)}</div>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card></div>;
}
function CourseSessions({ courseId, timezone, onExpired }: { courseId: string; timezone: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("sessions");
  const [creating, setCreating] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const { data, error, retry } = useData<Page<Meeting> & { course: LearningCourse }>(`${root}/${courseId}/sessions?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired, revision);
  const tabButton = (key: string, label: string) => <button className={tab === key ? "tab-active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>;
  return <div className="lesson-workspace"><PageHeader breadcrumbs={[{ label: "Kehadiran", href: "/attendance" }]} title={data?.course.name ?? "Sesi kelas"} description="Kehadiran selalu dicatat pada sesi pertemuan." actions={data?.course.canManage && tab === "sessions" ? <><Button aria-expanded={creating} aria-controls="create-session" onClick={() => { setCreating(!creating); setRecurring(false); setRequestKey(crypto.randomUUID()); }}><Icon name="plus" size={16} />Buat sesi</Button><Button className="button-secondary" aria-pressed={recurring} onClick={() => { setRecurring(!recurring); setCreating(true); setRequestKey(crypto.randomUUID()); }}><Icon name="history" size={16} />Sesi berulang</Button></> : undefined} />
    <nav className="tabs" aria-label="Halaman course kehadiran">{tabButton("sessions", "Sesi")}{tabButton("report", "Laporan kehadiran")}</nav>
    {tab === "report" ? <Report courseId={courseId} onExpired={onExpired} /> : <>
      {creating && <Card className="lesson-card"><div id="create-session"><h2>{recurring ? "Sesi berulang" : "Sesi baru"}</h2><MutationForm path={`${root}/${courseId}/sessions${recurring ? "/series" : ""}`} label={recurring ? "Buat sesi berulang" : "Simpan sesi"} onExpired={onExpired} saved={() => { setCreating(false); setRecurring(false); setRevision(v => v + 1); }} body={form => recurring ? ({ title: form.get("title"), startsAt: fromLocalInput(form.get("startsAt")), endsAt: fromLocalInput(form.get("endsAt")), note: form.get("note"), intervalDays: Number(form.get("intervalDays")), occurrenceCount: Number(form.get("occurrenceCount")), qrRotateSeconds: Number(form.get("qrRotateSeconds")), qrLateAfterMinutes: form.get("qrLateAfterMinutes") ? Number(form.get("qrLateAfterMinutes")) : null, requestKey }) : ({ title: form.get("title"), startsAt: fromLocalInput(form.get("startsAt")), endsAt: fromLocalInput(form.get("endsAt")), note: form.get("note"), requestKey })}>
        <Field label="Judul sesi" name="title" /><Field label={`Mulai (${deviceTimezone()})`} name="startsAt" type="datetime-local" /><Field label={`Selesai (${deviceTimezone()})`} name="endsAt" type="datetime-local" /><Field label="Catatan privat guru" name="note" area required={false} max={2000} />
        {recurring && <><Field label="Interval (hari)" name="intervalDays" type="number" min={1} max={365} value="7" /><Field label="Jumlah sesi (maksimal 52)" name="occurrenceCount" type="number" min={1} max={52} value="8" /><Field label="Rotasi kode QR (detik)" name="qrRotateSeconds" type="number" min={15} max={300} value="30" /><Field label="Terlambat setelah mulai (menit, opsional)" name="qrLateAfterMinutes" type="number" min={0} max={1440} required={false} /></>}
      </MutationForm><p className="card-hint">Daftar santri aktif disimpan sebagai snapshot pada setiap sesi. Sesi berulang dibatasi 52 occurrence dan saat dibuka akan memakai konfigurasi QR seri.</p></div></Card>}
      <Card><div className="card-heading"><h2>Daftar sesi</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
        {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState icon="attendance" title="Belum ada sesi" description="Sesi pertemuan akan tampil di sini." /> : <><div className="table-scroll"><table className="data-table"><thead><tr><th>Pertemuan</th><th>Mulai</th><th>Status</th></tr></thead><tbody>{data.items.map(s => <tr key={s.id}><td><a className="table-link" href={href(courseId, s.id)}>{s.title}</a></td><td>{formatDateTime(s.startsAt, timezone)}</td><td>{sessionLabels[s.status]}</td></tr>)}</tbody></table></div><Pager offset={offset} next={data.nextOffset} change={setOffset} /></>}
      </Card></>}
  </div>;
}
function Report({ courseId, onExpired }: { courseId: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<AttendanceReport>>(`${root}/${courseId}/report?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <Card><div className="card-heading"><h2>Laporan kehadiran</h2><Search change={value => { setQ(value); setOffset(0); }} /></div><p className="card-hint">Persentase: hadir + terlambat dibagi sesi yang sudah ditutup. Sesi dibatalkan tidak dihitung. Jumlah status mencakup semua sesi lainnya.</p>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState icon="attendance" title="Belum ada laporan" description="Laporan tersedia setelah roster sesi dibuat." /> : <><div className="table-scroll"><table className="data-table"><thead><tr><th>Santri</th>{Object.values(attendanceLabels).map(label => <th key={label}>{label}</th>)}<th>Belum dicatat</th><th>Sesi ditutup</th><th>Kehadiran</th></tr></thead><tbody>{data.items.map(r => <tr key={r.studentId}><td>{r.studentName}</td>{Object.keys(attendanceLabels).map(key => <td key={key}>{r[key as keyof typeof attendanceLabels]}</td>)}<td>{r.unrecorded}</td><td>{r.closed}</td><td>{r.rate === null ? "—" : `${r.rate}%`}</td></tr>)}</tbody></table></div><Pager offset={offset} next={data.nextOffset} change={setOffset} /></>}
  </Card>;
}
function SessionView({ courseId, sessionId, timezone, onExpired }: { courseId: string; sessionId: string; timezone: string; onExpired: () => void }) {
  const [data, setData] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [connected, setConnected] = useState(false);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [detailTab, setDetailTab] = useState("attendance");
  const [noteDraft, setNoteDraft] = useState<{ note: string; version: number } | null>(null);
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
  const detailTabButton = (key: string, label: string) => <button className={detailTab === key ? "tab-active" : ""} aria-current={detailTab === key ? "page" : undefined} onClick={() => { setDetailTab(key); setEditing(null); }}>{label}</button>;
  return <div className="lesson-workspace"><PageHeader breadcrumbs={[{ label: "Kehadiran", href: "/attendance" }, ...(data ? [{ label: data.course.name, href: href(courseId) }] : [])]} title={data?.session.title ?? "Sesi kelas"} description={data ? `${data.course.name} · ${formatDateTime(data.session.startsAt, timezone)} – ${formatDateTime(data.session.endsAt, timezone)}` : "Memuat sesi kelas"} actions={<div className="attendance-status-actions"><span role="status" className={`badge ${connected ? "badge-success" : "badge-draft"}`}><Icon name={connected ? "success" : "history"} size={14} />{connected ? "Live aktif" : "Menghubungkan…"}</span><Button className="button-secondary button-small" onClick={() => void load()}><Icon name="refresh" size={15} />Muat ulang</Button>{data && <span className="badge"><Icon name="calendar" size={14} />{sessionLabels[data.session.status]}</span>}</div>} />
    {error && <ErrorState message={error} retry={() => void load()} />}{!data ? !error && <LoadingState /> : <>
      <nav className="tabs" aria-label="Bagian sesi kehadiran">{detailTabButton("attendance", data.course.canManage ? "Kehadiran" : "Kehadiran saya")}{detailTabButton("checkin", "Absensi QR")}{data.course.canManage && detailTabButton("manage", "Kelola sesi")}{data.course.canManage && detailTabButton("history", "Riwayat")}</nav>
      {detailTab === "attendance" && <>
        <Card><div className="card-heading"><h2>Ringkasan kehadiran</h2><span>{data.counts.total} santri</span></div><div className="filter-bar attendance-summary">{Object.entries(attendanceLabels).map(([key, label]) => <span className="badge" key={key}>{label}: {data.counts[key as keyof typeof attendanceLabels]}</span>)}<span className="badge badge-gold">Belum dicatat: {data.counts.unrecorded}</span></div>{data.course.canManage && <p className="card-hint attendance-hint">QR: {data.qrBreakdown.scanned} dipindai ({data.qrBreakdown.present} hadir, {data.qrBreakdown.late} terlambat), {data.qrBreakdown.unscanned} belum dipindai.</p>}</Card>
        {data.course.canManage && <RosterManager path={path} session={data.session} roster={data.roster.items} onExpired={onExpired} saved={() => void load()} />}
        {editing && <div ref={editor}><Card className="lesson-card"><div className="card-heading"><h2>Catat kehadiran: {editing.studentName}</h2><Button className="button-secondary button-small" onClick={finishEditing}>Batal</Button></div><MutationForm key={`${editing.studentId}-${editing.recordId}`} path={`${path}/attendance/${editing.studentId}`} method="PATCH" label="Simpan kehadiran" onExpired={onExpired} saved={saved} disabled={data.session.status !== "open"} body={form => ({ status: form.get("status"), note: form.get("note"), previousId: editing.recordId })}>
          <label className="learning-field"><span>Status kehadiran</span><select className="input" name="status" defaultValue={editing.status ?? ""} required><option value="" disabled>Pilih status</option>{Object.entries(attendanceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><Field label="Catatan privat santri" name="note" value={editing.note ?? ""} area required={false} max={2000} />
        </MutationForm></Card></div>}
        <Card><div className="card-heading"><h2>{data.course.canManage ? "Daftar santri" : "Kehadiran saya"}</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
          {!data.roster.items.length ? <EmptyState icon="users" title="Tidak ada santri" description="Tidak ada roster yang sesuai pencarian." /> : <><div className="table-scroll"><table className="data-table"><thead><tr><th>Santri</th><th>NIS</th><th>Status</th><th>Dicatat</th>{data.course.canManage && <><th>Catatan privat</th><th>Aksi</th></>}</tr></thead><tbody>{data.roster.items.map(r => <tr key={r.studentId}><td>{r.studentName}</td><td>{r.identifier ?? "—"}</td><td>{r.status ? attendanceLabels[r.status] : "Belum dicatat"}</td><td>{r.recordedAt ? formatDateTime(r.recordedAt, timezone) : "—"}</td>{data.course.canManage && <><td>{r.note || "—"}</td><td><Button className="button-secondary button-small" disabled={data.session.status !== "open"} onClick={() => setEditing(r)} data-student-id={r.studentId} aria-label={`Catat ${r.studentName}`}>Catat</Button></td></>}</tr>)}</tbody></table></div><Pager offset={offset} next={data.roster.nextOffset} change={setOffset} /></>}
        </Card>
      </>}
      {detailTab === "checkin" && (data.course.canManage
        ? <CheckinManager path={path} session={data.session} checkin={data.checkin} timezone={timezone} onExpired={onExpired} saved={() => void load()} />
        : <CheckinStudent path={path} session={data.session} checkin={data.checkin} timezone={timezone} onExpired={onExpired} saved={() => void load()} />)}
      {detailTab === "manage" && data.course.canManage && <>
        <Card className="lesson-card"><div className="card-heading"><h2>Kelola sesi</h2></div><SessionActions session={data.session} path={path} onExpired={onExpired} saved={() => void load()} />
        {data.session.reason && <p className="card-hint">Alasan terakhir: {data.session.reason}</p>}
        <p className="card-hint">Catatan privat: {data.session.note || "Belum ada catatan"}</p>
        <Button className="button-secondary button-small" disabled={data.session.status === "cancelled"} aria-expanded={!!noteDraft} aria-controls="session-note-editor" onClick={() => setNoteDraft({ note: data.session.note ?? "", version: data.session.version })}>Edit catatan sesi</Button>
        {noteDraft && <div id="session-note-editor"><MutationForm key={noteDraft.version} path={path} method="PATCH" label="Simpan catatan" onExpired={onExpired} saved={() => { setNoteDraft(null); void load(); }} disabled={data.session.status === "cancelled"} body={form => ({ action: "note", version: noteDraft.version, note: form.get("note") })}><Field label="Catatan privat guru" name="note" value={noteDraft.note} area required={false} max={2000} /></MutationForm><Button className="button-secondary button-small" onClick={() => setNoteDraft(null)}>Batal edit catatan</Button></div>}
      </Card>
        {data.session.status === "open" && <Card className="lesson-card"><div className="card-heading"><h2>Penandaan massal</h2></div>
        <MutationForm path={`${path}/bulk-attendance`} method="POST" label="Tandai santri belum dicatat" onExpired={onExpired} saved={() => void load()} disabled={!data.roster.items.some(row => !row.recordId)} body={() => ({ records: data.roster.items.filter(row => !row.recordId).map(row => ({ studentId: row.studentId, status: "present", note: "", previousId: null })) })}>
          <p className="card-hint">Menandai semua santri yang terlihat di halaman ini sebagai hadir. Gunakan pencarian dan pager untuk halaman lain.</p>
        </MutationForm>
        </Card>}
      </>}
      {detailTab === "history" && data.course.canManage && <Card className="lesson-card"><div className="card-heading"><h2>Riwayat sesi</h2></div>
        {history.error ? <ErrorState message={history.error} retry={history.retry} /> : !history.data ? <LoadingState /> : !history.data.items.length ? <EmptyState icon="history" title="Belum ada riwayat" description="Perubahan sesi akan tercatat di sini." /> : <><div className="table-scroll"><table className="data-table"><thead><tr><th>Waktu</th><th>Perubahan</th><th>Oleh</th><th>Alasan</th></tr></thead><tbody>{history.data.items.map(event => <tr key={event.id}><td>{formatDateTime(event.createdAt, timezone)}</td><td>{sessionEventLabels[event.action] ?? event.action}</td><td>{event.actorName}</td><td>{event.reason || "—"}</td></tr>)}</tbody></table></div><Pager offset={historyOffset} next={history.data.nextOffset} change={setHistoryOffset} /></>}
      </Card>}
    </>}
  </div>;
}
function RosterManager({ path, session, roster, onExpired, saved }: { path: string; session: Meeting; roster: AttendanceRow[]; onExpired: () => void; saved: () => void }) {
  const options = useData<RosterOption[]>(`${path}/roster-options`, onExpired, session.version);
  if (session.status !== "scheduled" && session.status !== "open") return null;
  const students = [...roster.map(row => ({ studentId: row.studentId, studentName: row.studentName, identifier: row.identifier })), ...(options.data ?? [])].filter((student, index, all) => all.findIndex(item => item.studentId === student.studentId) === index);
  return <Card className="lesson-card attendance-roster-card"><div className="card-heading"><h2>Kelola roster</h2></div>
    {options.error ? <ErrorState message={options.error} retry={options.retry} /> : <MutationForm key={session.version} path={`${path}/roster`} method="PATCH" label="Simpan perubahan roster" onExpired={onExpired} saved={saved} disabled={!students.length} body={form => ({ studentId: form.get("studentId"), active: form.get("active") === "true", scope: form.get("scope"), version: session.version })}>
      <p className="card-hint field-wide attendance-form-note">Roster sesi adalah snapshot. Mengeluarkan santri tetap menyimpan riwayat absensinya; perubahan seri berlaku untuk sesi mendatang yang masih terjadwal atau berlangsung.</p>
      <label className="learning-field"><span>Santri</span><select className="input" name="studentId" required>{students.map(student => <option key={student.studentId} value={student.studentId}>{student.studentName}{student.identifier ? ` (${student.identifier})` : ""}</option>)}</select></label>
      <label className="learning-field"><span>Perubahan</span><select className="input" name="active" defaultValue="true"><option value="true">Tambahkan / aktifkan</option><option value="false">Keluarkan dari sesi</option></select></label>
      {session.seriesId && <label className="learning-field"><span>Cakupan</span><select className="input" name="scope" defaultValue="session"><option value="session">Sesi ini saja</option><option value="future_series">Sesi mendatang dalam seri</option></select></label>}
    </MutationForm>}
  </Card>;
}
function SessionActions({ session, path, onExpired, saved }: { session: Meeting; path: string; onExpired: () => void; saved: () => void }) {
  const actions = session.status === "scheduled" ? [["open", "Buka sesi"], ["cancel", "Batalkan sesi"]] : session.status === "open" ? [["close", "Tutup sesi"], ["cancel", "Batalkan sesi"]] : session.status === "closed" ? [["reopen", "Buka untuk koreksi"]] : [];
  return <div className="attendance-actions">{actions.map(([action, label]) => <MutationForm key={action} path={path} method="PATCH" label={label!} onExpired={onExpired} saved={saved} body={form => ({ action, version: session.version, reason: form.get("reason") ?? "" })}>{["reopen", "cancel"].includes(action!) && <Field label={action === "cancel" ? "Alasan pembatalan" : "Alasan koreksi"} name="reason" max={500} />}</MutationForm>)}</div>;
}
