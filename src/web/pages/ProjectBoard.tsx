import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { taskStatuses, type ProjectDetail, type ProjectTask, type ReviewDecision, type TaskStatus } from "../../shared/project";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon } from "../components/icons";
import { Field, errorMessage, formatDateTime } from "../components/learning";
import { AvatarStack, MemberPicker, ProjectStatusBadge, initials, jsonRequest, projectsApi, taskStatusLabels } from "../components/projects";

type Run = (path: string, body: unknown, done: string, method?: string) => Promise<boolean>;
type Common = { data: ProjectDetail; pending: boolean; run: Run; timezone: string; onExpired: () => void };

// Keeps the current board on screen while reloading, so moves never flash a spinner.
function useProject(projectId: string, onExpired: () => void) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const request = ++latest.current;
    try {
      const result = await api<ProjectDetail>(`${projectsApi}/${projectId}`);
      if (request === latest.current) { setData(result); setError(""); }
    } catch (cause) {
      if (request !== latest.current) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause));
    }
  }, [projectId, onExpired]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

export function ProjectDetailPage({ projectId, timezone, onExpired }: { projectId: string; timezone: string; onExpired: () => void }) {
  const { data, error, reload } = useProject(projectId, onExpired);
  const [tab, setTab] = useState(new URLSearchParams(location.search).get("tab") === "overview" ? "overview" : "board");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const saving = useRef(false);
  const run: Run = async (path, body, done, method = "POST") => {
    if (saving.current) return false;
    saving.current = true; setPending(true); setActionError(""); setNotice("");
    try {
      await api(`${projectsApi}/${projectId}${path ? `/${path}` : ""}`, jsonRequest(body, method));
      if (done) setNotice(done);
      await reload();
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else {
        setActionError(errorMessage(cause));
        // A conflict means someone else changed the project; show their version.
        if (cause instanceof ApiError && cause.status === 409) await reload();
      }
      return false;
    } finally { saving.current = false; setPending(false); }
  };
  const crumbs = [{ label: "Projects", href: "/projects" }];
  if (!data) return error ? <><PageHeader breadcrumbs={crumbs} title="Proyek" /><ErrorState message={error} retry={() => void reload()} /></> : <LoadingState />;
  const { project, course, challenge } = data;
  const done = data.tasks.filter(task => task.status === "done").length;
  const canSubmit = data.isMember && data.canEdit;
  const tabButton = (key: string, label: string) => <button className={tab === key ? "tab-active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>;
  return <>
    <PageHeader breadcrumbs={crumbs} title={project.title} description={`${course.name} · ${course.className} · ${challenge.title}`} actions={<>
      <ProjectStatusBadge status={project.status} />{project.showcasedAt && <span className="badge badge-gold">Showcase</span>}
      {canSubmit && <Button disabled={pending} onClick={() => { if (confirm("Kirim proyek untuk review? Board dan detail proyek terkunci sampai guru memberi keputusan.")) void run("submit", {}, "Proyek dikirim untuk review. Guru akan memberi keputusan."); }}>
        {project.status === "changes_requested" ? "Kirim ulang untuk review" : "Kirim untuk review"}</Button>}
    </>} />
    {notice && <p className="success-state" role="status">{notice}</p>}
    {(actionError || error) && <ErrorState message={actionError || error} />}
    {!data.canEdit && <p className="info-state">{project.status === "approved" ? "Proyek sudah disetujui. Board dan detail proyek kini hanya dapat dilihat." : "Proyek sedang direview guru. Board terbuka kembali jika guru meminta revisi."}</p>}
    {project.status === "changes_requested" && data.reviews[0] && <p className="info-state">Guru meminta revisi: {data.reviews[0].feedback}</p>}
    <div className="project-meta">
      <span><Icon name="calendar" />{challenge.dueAt ? `Tenggat ${formatDateTime(challenge.dueAt, timezone)}` : "Tanpa tenggat"}</span>
      <span><Icon name="users" />{challenge.teamMode === "team" ? `Tim ${data.members.length}/${challenge.maxTeamSize}` : "Individu"}</span>
      <AvatarStack members={data.members} names />
      <span><Icon name="check" />{done}/{data.tasks.length} kartu selesai</span>
    </div>
    <nav className="tabs" aria-label="Halaman proyek">{tabButton("board", "Board")}{tabButton("overview", `Ringkasan & review${data.reviews.length ? ` (${data.reviews.length})` : ""}`)}</nav>
    {tab === "board" ? <Board data={data} pending={pending} run={run} timezone={timezone} onExpired={onExpired} /> : <Overview data={data} pending={pending} run={run} timezone={timezone} onExpired={onExpired} />}
  </>;
}

function Board({ data, pending, run, timezone }: Common) {
  const [editing, setEditing] = useState("");
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  const [dragging, setDragging] = useState("");
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusTask, setFocusTask] = useState("");
  const editable = data.canEdit;
  const columns = taskStatuses.map(status => ({ status, tasks: data.tasks.filter(task => task.status === status).sort((a, b) => a.position - b.position) }));
  const selected = data.tasks.find(task => task.id === editing);
  // Moving re-parents the card, so keyboard focus returns to it after the board reloads.
  useEffect(() => {
    if (focusTask) document.querySelector<HTMLElement>(`[data-task-id="${focusTask}"] .board-card-title`)?.focus();
  }, [focusTask, data]);
  async function move(task: ProjectTask, status: TaskStatus, position: number) {
    if (await run(`tasks/${task.id}/move`, { status, position, version: task.version }, "")) {
      setAnnouncement(`${task.title} dipindahkan ke ${taskStatusLabels[status]}, urutan ${position + 1}.`);
      setFocusTask(task.id);
    }
  }
  // Positions are indexes in the target column without the moved card.
  function drop(event: DragEvent, status: TaskStatus, index: number) {
    event.preventDefault();
    const task = data.tasks.find(item => item.id === (event.dataTransfer.getData("text/plain") || dragging));
    setDragging(""); setDropTarget(null);
    if (!task) return;
    const position = task.status === status && task.position < index ? index - 1 : index;
    if (task.status !== status || task.position !== position) void move(task, status, position);
  }
  const dragOver = (event: DragEvent, status: TaskStatus) => { if (dragging) { event.preventDefault(); setDropTarget(status); } };
  return <>
    <p className="visually-hidden" role="status">{announcement}</p>
    {selected && <TaskEditor key={`${selected.id}-${selected.version}`} task={selected} data={data} pending={pending} run={run} timezone={timezone} close={() => setEditing("")} />}
    {editable && <p className="learning-muted board-hint">Seret kartu antarkolom, atau gunakan tombol panah pada kartu. Klik judul kartu untuk mengubah detail dan penanggung jawab.</p>}
    <div className="board" role="region" aria-label="Board Kanban" tabIndex={0}>
      {columns.map(({ status, tasks }, columnIndex) => {
        const previous = taskStatuses[columnIndex - 1];
        const next = taskStatuses[columnIndex + 1];
        return <section key={status} className={`board-column${dropTarget === status ? " is-drop-target" : ""}`} aria-labelledby={`board-${status}`}
          onDragOver={event => dragOver(event, status)} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }}
          onDrop={event => drop(event, status, tasks.length)}>
          <header className="board-column-header"><h2 id={`board-${status}`}>{taskStatusLabels[status]}</h2><span className="board-count">{tasks.length}<span className="visually-hidden"> kartu</span></span></header>
          <ul className="board-cards">{tasks.map((task, index) => <li key={task.id} data-task-id={task.id} className={`board-card${dragging === task.id ? " is-dragging" : ""}`} draggable={editable && !pending}
            onDragStart={event => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDragging(task.id); }}
            onDragEnd={() => { setDragging(""); setDropTarget(null); }}
            onDragOver={event => dragOver(event, status)} onDrop={event => { event.stopPropagation(); drop(event, status, index); }}>
            <button type="button" className="board-card-title" onClick={() => setEditing(task.id)}>{task.title}</button>
            {task.description && <p className="board-card-desc">{task.description}</p>}
            <div className="board-card-footer">
              {task.assigneeName ? <span className="board-assignee"><span className="avatar avatar-small" aria-hidden="true">{initials(task.assigneeName)}</span><span>{task.assigneeName}</span></span>
                : <span className="board-card-unassigned">Belum ditugaskan</span>}
              {editable && <span className="board-card-moves">
                {previous && <button type="button" className="icon-button icon-button-small" disabled={pending} aria-label={`Pindahkan ${task.title} ke ${taskStatusLabels[previous]}`} onClick={() => void move(task, previous, columns[columnIndex - 1]!.tasks.length)}><Icon name="chevronLeft" /></button>}
                {index > 0 && <button type="button" className="icon-button icon-button-small" disabled={pending} aria-label={`Naikkan ${task.title}`} onClick={() => void move(task, status, index - 1)}><Icon name="chevronUp" /></button>}
                {index < tasks.length - 1 && <button type="button" className="icon-button icon-button-small" disabled={pending} aria-label={`Turunkan ${task.title}`} onClick={() => void move(task, status, index + 1)}><Icon name="chevronDown" /></button>}
                {next && <button type="button" className="icon-button icon-button-small" disabled={pending} aria-label={`Pindahkan ${task.title} ke ${taskStatusLabels[next]}`} onClick={() => void move(task, next, columns[columnIndex + 1]!.tasks.length)}><Icon name="chevronRight" /></button>}
              </span>}
            </div>
          </li>)}</ul>
          {!tasks.length && <p className="board-empty">Belum ada kartu</p>}
          {editable && (adding === status
            ? <QuickAdd status={status} pending={pending} run={run} close={() => setAdding(null)} />
            : <button type="button" className="board-add" onClick={() => setAdding(status)}><Icon name="plus" />Buat kartu</button>)}
        </section>;
      })}
    </div>
  </>;
}

function QuickAdd({ status, pending, run, close }: { status: TaskStatus; pending: boolean; run: Run; close: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    if (await run("tasks", { title, status }, "")) { form.reset(); input.current?.focus(); }
  }
  return <form className="board-quick-add" onSubmit={event => void submit(event)}>
    <input ref={input} className="input" name="title" required maxLength={150} placeholder="Apa yang perlu dikerjakan?" aria-label={`Judul kartu baru di kolom ${taskStatusLabels[status]}`} onKeyDown={event => { if (event.key === "Escape") close(); }} />
    <div className="board-quick-actions"><Button type="submit" className="button-small" disabled={pending}>Tambah</Button><Button type="button" className="button-secondary button-small" onClick={close}>Batal</Button></div>
  </form>;
}

function TaskEditor({ task, data, pending, run, timezone, close }: { task: ProjectTask; data: ProjectDetail; pending: boolean; run: Run; timezone: string; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const editable = data.canEdit;
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "nearest" });
    panel.current?.querySelector<HTMLElement>(editable ? "input[name=title]" : "button")?.focus();
  }, [editable]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (await run(`tasks/${task.id}`, { title: form.get("title"), description: form.get("description"), assigneeId: form.get("assigneeId") || null, version: task.version }, "Kartu disimpan.", "PATCH")) close();
  }
  function archive() {
    if (confirm(`Arsipkan kartu "${task.title}"? Kartu tidak lagi tampil di board.`)) void run(`tasks/${task.id}/archive`, { archived: true, version: task.version }, "Kartu diarsipkan.").then(ok => { if (ok) close(); });
  }
  return <div ref={panel}><Card className="admin-form-card task-editor">
    <div className="learning-row"><h2>{editable ? "Edit kartu" : "Detail kartu"}</h2><Button className="button-secondary button-small" onClick={close}>Tutup</Button></div>
    <form className="learning-form" onSubmit={event => void save(event)}><fieldset className="admin-fields" disabled={pending || !editable}>
      <Field name="title" label="Judul kartu" value={task.title} />
      <label className="learning-field"><span>Penanggung jawab</span><select className="input" name="assigneeId" defaultValue={task.assigneeId ?? ""}><option value="">Belum ditentukan</option>{data.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <Field name="description" label="Deskripsi (opsional)" area required={false} max={5000} value={task.description} />
      {editable && <div className="form-actions"><Button type="submit">Simpan kartu</Button><Button type="button" className="button-secondary" onClick={archive}><Icon name="archive" />Arsipkan</Button></div>}
    </fieldset></form>
    <p className="learning-muted task-editor-meta">Kolom {taskStatusLabels[task.status]} · diperbarui {formatDateTime(task.updatedAt, timezone)}</p>
  </Card></div>;
}

function Overview({ data, pending, run, timezone, onExpired }: Common) {
  const { project, challenge } = data;
  const [editingMembers, setEditingMembers] = useState(false);
  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run("", { title: form.get("title"), summary: form.get("summary"), deliverableUrl: form.get("deliverableUrl") }, "Detail proyek disimpan.", "PATCH");
  }
  return <div className="project-layout">
    <div className="project-main">
      <Card className="lesson-card"><h2>Detail proyek</h2>
        {data.canEdit ? <form className="learning-form" onSubmit={saveDetails}><fieldset className="admin-fields" disabled={pending}>
          <Field name="title" label="Judul proyek" value={project.title} />
          <Field name="deliverableUrl" type="url" label="Tautan hasil karya (opsional)" required={false} max={2000} value={project.deliverableUrl ?? ""} />
          <Field name="summary" label="Ringkasan hasil (wajib sebelum dikirim)" area required={false} max={5000} value={project.summary} />
          <div className="form-actions"><Button type="submit">Simpan detail</Button></div>
        </fieldset></form>
          : <>{project.summary ? <p className="learning-prose">{project.summary}</p> : <p className="learning-muted">Belum ada ringkasan hasil.</p>}
            {project.deliverableUrl && <a className="material-link" href={project.deliverableUrl} target="_blank" rel="noopener noreferrer">Lihat hasil karya<Icon name="link" /></a>}</>}
      </Card>
      <Card className="lesson-card"><h2>Instruksi challenge</h2><p className="learning-muted">{challenge.dueAt ? `Tenggat pengiriman ${formatDateTime(challenge.dueAt, timezone)} (${timezone})` : "Tanpa tenggat"}</p><p className="learning-prose">{challenge.instructions}</p></Card>
      <Card className="lesson-card"><h2>Riwayat review</h2>
        {!data.reviews.length ? <p className="learning-muted">Belum ada review guru.</p> : data.reviews.map(review => <div className="grade-entry" key={review.id}>
          <span className="badge-group"><span className={`badge ${review.decision === "approved" ? "badge-success" : "badge-danger"}`}>{review.decision === "approved" ? "Disetujui" : "Perlu revisi"}</span>{review.score !== null && <strong>Nilai {review.score} / 100</strong>}</span>
          <small>{review.reviewerName} · {formatDateTime(review.createdAt, timezone)}</small>
          <p className="learning-prose">{review.feedback}</p>
        </div>)}
      </Card>
    </div>
    <div className="project-side">
      <Card className="lesson-card"><div className="learning-row"><h2>Tim</h2>{data.canManage && data.canEdit && <Button className="button-secondary button-small" aria-expanded={editingMembers} onClick={() => setEditingMembers(!editingMembers)}>Ubah anggota</Button>}</div>
        <ul className="member-list">{data.members.map(member => <li key={member.id}><span className="avatar avatar-small" aria-hidden="true">{initials(member.name)}</span>{member.name}</li>)}</ul>
        {editingMembers && <MembersForm courseId={data.course.id} max={challenge.maxTeamSize} initial={data.members.map(member => member.id)} pending={pending} run={run} close={() => setEditingMembers(false)} onExpired={onExpired} />}
      </Card>
      {data.canManage && project.status === "submitted" && <ReviewForm pending={pending} run={run} />}
      {data.canManage && project.status === "approved" && <Card className="lesson-card"><h2>Showcase</h2>
        <p className="learning-muted">{project.showcasedAt ? "Proyek tampil di showcase sekolah untuk semua pengguna yang masuk." : "Tampilkan proyek yang disetujui ini di showcase sekolah. Nilai dan review tidak ikut ditampilkan."}</p>
        <div className="learning-actions"><Button className={project.showcasedAt ? "button-secondary" : ""} disabled={pending} onClick={() => void run("showcase", { showcased: !project.showcasedAt }, project.showcasedAt ? "Proyek dikeluarkan dari showcase." : "Proyek masuk showcase sekolah.")}><Icon name="star" />{project.showcasedAt ? "Keluarkan dari showcase" : "Masukkan ke showcase"}</Button></div>
      </Card>}
      {data.isMember && project.status === "approved" && <PortfolioForm data={data} pending={pending} run={run} />}
    </div>
  </div>;
}

function MembersForm({ courseId, max, initial, pending, run, close, onExpired }: { courseId: string; max: number; initial: string[]; pending: boolean; run: Run; close: () => void; onExpired: () => void }) {
  const [selected, setSelected] = useState(initial);
  return <div className="members-form">
    <MemberPicker courseId={courseId} max={max} selected={selected} onChange={setSelected} onExpired={onExpired} />
    <div className="form-actions"><Button disabled={pending || !selected.length} onClick={() => void run("members", { memberIds: selected }, "Anggota tim diperbarui.").then(ok => { if (ok) close(); })}>Simpan anggota</Button><Button className="button-secondary" onClick={close}>Batal</Button></div>
  </div>;
}

function ReviewForm({ pending, run }: { pending: boolean; run: Run }) {
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run("reviews", { decision, feedback: form.get("feedback"), score: decision === "approved" ? Number(form.get("score")) : null },
      decision === "approved" ? "Proyek disetujui." : "Revisi diminta. Board terbuka kembali untuk tim.");
  }
  return <Card className="lesson-card review-card"><h2>Review guru</h2><p className="learning-muted">Tim sudah mengirim proyek dan menunggu keputusan Anda.</p>
    <form className="learning-form" onSubmit={submit}><fieldset className="admin-fields" disabled={pending}>
      <fieldset className="correct-options"><legend>Keputusan</legend>
        <label className="submission-confirm"><input type="radio" name="decision" checked={decision === "approved"} onChange={() => setDecision("approved")} /> Setujui dan beri nilai</label>
        <label className="submission-confirm"><input type="radio" name="decision" checked={decision === "changes_requested"} onChange={() => setDecision("changes_requested")} /> Minta revisi</label>
      </fieldset>
      {decision === "approved" && <Field name="score" type="number" label="Nilai (0–100)" min={0} max={100} step="0.01" />}
      <Field name="feedback" label="Umpan balik untuk tim" area max={5000} />
      <div className="form-actions"><Button type="submit">{decision === "approved" ? "Setujui proyek" : "Minta revisi"}</Button></div>
    </fieldset></form>
  </Card>;
}

function PortfolioForm({ data, pending, run }: { data: ProjectDetail; pending: boolean; run: Run }) {
  const entry = data.portfolio;
  const active = Boolean(entry && !entry.archived);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("portfolio", { reflection: new FormData(event.currentTarget).get("reflection") }, active ? "Refleksi portfolio diperbarui." : "Proyek ditambahkan ke portfolio Anda.");
  }
  return <Card className="lesson-card"><div className="learning-row"><h2>Portfolio saya</h2>{active && <span className="badge badge-success">Tersimpan</span>}</div>
    <p className="learning-muted">Tulis refleksi: peran Anda, hal yang dipelajari, dan tantangan yang berhasil diatasi.</p>
    <form className="learning-form" onSubmit={submit}><fieldset className="admin-fields" disabled={pending}>
      <Field name="reflection" label="Refleksi" area max={5000} value={entry?.reflection} />
      <div className="form-actions"><Button type="submit">{active ? "Perbarui refleksi" : "Tambahkan ke portfolio"}</Button>
        {active && <Button type="button" className="button-secondary" onClick={() => void run("portfolio/archive", { archived: true }, "Proyek dihapus dari portfolio.")}>Hapus dari portfolio</Button>}</div>
    </fieldset></form>
    <a className="material-link" href="/projects?tab=portfolio">Lihat portfolio saya<Icon name="arrowRight" /></a>
  </Card>;
}
