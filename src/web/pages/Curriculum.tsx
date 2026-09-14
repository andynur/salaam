import { useMemo, useState } from "react";
import { curriculumAvailable, groupPhases, isMilestone, searchCurriculum, type CurriculumDetail, type CurriculumGradeSummary, type CurriculumOverview, type CurriculumSemester, type CurriculumWeek } from "../../shared/curriculum";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Field, MutationForm, useData } from "../components/learning";
import { Icon, type IconName } from "../components/icons";

const curriculumApi = "/api/curriculum";
const lines = (value: FormDataEntryValue | null) => String(value ?? "").split("\n").map(line => line.trim()).filter(Boolean);
const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const isLink = (source: string) => /^https?:\/\//i.test(source);
const weekRange = (weeks: CurriculumWeek[]) => weeks.length === 1 ? `Pekan ${weeks[0]!.week}` : `Pekan ${weeks[0]!.week}–${weeks.at(-1)!.week}`;
type Changed = (message: string) => void;

export function Curriculum({ onExpired }: { onExpired: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<CurriculumOverview>(curriculumApi, onExpired, revision);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get("grade"));
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const changed: Changed = message => { setNotice(message); setRevision(value => value + 1); };
  const header = <PageHeader title="Kurikulum" description="Peta belajar pekanan santri dari kelas X sampai XII: fase, tujuan, materi, praktik, dan asesmen."
    actions={data?.canManage && <Button className="button-secondary" aria-expanded={importing} aria-controls="curriculum-import" onClick={() => { setImporting(value => !value); setNotice(""); }}><Icon name="plus" />Import CSV</Button>} />;
  if (error) return <>{header}<ErrorState message={error} retry={retry} /></>;
  if (!data) return <>{header}<LoadingState /></>;
  const current = data.grades.find(grade => grade.grade === selected) ?? data.grades.find(curriculumAvailable) ?? data.grades[0];
  function choose(grade: string) { setSelected(grade); setNotice(""); history.replaceState(null, "", `/curriculum?grade=${grade}`); }
  return <>
    {header}
    {importing && <div id="curriculum-import"><Card className="admin-form-card">
      <h2>Import kurikulum dari CSV</h2>
      <p className="curriculum-help">Kolom: grade, semester, phase, week, title, objectives, content, practice, assessment, source. Pisahkan butir materi dan asesmen dengan titik koma. Pekan yang sudah ada diperbarui, pekan baru ditambahkan, dan pekan yang tidak ada di berkas tetap tersimpan.</p>
      <MutationForm path={`${curriculumApi}/import`} label="Import" body={form => form} onExpired={onExpired} saved={() => { setImporting(false); changed("Kurikulum diperbarui dari CSV."); }}>
        <label className="learning-field field-wide"><span>Berkas CSV</span><input className="input" type="file" name="file" accept=".csv,text/csv" required /></label>
      </MutationForm>
    </Card></div>}
    {notice && <p className="success-state" role="status">{notice}</p>}
    {!current ? <Card><EmptyState icon="route" title="Belum ada kurikulum" description="Kurikulum sekolah belum disiapkan." /></Card> : <>
      <nav className="tabs" aria-label="Kelas">{data.grades.map(grade => {
        const active = grade.grade === current.grade;
        return <button key={grade.grade} type="button" className={`curriculum-tab ${active ? "tab-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => choose(grade.grade)}>
          Kelas {grade.grade}{!curriculumAvailable(grade) && <span className="badge badge-draft">Segera hadir</span>}
        </button>;
      })}</nav>
      <GradeView key={current.grade} summary={current} canManage={data.canManage} revision={revision} onExpired={onExpired} changed={changed} />
    </>}
  </>;
}

function GradeView({ summary, canManage, revision, onExpired, changed }: { summary: CurriculumGradeSummary; canManage: boolean; revision: number; onExpired: () => void; changed: Changed }) {
  const [managing, setManaging] = useState(false);
  if (!curriculumAvailable(summary) && !canManage) {
    return <Card><EmptyState icon="route" title={`Kurikulum Kelas ${summary.grade} segera hadir`} description={summary.goal || "Kurikulum kelas ini sedang disusun dan akan tampil setelah ditetapkan sekolah."} /></Card>;
  }
  const theme = (semester: CurriculumSemester) => summary.semesters.find(item => item.semester === semester)?.theme ?? "";
  const panel = `curriculum-manage-${summary.grade}`;
  return <>
    <Card className={`curriculum-intro grade-accent-${summary.grade.toLowerCase()}`}>
      <div className="curriculum-intro-main">
        <div>
          <span className="badge curriculum-grade-label">Kelas {summary.grade}</span>
          <h2>{summary.program}</h2>
          {summary.goal && <p>{summary.goal}</p>}
        </div>
        {canManage && <Button className="button-secondary button-small" aria-expanded={managing} aria-controls={panel} onClick={() => setManaging(value => !value)}><Icon name="edit" />{managing ? "Tutup" : "Kelola kelas"}</Button>}
      </div>
      <div className="curriculum-intro-meta">
        {summary.published ? <span className="badge badge-success">Terbit</span> : <span className="badge badge-draft">Belum terbit</span>}
        {summary.semesters.filter(item => item.theme).map(item => <span key={item.semester} className="curriculum-semester-meta">Semester {item.semester} · {item.theme}</span>)}
      </div>
    </Card>
    {managing && <div id={panel}><Card className="admin-form-card">
      <h2>Kelola Kelas {summary.grade}</h2>
      <MutationForm path={`${curriculumApi}/grades/${summary.grade}`} method="PATCH" label="Simpan kelas" onExpired={onExpired}
        saved={() => { setManaging(false); changed(`Kelas ${summary.grade} diperbarui.`); }}
        body={form => ({ version: summary.version, program: text(form, "program"), goal: text(form, "goal"), themes: [text(form, "theme1"), text(form, "theme2")], published: form.get("published") === "on" })}>
        <Field label="Nama program" name="program" value={summary.program} max={100} />
        <label className="calendar-preference"><input type="checkbox" name="published" defaultChecked={summary.published} />Terbitkan untuk semua pengguna</label>
        <Field label="Tema semester 1" name="theme1" value={theme(1)} required={false} max={150} />
        <Field label="Tema semester 2" name="theme2" value={theme(2)} required={false} max={150} />
        <Field label="Target kelas" name="goal" value={summary.goal} area required={false} max={1000} />
      </MutationForm>
    </Card></div>}
    {!summary.published && <p className="info-state">Kurikulum ini belum terbit. Santri dan guru melihatnya sebagai Segera hadir.</p>}
    <WeekMap summary={summary} canManage={canManage} revision={revision} onExpired={onExpired} changed={changed} />
  </>;
}

function WeekMap({ summary, canManage, revision, onExpired, changed }: { summary: CurriculumGradeSummary; canManage: boolean; revision: number; onExpired: () => void; changed: Changed }) {
  const { data, error, retry } = useData<CurriculumDetail>(`${curriculumApi}/grades/${summary.grade}`, onExpired, revision);
  const [semester, setSemester] = useState("");
  const [phase, setPhase] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const weeks = data?.weeks;
  const visible = useMemo(() => searchCurriculum((weeks ?? []).filter(week => (!semester || String(week.semester) === semester) && (!phase || week.phase === phase)), query), [weeks, semester, phase, query]);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data || !weeks) return <LoadingState />;
  if (!weeks.length) return <Card><EmptyState icon="route" title="Belum ada pekan kurikulum" description={canManage ? "Import curriculum.csv untuk mengisi kurikulum kelas ini." : "Kurikulum kelas ini belum diisi."} /></Card>;
  const phaseOptions = [...new Set(weeks.filter(week => !semester || String(week.semester) === semester).map(week => week.phase))];
  const filtered = Boolean(semester || phase || query.trim());
  const allOpen = visible.length > 0 && visible.every(week => open.has(week.id));
  const reset = () => { setSemester(""); setPhase(""); setQuery(""); };
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const stats: { icon: IconName; tone: string; label: string; value: number; hint: string }[] = [
    { icon: "calendar", tone: "stat-blue", label: "Pekan belajar", value: data.grade.weeks, hint: data.grade.semesters.filter(item => item.weeks).map(item => `Semester ${item.semester}: ${item.weeks} pekan`).join(" · ") },
    { icon: "layers", tone: "stat-purple", label: "Fase", value: data.grade.phases, hint: "Kelompok kompetensi yang ditempuh berurutan." },
    { icon: "star", tone: "stat-gold", label: "Milestone", value: weeks.filter(isMilestone).length, hint: "Pekan penutup fase: milestone, proyek, SKL, atau demo." },
  ];
  return <>
    <div className="summary-grid">{stats.map(stat => <Card className="stat-card" key={stat.label}>
      <span className={`stat-icon ${stat.tone}`} aria-hidden="true"><Icon name={stat.icon} size={20} /></span>
      <div><span className="summary-label">{stat.label}</span><strong className="summary-value">{stat.value}</strong><p>{stat.hint}</p></div>
    </Card>)}</div>
    <Card className="report-filter-card"><div className="filter-bar report-filters">
      <label className="report-filter"><span>Semester</span>
        <select className="input filter-select" value={semester} onChange={event => { setSemester(event.target.value); setPhase(""); }}>
          <option value="">Semua semester</option>
          {data.grade.semesters.filter(item => item.weeks).map(item => <option key={item.semester} value={item.semester}>Semester {item.semester}</option>)}
        </select></label>
      <label className="report-filter"><span>Fase</span>
        <select className="input filter-select" value={phase} onChange={event => setPhase(event.target.value)}>
          <option value="">Semua fase</option>
          {phaseOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select></label>
      <label className="report-filter curriculum-search"><span>Cari pekan</span>
        <input className="input" type="search" value={query} maxLength={100} placeholder="Judul, materi, atau asesmen" onChange={event => setQuery(event.target.value)} /></label>
      <Button className="button-secondary button-small" disabled={!visible.length} onClick={() => setOpen(allOpen ? new Set() : new Set(visible.map(week => week.id)))}>{allOpen ? "Tutup semua" : "Buka semua"}</Button>
      <Button className="button-secondary button-small" disabled={!filtered} onClick={reset}>Atur ulang</Button>
    </div></Card>
    <p className="visually-hidden" role="status">{filtered ? `${visible.length} pekan cocok` : ""}</p>
    {!visible.length
      ? <Card><EmptyState icon="search" title="Tidak ada pekan yang cocok" description="Ubah kata kunci atau filter semester dan fase." action={<Button className="button-secondary" onClick={reset}>Atur ulang filter</Button>} /></Card>
      : ([1, 2] as const).map(number => {
        const semesterWeeks = visible.filter(week => week.semester === number);
        if (!semesterWeeks.length) return null;
        const info = data.grade.semesters.find(item => item.semester === number);
        return <Card className="curriculum-semester" key={number}>
          <div className="card-heading">
            <div className="curriculum-semester-title"><h2>Semester {number}</h2>{info?.theme && <span>{info.theme}</span>}</div>
            <span className="badge badge-draft">{filtered ? `${semesterWeeks.length} dari ${info?.weeks ?? 0}` : info?.weeks ?? 0} pekan</span>
          </div>
          <ol className="curriculum-phases" aria-label={`Alur fase semester ${number}`}>{groupPhases(weeks.filter(week => week.semester === number)).map(group =>
            <li key={group.name}><button type="button" className="curriculum-phase-chip" aria-pressed={phase === group.name}
              onClick={() => { if (phase === group.name) setPhase(""); else { setSemester(String(number)); setPhase(group.name); } }}>
              {group.name}<span>{weekRange(group.weeks)}</span>
            </button></li>)}
          </ol>
          {groupPhases(semesterWeeks).map((group, index) => <section className="curriculum-phase" key={`${group.name}-${index}`} aria-label={group.name}>
            <div className="curriculum-phase-heading"><h3>{group.name}</h3><span>{weekRange(group.weeks)} · {group.weeks.length} pekan</span></div>
            <ul className="curriculum-weeks">{group.weeks.map(week => <WeekRow key={week.id} week={week} open={open.has(week.id)} toggle={() => toggle(week.id)} canManage={canManage} onExpired={onExpired} changed={changed} />)}</ul>
          </section>)}
        </Card>;
      })}
  </>;
}

function Chips({ items }: { items: string[] }) {
  return items.length ? <ul className="curriculum-chips">{items.map((item, index) => <li key={`${item}-${index}`} className="curriculum-chip">{item}</li>)}</ul> : <>—</>;
}

function WeekRow({ week, open, toggle, canManage, onExpired, changed }: { week: CurriculumWeek; open: boolean; toggle: () => void; canManage: boolean; onExpired: () => void; changed: Changed }) {
  const [editing, setEditing] = useState(false);
  const milestone = isMilestone(week);
  const panel = `curriculum-week-${week.id}`;
  return <li className={`curriculum-week ${open ? "is-open" : ""} ${milestone ? "is-milestone" : ""}`}>
    <button type="button" className="curriculum-week-toggle" aria-expanded={open} aria-controls={panel} onClick={toggle}>
      <span className="curriculum-week-number" aria-hidden="true">{week.week}</span>
      <span className="task-body"><strong><span className="visually-hidden">Pekan {week.week}: </span>{week.title}</strong>{week.objective && <span className="task-meta">{week.objective}</span>}</span>
      {milestone && <span className="badge badge-gold">Milestone</span>}
      <Icon name="chevronRight" />
    </button>
    {open && <div className="curriculum-week-detail" id={panel}>
      <dl className="curriculum-facts">
        <dt>Fase</dt><dd>{week.phase} · Semester {week.semester}, pekan {week.week}</dd>
        <dt>Tujuan</dt><dd>{week.objective || "—"}</dd>
        <dt>Materi</dt><dd><Chips items={week.content} /></dd>
        <dt>Praktik</dt><dd>{week.practice || "—"}</dd>
        <dt>Asesmen</dt><dd><Chips items={week.assessment} /></dd>
        {week.source && <><dt>Sumber</dt><dd>{isLink(week.source) ? <a href={week.source} target="_blank" rel="noopener noreferrer">{week.source}</a> : week.source}</dd></>}
      </dl>
      {canManage && (editing
        ? <div className="curriculum-editor">
          <MutationForm path={`${curriculumApi}/weeks/${week.id}`} method="PATCH" label="Simpan pekan" onExpired={onExpired}
            saved={() => changed(`Pekan ${week.week} – ${week.title} diperbarui.`)}
            body={form => ({ version: week.version, phase: text(form, "phase"), title: text(form, "title"), objective: text(form, "objective"), content: lines(form.get("content")), practice: text(form, "practice"), assessment: lines(form.get("assessment")), source: text(form, "source") })}>
            <Field label="Fase" name="phase" value={week.phase} max={100} />
            <Field label="Judul pekan" name="title" value={week.title} max={150} />
            <Field label="Tujuan" name="objective" value={week.objective} area required={false} max={500} />
            <Field label="Materi, satu butir per baris" name="content" value={week.content.join("\n")} area required={false} max={2000} />
            <Field label="Praktik" name="practice" value={week.practice} required={false} max={300} />
            <Field label="Sumber" name="source" value={week.source} required={false} max={300} />
            <Field label="Asesmen, satu butir per baris" name="assessment" value={week.assessment.join("\n")} area required={false} max={2000} />
          </MutationForm>
          <Button className="button-secondary button-small" onClick={() => setEditing(false)}>Batal</Button>
        </div>
        : <div className="curriculum-week-actions"><Button className="button-secondary button-small" onClick={() => setEditing(true)}><Icon name="edit" />Ubah pekan</Button></div>)}
    </div>}
  </li>;
}
