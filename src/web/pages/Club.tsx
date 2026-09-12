import { useEffect, useState } from "react";
import type { Actor } from "../../core/permissions";
import type { LearningCourse, Page } from "../../shared/learning";
import type { ProjectRow } from "../../shared/project";
import { sessionLabels } from "../../shared/attendance";
import { clubFlow, clubRoleLabels, maxClubGoals, type ClubChallengeRow, type ClubCourseRow, type ClubDetail, type ClubMeetingRow, type ClubPerson, type ClubProgressRow, type ClubRole, type ClubSummary } from "../../shared/club";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon } from "../components/icons";
import { Field, MutationForm, Pager, Search, errorMessage, formatDateTime, learningApi, useData } from "../components/learning";
import { ProjectStatusBadge } from "../components/projects";

const clubApi = "/api/clubs";
type Common = { actor: Actor; timezone: string; onExpired: () => void };
type Tab = "overview" | "learning" | "sessions" | "challenges" | "projects" | "members" | "progress";
const tabLabels: Record<Tab, string> = {
  overview: "Ringkasan", learning: "Pembelajaran", sessions: "Pertemuan", challenges: "Challenge",
  projects: "Projects", members: "Anggota", progress: "Progres",
};

// The Club page has two levels: a directory of the clubs the actor may open, and the
// workspace of one club. The workspace is an orchestration screen — every tab reads an
// existing SALAAM surface (courses, challenges, projects, meetings, XP) filtered to the
// club's linked courses. Creating, archiving and restoring a club is administrator work.
export function Club({ timezone, onExpired }: Common) {
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get("club"));
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [revision, setRevision] = useState(0);
  const params = new URLSearchParams({ q, offset: "0" });
  if (archived) params.set("archived", "1");
  const { data, error, retry } = useData<Page<ClubSummary>>(`${clubApi}?${params}`, onExpired, revision);
  function select(clubId: string | null, tab: Tab = "overview") {
    setSelected(clubId);
    const next = new URLSearchParams();
    if (clubId) next.set("club", clubId);
    if (clubId && tab !== "overview") next.set("tab", tab);
    history.replaceState(null, "", `/club${next.toString() ? `?${next}` : ""}`);
  }
  const club = selected ? data?.items.find(item => item.id === selected) : undefined;
  // A club can leave the list while it is open — it was archived, or its membership ended.
  // Fall back to the directory instead of keeping a selection the list no longer carries.
  useEffect(() => {
    if (selected && data && !data.items.some(item => item.id === selected)) select(null);
  }, [data, selected]);
  if (club) {
    return <Workspace key={club.id} clubs={data!.items} club={club} timezone={timezone} onExpired={onExpired}
      select={select} refresh={() => setRevision(value => value + 1)} />;
  }
  return <Directory data={data} error={error} retry={retry} q={q} setQ={setQ} archived={archived} setArchived={setArchived}
    canAdmin={data?.items.some(item => item.canAdmin) ?? false} onExpired={onExpired}
    saved={() => setRevision(value => value + 1)} select={select} />;
}

// The directory lists every club the actor may open as a card, the same shape the course
// list uses, so a santri recognises it immediately.
function Directory({ data, error, retry, q, setQ, archived, setArchived, canAdmin, onExpired, saved, select }: {
  data: Page<ClubSummary> | null; error: string; retry: () => void; q: string; setQ: (value: string) => void;
  archived: boolean; setArchived: (value: boolean) => void; canAdmin: boolean; onExpired: () => void;
  saved: () => void; select: (clubId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  return <>
    <PageHeader title="Club" description="Ruang klub santri yang menyatukan materi, challenge, proyek, pertemuan, dan progres dalam satu alur."
      actions={canAdmin ? <Button className="button-secondary" aria-expanded={creating} onClick={() => setCreating(value => !value)}>
        {creating ? "Tutup formulir" : "Klub baru"}</Button> : undefined} />
    {creating && canAdmin && <ClubCreateForm onExpired={onExpired} saved={() => { setCreating(false); saved(); }} />}
    <Card>
      <div className="card-heading"><h2>Daftar klub</h2>
        <div className="learning-actions">
          {canAdmin && <label className="submission-confirm"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Tampilkan arsip</label>}
          <Search change={setQ} />
        </div>
      </div>
      {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
        ? <EmptyState icon="club" title="Belum ada klub untuk Anda"
            description={q ? "Tidak ada klub yang sesuai pencarian." : "Klub tampil setelah mentor menambahkan Anda sebagai anggota dan klub dipublikasikan."} />
        : <div className="course-grid">{data.items.map(item =>
          <button type="button" className="course-tile club-tile" key={item.id} onClick={() => select(item.id)}>
            <div className="learning-row"><span className="course-avatar" aria-hidden="true">{initials(item.name)}</span>
              <span className="badge-group">
                {item.archived && <span className="badge badge-danger">Arsip</span>}
                {!item.published && <span className="badge badge-draft">Draft</span>}
                {item.membership && <span className={`badge ${item.membership === "mentor" ? "badge-discovery" : "badge-success"}`}>{clubRoleLabels[item.membership]}</span>}
              </span>
            </div>
            <h3>{item.name}</h3><p>{item.tagline || "Belum ada tagline."}</p>
            <p className="club-tile-meta">{item.mentors} mentor · {item.members} anggota · {item.courses} course</p>
            <span className="course-open">{item.canManage ? "Kelola klub" : "Masuk klub"}<Icon name="arrowRight" /></span>
          </button>)}</div>}
    </Card>
  </>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "K";
}

// Only an administrator reaches this form; a mentor edits the club they lead from its own
// workspace. The slug is optional and derived from the name when left empty.
function ClubCreateForm({ onExpired, saved }: { onExpired: () => void; saved: () => void }) {
  return <Card className="admin-form-card">
    <div className="card-heading"><h2>Klub baru</h2></div>
    <p className="card-hint">Klub baru dibuat sebagai draft. Isi profil, tautkan course, tambahkan mentor, lalu publikasikan dari ruang klub. Slug opsional dan dibuat otomatis dari nama klub.</p>
    <MutationForm path={clubApi} label="Buat klub" onExpired={onExpired} saved={saved}
      body={form => ({ name: form.get("name"), slug: form.get("slug"), tagline: form.get("tagline"),
        purpose: form.get("purpose"), direction: form.get("direction"), program: form.get("program") })}>
      <Field label="Nama klub" name="name" max={100} />
      <Field label="Slug" name="slug" max={40} required={false} />
      <Field label="Tagline" name="tagline" max={200} required={false} />
      <Field label="Tujuan klub" name="purpose" area max={4000} required={false} />
      <Field label="Arah belajar" name="direction" area max={4000} required={false} />
      <Field label="Program berjalan" name="program" area max={4000} required={false} />
    </MutationForm>
  </Card>;
}

function Workspace({ clubs, club, timezone, onExpired, select, refresh }: Omit<Common, "actor"> & {
  clubs: ClubSummary[]; club: ClubSummary; select: (clubId: string | null, tab?: Tab) => void; refresh: () => void;
}) {
  const requestedTab = new URLSearchParams(location.search).get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(requestedTab && requestedTab in tabLabels ? requestedTab : "overview");
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<ClubDetail>(`${clubApi}/${club.id}`, onExpired, revision);
  function go(next: Tab) {
    setTab(next);
    select(club.id, next);
  }
  const saved = () => { setRevision(value => value + 1); refresh(); };
  return <>
    <PageHeader title={data?.name ?? club.name} description={data?.tagline ?? club.tagline}
      actions={<div className="card-tools">
        <Button className="button-secondary" onClick={() => select(null)}>Semua klub</Button>
        {clubs.length > 1 && <label className="club-switch"><span className="visually-hidden">Pilih klub</span>
          <select className="input filter-select" value={club.id} onChange={event => select(event.target.value)}>
            {clubs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>}
      </div>} />
    <nav className="tabs" aria-label="Halaman klub">{(Object.keys(tabLabels) as Tab[]).map(key =>
      <button key={key} className={tab === key ? "tab-active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => go(key)}>{tabLabels[key]}</button>)}</nav>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState />
      : tab === "overview" ? <Overview club={data} onExpired={onExpired} saved={saved} />
      : tab === "learning" ? <Learning club={data} onExpired={onExpired} />
      : tab === "sessions" ? <Sessions club={data} timezone={timezone} onExpired={onExpired} />
      : tab === "challenges" ? <Challenges club={data} timezone={timezone} onExpired={onExpired} />
      : tab === "projects" ? <Projects club={data} timezone={timezone} onExpired={onExpired} />
      : tab === "members" ? <Members club={data} onExpired={onExpired} saved={saved} />
      : <Progress club={data} onExpired={onExpired} />}
    {data?.archived && <p className="club-note">Klub diarsipkan: isinya hanya dapat dibaca sampai administrator memulihkannya.</p>}
    {data && !data.published && !data.archived && <p className="club-note">Klub masih draft: hanya mentor yang dapat membukanya.</p>}
  </>;
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: "book" | "board" | "star" | "attendance"; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`} aria-hidden="true"><Icon name={icon} size={20} /></span>
    <div><p className="summary-label">{label}</p><p className="summary-value">{value}</p></div></article>;
}

function Overview({ club, onExpired, saved }: { club: ClubDetail; onExpired: () => void; saved: () => void }) {
  const [editing, setEditing] = useState(false);
  return <>
    <div className="summary-grid">
      <Stat label="Materi pembelajaran" value={club.stats.lessons} icon="book" tone="stat-blue" />
      <Stat label="Challenge" value={club.stats.challenges} icon="board" tone="stat-purple" />
      <Stat label="Proyek disetujui" value={club.stats.approvedProjects} icon="star" tone="stat-gold" />
      <Stat label="Pertemuan" value={club.stats.sessions} icon="attendance" tone="stat-blue" />
    </div>
    <Card>
      <div className="card-heading"><h2>Tentang klub</h2>{(club.canManage || club.canAdmin) && <Button className="button-secondary button-small" aria-expanded={editing} onClick={() => setEditing(value => !value)}>{editing ? "Tutup editor" : "Kelola klub"}</Button>}</div>
      <div className="club-body">
        <p className="learning-prose">{club.purpose || "Mentor belum mengisi tujuan klub."}</p>
        <h3 className="club-subhead">Arah belajar</h3>
        <p className="learning-prose">{club.direction || "Belum diisi."}</p>
        <ol className="club-flow">{clubFlow.map(step => <li key={step} className="club-flow-step">{step}</li>)}</ol>
        <h3 className="club-subhead">Program berjalan</h3>
        <p className="learning-prose">{club.program || "Belum diisi."}</p>
        <h3 className="club-subhead">Mentor</h3>
        {club.mentorList.length ? <ul className="member-list">{club.mentorList.map(mentor =>
          <li key={mentor.userId}><span className="avatar-small" aria-hidden="true">{mentor.name.slice(0, 1)}</span>{mentor.name}</li>)}</ul>
          : <p className="learning-muted">Belum ada mentor aktif.</p>}
        <p className="learning-muted">{club.mentors} mentor · {club.members} anggota · {club.courses} course tertaut · {club.stats.xp} XP klub</p>
      </div>
    </Card>
    <Card>
      <div className="card-heading"><h2>Tujuan klub</h2></div>
      {club.goals.length ? <ul className="club-goals">{club.goals.map(goal => <li className="club-goal" key={goal.position}>
        <span className="club-goal-mark" aria-hidden="true">{goal.position}</span>
        <div><h3>{goal.title}</h3>{goal.description && <p>{goal.description}</p>}</div>
      </li>)}</ul> : <EmptyState icon="star" title="Belum ada tujuan" description="Mentor dapat menuliskan tujuan klub dari panel kelola." />}
    </Card>
    {editing && (club.canManage || club.canAdmin) && <ClubEditor club={club} onExpired={onExpired} saved={saved} />}
  </>;
}

// An archived club is read-only, so only its restore control is offered until it is back.
function ClubEditor({ club, onExpired, saved }: { club: ClubDetail; onExpired: () => void; saved: () => void }) {
  const goalText = club.goals.map(goal => `${goal.title}${goal.description ? ` | ${goal.description}` : ""}`).join("\n");
  if (club.archived) {
    return <Card className="admin-form-card">
      <div className="card-heading"><h2>Arsip klub</h2></div>
      <p className="card-hint">Klub ini diarsipkan. Pulihkan klub terlebih dahulu untuk mengubah profil, tujuan, anggota, atau course.</p>
      <MutationForm path={`${clubApi}/${club.id}/archive`} label="Pulihkan klub" onExpired={onExpired} saved={saved} body={() => ({ archived: false })} />
    </Card>;
  }
  return <>
    <Card className="admin-form-card">
      <div className="card-heading"><h2>Profil klub</h2></div>
      <MutationForm path={`${clubApi}/${club.id}`} method="PATCH" label="Simpan profil" onExpired={onExpired} saved={saved}
        body={form => ({ name: form.get("name"), tagline: form.get("tagline"), purpose: form.get("purpose"), direction: form.get("direction"), program: form.get("program") })}>
        <Field label="Nama klub" name="name" value={club.name} max={100} />
        <Field label="Tagline" name="tagline" value={club.tagline} max={200} required={false} />
        <Field label="Tujuan klub" name="purpose" value={club.purpose} area max={4000} required={false} />
        <Field label="Arah belajar" name="direction" value={club.direction} area max={4000} required={false} />
        <Field label="Program berjalan" name="program" value={club.program} area max={4000} required={false} />
      </MutationForm>
    </Card>
    <Card className="admin-form-card">
      <div className="card-heading"><h2>Tujuan klub</h2></div>
      <p className="card-hint">Satu tujuan per baris, format: Judul | Keterangan. Maksimal {maxClubGoals} tujuan.</p>
      <MutationForm path={`${clubApi}/${club.id}/goals`} label="Simpan tujuan" onExpired={onExpired} saved={saved}
        body={form => ({ goals: String(form.get("goals") ?? "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
          const [title, ...rest] = line.split("|");
          return { title: (title ?? "").trim(), description: rest.join("|").trim() };
        }) })}>
        <Field label="Daftar tujuan" name="goals" value={goalText} area max={12000} required={false} />
      </MutationForm>
    </Card>
    <Card className="admin-form-card">
      <div className="card-heading"><h2>Publikasi</h2></div>
      <p className="card-hint">Klub draft hanya terlihat oleh mentor. Publikasikan agar anggota dapat membukanya.</p>
      <MutationForm path={`${clubApi}/${club.id}/publish`} label={club.published ? "Jadikan draft" : "Publikasikan klub"}
        onExpired={onExpired} saved={saved} body={() => ({ published: !club.published })} />
    </Card>
    {club.canAdmin && <Card className="admin-form-card">
      <div className="card-heading"><h2>Arsip klub</h2></div>
      <p className="card-hint">Klub arsip hilang dari daftar klub anggota dan tidak dapat diubah, tetapi anggota, course, dan riwayatnya tetap tersimpan. Hanya administrator yang dapat mengarsipkan atau memulihkan klub.</p>
      <MutationForm path={`${clubApi}/${club.id}/archive`} label={club.archived ? "Pulihkan klub" : "Arsipkan klub"}
        onExpired={onExpired} saved={saved} body={() => ({ archived: !club.archived })} />
    </Card>}
  </>;
}

function Learning({ club, onExpired }: { club: ClubDetail; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<Page<ClubCourseRow>>(`${clubApi}/${club.id}/courses?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired, revision);
  return <>
    <Card>
      <div className="card-heading"><h2>Course klub</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
      <p className="card-hint">Pembelajaran klub memakai course, modul, dan lesson yang sudah ada di {"Pembelajaran"}.</p>
      {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
        ? <EmptyState icon="book" title="Belum ada course klub" description={q ? "Tidak ada course yang sesuai pencarian." : "Mentor menautkan course yang ia ampu agar materinya tampil di sini."} />
        : <div className="table-scroll" tabIndex={0} role="region" aria-label="Course klub"><table className="data-table">
          <thead><tr><th scope="col">Course</th><th scope="col">Kelas</th><th scope="col">Lesson</th><th scope="col">Aktivitas</th><th scope="col">Challenge</th>{club.canManage && <th scope="col">Aksi</th>}</tr></thead>
          <tbody>{data.items.map(row => <tr key={row.id}>
            <td><a className="table-link" href={`/learning/courses/${row.id}`}><strong>{row.name}</strong></a><small className="table-sub">{row.term} · {row.year}</small></td>
            <td>{row.className}</td><td>{row.lessons}</td><td>{row.activities}</td><td>{row.challenges}</td>
            {club.canManage && <td className="table-action">{row.canManage
              ? <LinkCourse club={club} courseId={row.id} linked onExpired={onExpired} saved={() => setRevision(value => value + 1)} />
              : <span className="learning-muted">—</span>}</td>}
          </tr>)}</tbody></table></div>}
      {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
    </Card>
    {club.canManage && <CourseLinker club={club} onExpired={onExpired} saved={() => setRevision(value => value + 1)} />}
  </>;
}

function LinkCourse({ club, courseId, linked, onExpired, saved }: { club: ClubDetail; courseId: string; linked: boolean; onExpired: () => void; saved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (pending) return;
    setPending(true); setError("");
    try {
      await api(`${clubApi}/${club.id}/courses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, linked: !linked }) });
      saved();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <>{error && <ErrorState message={error} />}
    <Button className="button-secondary button-small" disabled={pending} onClick={() => void submit()}>{pending ? "Menyimpan…" : linked ? "Lepas" : "Tautkan"}</Button></>;
}

function CourseLinker({ club, onExpired, saved }: { club: ClubDetail; onExpired: () => void; saved: () => void }) {
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<LearningCourse>>(`${learningApi}?${new URLSearchParams({ q, offset: "0" })}`, onExpired);
  const options = data?.items.filter(course => course.canManage) ?? [];
  return <Card className="admin-form-card">
    <div className="card-heading"><h2>Tautkan course</h2><Search change={setQ} /></div>
    <p className="card-hint">Hanya course yang Anda ampu yang dapat ditautkan; izin course tetap mengikuti penugasan mengajar.</p>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !options.length
      ? <EmptyState icon="book" title="Tidak ada course" description="Cari course yang Anda ampu untuk ditautkan ke klub." />
      : <ul className="member-picker">{options.map(course => <li key={course.id}>
        <span>{course.name}<small className="table-sub">{course.className} · {course.term}</small></span>
        <LinkCourse club={club} courseId={course.id} linked={false} onExpired={onExpired} saved={saved} />
      </li>)}</ul>}
  </Card>;
}

function Sessions({ club, timezone, onExpired }: { club: ClubDetail; timezone: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<ClubMeetingRow>>(`${clubApi}/${club.id}/meetings?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <Card>
    <div className="card-heading"><h2>Pertemuan klub</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
    <p className="card-hint">Pertemuan memakai sesi kehadiran course klub; presensi tetap dikelola di halaman Kehadiran.</p>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="attendance" title="Belum ada pertemuan" description={q ? "Tidak ada pertemuan yang sesuai pencarian." : "Sesi kehadiran pada course klub akan tampil di sini."} />
      : <div className="table-scroll" tabIndex={0} role="region" aria-label="Pertemuan klub"><table className="data-table">
        <thead><tr><th scope="col">Pertemuan</th><th scope="col">Course</th><th scope="col">Mulai</th><th scope="col">Status</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}>
          <td><a className="table-link" href={`/attendance/courses/${row.courseId}/sessions/${row.id}`}><strong>{row.title}</strong></a></td>
          <td>{row.courseName}</td><td>{formatDateTime(row.startsAt, timezone)}</td>
          <td><span className={`badge ${row.status === "open" ? "badge-success" : row.status === "cancelled" ? "badge-danger" : "badge-draft"}`}>{sessionLabels[row.status]}</span></td>
        </tr>)}</tbody></table></div>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card>;
}

function Challenges({ club, timezone, onExpired }: { club: ClubDetail; timezone: string; onExpired: () => void }) {
  const { data, error, retry } = useData<Page<ClubChallengeRow>>(`${clubApi}/${club.id}/challenges`, onExpired);
  return <Card>
    <div className="card-heading"><h2>Challenge klub</h2></div>
    <p className="card-hint">Challenge dibuat di lesson course klub dan dikerjakan dengan papan proyek yang sudah ada.</p>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="board" title="Belum ada challenge" description="Mentor membuat challenge dari lesson course klub." />
      : <ul className="club-list">{data.items.map(row => <li className="task-item" key={row.id}>
        <span className="task-icon task-challenge" aria-hidden="true"><Icon name="board" size={18} /></span>
        <div className="task-body"><strong>{row.title}</strong>
          <small>{row.courseName} · {row.teamMode === "team" ? `Tim maks. ${row.maxTeamSize}` : "Individu"}{row.dueAt ? ` · Tenggat ${formatDateTime(row.dueAt, timezone)}` : ""}</small></div>
        <span className="badge-group">
          {club.canManage && <span className="badge badge-draft">{row.projectCount} proyek</span>}
          {row.myProjectId ? <a className="material-link" href={`/projects/${row.myProjectId}`}>Buka proyek<Icon name="arrowRight" /></a>
            : <a className="material-link" href={`/learning/courses/${row.courseId}`}>Buka lesson<Icon name="arrowRight" /></a>}
        </span>
      </li>)}</ul>}
  </Card>;
}

function Projects({ club, timezone, onExpired }: { club: ClubDetail; timezone: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<ProjectRow>>(`${clubApi}/${club.id}/projects?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <Card>
    <div className="card-heading"><h2>Proyek klub</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="board" title="Belum ada proyek" description={q ? "Tidak ada proyek yang sesuai pencarian." : "Proyek tampil setelah anggota memulai challenge klub."} />
      : <div className="table-scroll" tabIndex={0} role="region" aria-label="Proyek klub"><table className="data-table">
        <thead><tr><th scope="col">Proyek</th><th scope="col">Course</th><th scope="col">Progres board</th><th scope="col">Status</th><th scope="col">Diperbarui</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}>
          <td><a className="table-link" href={`/projects/${row.id}`}><strong>{row.title}</strong></a><small className="table-sub">{row.challengeTitle}</small></td>
          <td>{row.courseName}<small className="table-sub">{row.className}</small></td>
          <td><span className="board-progress"><progress max={row.taskCount || 1} value={row.doneCount} aria-hidden="true" /><span>{row.doneCount}/{row.taskCount} selesai</span></span></td>
          <td><span className="badge-group"><ProjectStatusBadge status={row.status} />{row.showcased && <span className="badge badge-gold">Showcase</span>}</span></td>
          <td>{formatDateTime(row.updatedAt, timezone)}</td>
        </tr>)}</tbody></table></div>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card>;
}

function Members({ club, onExpired, saved }: { club: ClubDetail; onExpired: () => void; saved: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<Page<ClubPerson>>(`${clubApi}/${club.id}/members?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired, revision);
  const refresh = () => { setRevision(value => value + 1); saved(); };
  return <>
    <Card>
      <div className="card-heading"><h2>Anggota klub</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
      <p className="card-hint">Keanggotaan memakai akun SALAAM yang sudah ada; peran mentor mengikuti izin guru.</p>
      {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
        ? <EmptyState icon="users" title="Belum ada anggota" description={q ? "Tidak ada anggota yang sesuai pencarian." : "Mentor menambahkan anggota dari santri course klub."} />
        : <ul className="member-list club-members">{data.items.map(person => <li key={person.userId}>
          <span className="avatar-small" aria-hidden="true">{person.name.slice(0, 1)}</span>
          <span className="club-member-name">{person.name}</span>
          <span className={`badge ${person.role === "mentor" ? "badge-discovery" : "badge-draft"}`}>{clubRoleLabels[person.role]}</span>
          {club.canManage && <MemberAction club={club} userId={person.userId} role={person.role} removed onExpired={onExpired} saved={refresh} />}
        </li>)}</ul>}
      {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
    </Card>
    {club.canManage && <Candidates club={club} onExpired={onExpired} saved={refresh} />}
  </>;
}

function MemberAction({ club, userId, role, removed, onExpired, saved }: { club: ClubDetail; userId: string; role: ClubRole; removed: boolean; onExpired: () => void; saved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (pending) return;
    setPending(true); setError("");
    try {
      await api(`${clubApi}/${club.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role, removed }) });
      saved();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <>{error && <ErrorState message={error} />}
    <Button className="button-secondary button-small" disabled={pending} onClick={() => void submit()}>
      {pending ? "Menyimpan…" : removed ? "Keluarkan" : `Tambah sebagai ${clubRoleLabels[role].toLowerCase()}`}</Button></>;
}

function Candidates({ club, onExpired, saved }: { club: ClubDetail; onExpired: () => void; saved: () => void }) {
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<{ userId: string; name: string; role: ClubRole }>>(`${clubApi}/${club.id}/candidates?${new URLSearchParams({ q, offset: "0" })}`, onExpired);
  return <Card className="admin-form-card">
    <div className="card-heading"><h2>Tambah anggota</h2><Search change={setQ} /></div>
    <p className="card-hint">Kandidat diambil dari santri dan guru pada course yang tertaut ke klub.</p>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="users" title="Tidak ada kandidat" description={q ? "Tidak ada kandidat yang sesuai pencarian." : "Semua santri dan guru course klub sudah menjadi anggota, atau belum ada course yang tertaut."} />
      : <ul className="member-picker">{data.items.map(person => <li key={person.userId}>
        <span>{person.name}<small className="table-sub">{clubRoleLabels[person.role]}</small></span>
        <MemberAction club={club} userId={person.userId} role={person.role} removed={false} onExpired={onExpired} saved={saved} />
      </li>)}</ul>}
  </Card>;
}

function Progress({ club, onExpired }: { club: ClubDetail; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<ClubProgressRow>>(`${clubApi}/${club.id}/progress?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <Card>
    <div className="card-heading"><h2>Progres anggota</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
    <p className="card-hint">Angka berasal dari XP, badge, dan penyelesaian yang sudah dicatat modul Pertumbuhan.</p>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="star" title="Belum ada progres" description={q ? "Tidak ada anggota yang sesuai pencarian." : "Progres tampil setelah anggota menyelesaikan materi klub."} />
      : <div className="table-scroll" tabIndex={0} role="region" aria-label="Progres anggota klub"><table className="data-table">
        <thead><tr><th scope="col">Anggota</th><th scope="col">Level</th><th scope="col">XP</th><th scope="col">Badge</th><th scope="col">Lesson selesai</th><th scope="col">Proyek disetujui</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.studentId}>
          <td><strong>{row.studentName}</strong></td><td>{row.level}</td><td>{row.xp}</td><td>{row.badges}</td>
          <td>{row.lessonsCompleted}</td><td>{row.projectsApproved}</td>
        </tr>)}</tbody></table></div>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card>;
}
