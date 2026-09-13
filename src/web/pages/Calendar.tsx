import { useEffect, useRef, useState } from "react";
import type { Actor } from "../../core/permissions";
import type { LearningCourse } from "../../shared/learning";
import { calendarHref, calendarLabels, type AcademicCalendarData, type AcademicCalendarEvent, type CalendarEntry, type NotificationItem, type NotificationPreferences } from "../../shared/calendar";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon } from "../components/icons";
import { Field, MutationForm, Pager, Search, formatDateTime, useData } from "../components/learning";
import { brandTitle } from "../lib/brand";
type Page<T> = { items: T[]; nextOffset: number | null };
const schoolTime = "Asia/Jakarta";
const display = (value: string) => formatDateTime(value, schoolTime);
const schoolInput = (value: string) => new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16);
const fromSchool = (value: FormDataEntryValue | null) => new Date(`${String(value)}:00+07:00`).toISOString();
function CourseChoice({ onExpired, school, choose }: { onExpired: () => void; school: boolean; choose: (id: string) => void }) {
  const [q, setQ] = useState(""), [offset, setOffset] = useState(0);
  const view = useData<Page<LearningCourse>>(`/api/learning/courses?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <div className="field-wide"><Search change={value => { setQ(value); setOffset(0); choose(""); }} />
    {view.error ? <ErrorState message={view.error} retry={view.retry} /> : !view.data ? <LoadingState /> : <>
      <label className="learning-field"><span>Lingkup acara</span><select className="input" name="courseId" required={!school} defaultValue="" onChange={e => choose(e.target.value)}>
        <option value="" disabled={!school}>{school ? "Seluruh sekolah" : "Pilih course"}</option>
        {view.data.items.filter(c => c.canManage).map(c => <option value={c.id} key={c.id}>{c.name} · {c.className}</option>)}
      </select></label><Pager offset={offset} next={view.data.nextOffset} change={value => { setOffset(value); choose(""); }} />
    </>}
  </div>;
}
function EventEditor({ actor, entry, saved, cancel, onExpired }: { actor: Actor; entry?: CalendarEntry; saved: () => void; cancel: () => void; onExpired: () => void }) {
  const [key] = useState(() => crypto.randomUUID());
  const [courseId, setCourseId] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); }, []);
  return <div ref={panel} id="event-editor"><Card className="admin-form-card"><div className="card-heading"><h2>{entry ? "Ubah acara" : "Buat acara"}</h2><Button className="button-secondary" onClick={cancel}>Batal</Button></div>
    {!entry && actor.permissions.includes("learning.manage") && <CourseChoice onExpired={onExpired} school={actor.permissions.includes("academic.manage")} choose={setCourseId} />}
    <MutationForm disabled={!entry && !actor.permissions.includes("academic.manage") && !courseId} path={entry ? `/api/calendar/events/${entry.id}` : "/api/calendar/events"} method={entry ? "PATCH" : "POST"} label="Simpan acara" onExpired={onExpired} saved={saved}
      body={form => ({ title: form.get("title"), description: form.get("description"), startsAt: fromSchool(form.get("startsAt")), endsAt: fromSchool(form.get("endsAt")),
        courseId: entry ? entry.courseId : courseId, requestKey: key, ...(entry ? { version: entry.version } : {}) })}>
      <Field label="Judul acara" name="title" value={entry?.title} />
      {entry && <p className="card-hint">{entry.courseName ?? "Seluruh sekolah"}</p>}
      <Field label="Mulai (WIB)" name="startsAt" type="datetime-local" value={entry ? schoolInput(entry.startsAt) : ""} />
      <Field label="Selesai (WIB)" name="endsAt" type="datetime-local" value={entry ? schoolInput(entry.endsAt) : ""} />
      <Field label="Keterangan" name="description" area max={2000} required={false} value={entry?.description} />
    </MutationForm></Card></div>;
}
function EventDetail({ id, actor, onExpired }: { id: string; actor: Actor; onExpired: () => void }) {
  const [revision, setRevision] = useState(0), [edit, setEdit] = useState(false), [archive, setArchive] = useState(false);
  const view = useData<CalendarEntry>(`/api/calendar/events/${encodeURIComponent(id)}`, onExpired, revision);
  const [snapshot, setSnapshot] = useState<CalendarEntry | null>(null);
  return <><PageHeader title="Acara akademik" breadcrumbs={[{ label: "Kalender", href: "/calendar" }]} description="Waktu ditampilkan dalam WIB." />
    {view.error ? <ErrorState message={view.error} retry={view.retry} /> : !view.data ? <LoadingState /> : <>
      {edit && snapshot ? <EventEditor actor={actor} entry={snapshot} onExpired={onExpired} cancel={() => setEdit(false)} saved={() => { setEdit(false); setRevision(r => r + 1); }} /> : <Card className="lesson-card">
        <div className="card-heading"><h2>{view.data.title}</h2><span className="badge">{view.data.courseName ?? "Seluruh sekolah"}</span></div>
        <p>{display(view.data.startsAt)} – {display(view.data.endsAt)}</p><p className="calendar-description">{view.data.description || "Tidak ada keterangan tambahan."}</p>
        {view.data.canManage && <div className="form-actions"><Button aria-expanded={edit} aria-controls="event-editor" onClick={() => { setSnapshot(view.data); setEdit(true); setArchive(false); }}>Ubah acara</Button>
          <Button className="button-secondary" aria-expanded={archive} aria-controls="archive-event" onClick={() => { setSnapshot(view.data); setArchive(true); }}>Arsipkan acara</Button></div>}
      </Card>}
      {archive && snapshot && <Card className="lesson-card" ><div id="archive-event"><h2>Arsipkan acara ini?</h2><p>Acara tidak lagi tampil di kalender atau notifikasi.</p>
        <MutationForm path={`/api/calendar/events/${id}`} method="PATCH" label="Ya, arsipkan" body={() => ({ action: "archive", version: snapshot.version })} saved={() => location.assign("/calendar")} onExpired={onExpired} />
        <Button className="button-secondary" onClick={() => setArchive(false)}>Batal</Button></div></Card>}
    </>}
  </>;
}
export function Calendar({ actor, onExpired }: { actor: Actor; onExpired: () => void }) {
  const event = new URLSearchParams(location.search).get("event");
  useEffect(() => { document.title = brandTitle("Kalender"); }, []);
  return event ? <EventDetail id={event} actor={actor} onExpired={onExpired} /> : <CalendarTabs actor={actor} onExpired={onExpired} />;
}
function CalendarTabs({ actor, onExpired }: { actor: Actor; onExpired: () => void }) {
  const [tab, setTab] = useState<"learning" | "academic">(() => new URLSearchParams(location.search).get("tab") === "academic" ? "academic" : "learning");
  return <><PageHeader title="Kalender" description="Agenda sekolah, tenggat, dan sesi kelas dalam WIB." />
    <nav className="tabs calendar-tabs" aria-label="Jenis kalender">
      <button className={tab === "learning" ? "tab-active" : ""} aria-current={tab === "learning" ? "page" : undefined} onClick={() => setTab("learning")}>Kalender pembelajaran</button>
      <button className={tab === "academic" ? "tab-active" : ""} aria-current={tab === "academic" ? "page" : undefined} onClick={() => setTab("academic")}>Kalender akademik</button>
    </nav>
    {tab === "learning" ? <LearningAgenda actor={actor} onExpired={onExpired} /> : <AcademicCalendar onExpired={onExpired} />}
  </>;
}
function LearningAgenda({ actor, onExpired }: { actor: Actor; onExpired: () => void }) {
  const [range, setRange] = useState(() => ({ from: schoolInput(new Date().toISOString()).slice(0, 10), to: schoolInput(new Date(Date.now() + 30 * 86400000).toISOString()).slice(0, 10) }));
  const [offset, setOffset] = useState(0), [q, setQ] = useState(""), [revision, setRevision] = useState(0), [create, setCreate] = useState(false);
  const query = new URLSearchParams({ from: new Date(`${range.from}T00:00:00+07:00`).toISOString(), to: new Date(`${range.to}T00:00:00+07:00`).toISOString(), offset: String(offset), q });
  const view = useData<Page<CalendarEntry>>(`/api/calendar?${query}`, onExpired, revision);
  const canCreate = actor.permissions.includes("academic.manage") || actor.permissions.includes("learning.manage");
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setCreate(false); trigger.current?.focus(); };
  return <>{create && <EventEditor actor={actor} onExpired={onExpired} cancel={close} saved={() => { close(); setRevision(r => r + 1); }} />}
    <Card><form className="filter-bar calendar-filter-bar" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); setRange({ from: String(form.get("from")), to: String(form.get("to")) }); setOffset(0); }}>
      <Field label="Dari tanggal" name="from" type="date" value={range.from} /><Field label="Sebelum tanggal" name="to" type="date" value={range.to} />
      <div className="calendar-filter-actions"><Button type="submit" className="button-secondary calendar-filter-action">Tampilkan</Button>{canCreate && <button ref={trigger} type="button" className="button" aria-expanded={create} aria-controls="event-editor" onClick={() => setCreate(!create)}>Buat acara</button>}</div></form><p className="card-hint calendar-range-hint">Rentang maksimal 93 hari. Tanggal akhir tidak termasuk.</p>
      <div className="calendar-search"><Search change={value => { setQ(value); setOffset(0); }} /></div>
      {view.error ? <ErrorState message={view.error} retry={view.retry} /> : !view.data ? <LoadingState /> : <>
        {!view.data.items.length ? <EmptyState icon="calendar" title="Belum ada agenda" description="Pilih rentang lain atau tunggu agenda berikutnya." action={canCreate && <Button onClick={() => setCreate(true)}>Buat acara</Button>} />
          : <ul className="task-list">{view.data.items.map(e => <li key={`${e.kind}:${e.id}`}><a className="task-item" href={calendarHref(e)}><span className="task-body"><strong>{e.title}</strong><span className="task-meta">{display(e.startsAt)}{e.endsAt !== e.startsAt ? ` – ${display(e.endsAt)}` : ""} · {e.courseName ?? "Seluruh sekolah"}</span></span><span className="badge badge-draft">{calendarLabels[e.kind]}</span></a></li>)}</ul>}
        <Pager offset={offset} next={view.data.nextOffset} change={setOffset} />
      </>}
  </Card></>;
}
const categoryLabels: Record<string, string> = { academic: "Akademik", holiday: "Libur", assessment: "Asesmen", student: "Kegiatan santri", learning: "Pembelajaran" };
const categoryClass = (category: string) => `academic-day-${category}`;
const notificationLabels = { reminder: "Pembelajaran", level_up: "Pertumbuhan", checkin: "Kehadiran" } as const;
const notificationIcons = { reminder: "book", level_up: "star", checkin: "attendance" } as const;
const notificationCategoryClass = (kind: NotificationItem["kind"]) => `notification-category-${kind.replace("_", "-")}`;
function AcademicCalendar({ onExpired }: { onExpired: () => void }) {
  const [yearId, setYearId] = useState(""), [classId, setClassId] = useState("");
  const query = new URLSearchParams(); if (yearId) query.set("yearId", yearId); if (classId) query.set("classId", classId);
  const view = useData<AcademicCalendarData>(`/api/calendar/academic?${query}`, onExpired);
  useEffect(() => { if (view.data && !yearId) setYearId(view.data.year.id); }, [view.data, yearId]);
  if (view.error) return <ErrorState message={view.error} retry={view.retry} />;
  if (!view.data) return <LoadingState />;
  const data = view.data;
  return <Card className="academic-calendar-card">
    <div className="academic-calendar-heading"><div><h2>{data.year.name}</h2><p className="card-hint">Kalender kegiatan akademik satu tahun ajaran.</p></div><div className="academic-calendar-stats"><strong>{data.events.length}</strong><span>kegiatan</span></div></div>
    {data.canManage && <div className="academic-calendar-filters"><label className="learning-field"><span>Tahun ajaran</span><select className="input" value={data.year.id} onChange={event => { setYearId(event.target.value); setClassId(""); }}>
      {data.years.map(year => <option value={year.id} key={year.id}>{year.name}</option>)}
    </select></label><label className="learning-field"><span>Kelas</span><select className="input" value={classId} onChange={event => setClassId(event.target.value)}><option value="">Semua kelas</option>{data.classes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>}
    <AcademicMonths year={data.year} events={data.events} />
  </Card>;
}
function AcademicMonths({ year, events }: { year: AcademicCalendarData["year"]; events: AcademicCalendarEvent[] }) {
  const start = new Date(`${year.startsOn}T00:00:00Z`);
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)));
  return <div className="academic-calendar-months">{[0, 1].map(semester => <section className="academic-semester" key={semester}><h3>Semester {semester + 1}</h3><div className="academic-month-grid">{months.slice(semester * 6, semester * 6 + 6).map(month => <AcademicMonth key={month.toISOString()} month={month} events={events} />)}</div></section>)}</div>;
}
function AcademicMonth({ month, events }: { month: Date; events: AcademicCalendarEvent[] }) {
  const year = month.getUTCFullYear(), monthIndex = month.getUTCMonth(), firstDay = (month.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, index) => index < firstDay || index >= firstDay + days ? null : index - firstDay + 1);
  const dateKey = (day: number) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dayEvents = (day: number) => events.filter(event => event.startsOn <= dateKey(day) && event.endsOn >= dateKey(day));
  const monthStart = dateKey(1), monthEnd = dateKey(days);
  const monthEvents = events.filter(event => event.startsOn <= monthEnd && event.endsOn >= monthStart);
  const eventRange = (event: AcademicCalendarEvent) => {
    const start = event.startsOn < monthStart ? monthStart : event.startsOn;
    const end = event.endsOn > monthEnd ? monthEnd : event.endsOn;
    const startDay = Number(start.slice(8, 10)), endDay = Number(end.slice(8, 10));
    return startDay === endDay ? String(startDay) : `${startDay}-${endDay}`;
  };
  return <article className="academic-month"><h4>{new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}</h4><div className="academic-weekdays">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map(day => <span key={day}>{day}</span>)}</div><div className="academic-days">{cells.map((day, index) => day === null ? <span className="academic-day academic-day-empty" key={index} /> : <AcademicDay day={day} date={dateKey(day)} events={dayEvents(day)} key={index} />)}</div>
    {monthEvents.length > 0 && <ul className="academic-month-summary">{monthEvents.map(event => <li key={event.id}><span className={`academic-summary-dot academic-summary-${event.category}`} /><span className="academic-summary-content"><strong>{eventRange(event)}:</strong> {event.title}</span></li>)}</ul>}
  </article>;
}
function AcademicDay({ day, date, events }: { day: number; date: string; events: AcademicCalendarEvent[] }) {
  const event = events[0];
  return <span className={`academic-day ${event ? categoryClass(event.category) : ""}`} tabIndex={event ? 0 : undefined} aria-label={event ? `${date}: ${events.map(item => item.title).join(", ")}` : date}>
    {day}{event && <span className="academic-day-tooltip" role="tooltip"><strong>{events.map(item => item.title).join(" · ")}</strong><small>{events.map(item => `${categoryLabels[item.category]}${item.className ? ` · ${item.className}` : ""}`).join("\n")}</small></span>}
  </span>;
}
export function Notifications({ onExpired }: { onExpired: () => void }) {
  const [offset, setOffset] = useState(0), [unread, setUnread] = useState(false), [revision, setRevision] = useState(0), [settings, setSettings] = useState(false);
  const view = useData<Page<NotificationItem>>(`/api/notifications?offset=${offset}&unread=${unread}`, onExpired, revision);
  const prefs = useData<NotificationPreferences>("/api/notifications/preferences", onExpired);
  const [saved, setSaved] = useState(false);
  useEffect(() => { document.title = brandTitle("Notifikasi"); }, []);
  return <><PageHeader title="Notifikasi" description="Pengingat dan kabar pertumbuhan Anda di aplikasi." actions={<Button className="button-secondary" aria-expanded={settings} aria-controls="notification-preferences" onClick={() => setSettings(!settings)}>Preferensi</Button>} />
    {settings && <Card className="admin-form-card"><div id="notification-preferences"><h2>Preferensi notifikasi</h2>
      {prefs.error ? <ErrorState message={prefs.error} retry={prefs.retry} /> : !prefs.data ? <LoadingState /> : <MutationForm path="/api/notifications/preferences" method="PATCH" label="Simpan preferensi" onExpired={onExpired} saved={() => { setSaved(true); prefs.retry(); }}
        body={form => ({ reminders: form.has("reminders"), levelUp: form.has("levelUp"), checkin: form.has("checkin") })}>
        {([["reminders", "Pengingat 24 jam sebelum agenda"], ["levelUp", "Kenaikan level"], ["checkin", "Absensi QR dibuka"]] as const).map(([name, label]) => <label className="calendar-preference" key={name}><input type="checkbox" name={name} defaultChecked={prefs.data![name]} onChange={() => setSaved(false)} />{label}</label>)}
        <p className="card-hint field-wide">Berlaku untuk pengiriman berikutnya di aplikasi ini.</p>
      </MutationForm>}{saved && <p className="success-state" role="status">Preferensi disimpan.</p>}
    </div></Card>}
    <Card><div className="card-heading"><h2>Inbox</h2><div className="card-tools"><label className="calendar-preference"><input type="checkbox" checked={unread} onChange={e => { setUnread(e.target.checked); setOffset(0); }} />Belum dibaca</label><Button className="button-secondary" onClick={view.retry}>Muat ulang</Button></div></div>
      {view.error ? <ErrorState message={view.error} retry={view.retry} /> : !view.data ? <LoadingState /> : <>
        {!view.data.items.length ? <EmptyState icon="calendar" title="Belum ada notifikasi" description="Pengingat, kenaikan level, dan pembukaan absensi QR akan tampil di sini." /> : <ul className="task-list">{view.data.items.map(n => {
          const unreadItem = n.status === "delivered" && !n.readAt;
          return <li className={`notification-row ${unreadItem ? "is-unread" : ""}`} key={n.id}>
            <span className={`notification-icon ${notificationCategoryClass(n.kind)}`} aria-hidden="true"><Icon name={notificationIcons[n.kind]} size={18} /></span>
            <div className="task-body"><div className="notification-title-line"><a className="table-link" href={n.href}>{n.title}</a><span className={`badge notification-category ${notificationCategoryClass(n.kind)}`}>{notificationLabels[n.kind]}</span></div><span className="task-meta">{display(n.deliveredAt ?? n.scheduledAt)}</span></div>
            <div className="notification-actions"><span className={`badge ${unreadItem ? "" : n.status === "suppressed" ? "badge-danger" : "badge-draft"}`}>{n.status === "pending" ? "Menunggu pengiriman" : n.status === "suppressed" ? "Tidak dikirim" : unreadItem ? "Belum dibaca" : "Sudah dibaca"}</span>{unreadItem && <MutationForm path={`/api/notifications/${n.id}/read`} label="Tandai dibaca" body={() => ({})} onExpired={onExpired} saved={() => setRevision(r => r + 1)} />}</div>
          </li>;
        })}</ul>}
        <Pager offset={offset} next={view.data.nextOffset} change={setOffset} />
      </>}
    </Card></>;
}
export function AgendaShortcut({ onExpired }: { onExpired: () => void }) {
  const [range] = useState(() => new URLSearchParams({ from: new Date().toISOString(), to: new Date(Date.now() + 7 * 86400000).toISOString() }).toString());
  const view = useData<Page<CalendarEntry>>(`/api/calendar?${range}`, onExpired);
  return <Card><div className="card-heading"><h2>Agenda mendatang</h2></div>
    {view.error ? <ErrorState message={view.error} retry={view.retry} /> : !view.data ? <LoadingState /> : !view.data.items.length ? <EmptyState icon="calendar" title="Belum ada agenda" description="Agenda tujuh hari mendatang akan tampil di sini." /> : <ul className="task-list">{view.data.items.slice(0, 5).map(e => <li key={`${e.kind}:${e.id}`}><a className="task-item" href={calendarHref(e)}><span className="task-body"><strong>{e.title}</strong><span className="task-meta">{display(e.startsAt)}</span></span></a></li>)}</ul>}
    <a className="card-footer-link" href="/calendar">Buka kalender</a><a className="card-footer-link" href="/notifications">Buka notifikasi</a>
  </Card>;
}
