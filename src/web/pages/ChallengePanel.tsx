import { useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Challenge, TeamMode } from "../../shared/project";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState } from "../components/ui";
import { Icon } from "../components/icons";
import { Field, MutationForm, Status, deviceTimezone, errorMessage, formatDateTime, fromLocalInput, learningApi, toLocalInput } from "../components/learning";
import { MemberPicker, ProjectStatusBadge, jsonRequest } from "../components/projects";

type Common = { courseId: string; timezone: string; onExpired: () => void };

export function LessonChallenges({ courseId, lessonId, challenges, canManage, canParticipate, publishButton, archiveButton, changed, timezone, onExpired }: Common & {
  lessonId: string; challenges: Challenge[]; canManage: boolean; canParticipate: boolean; changed: () => void;
  publishButton: (path: string, published: boolean, label: string) => ReactNode; archiveButton: (path: string, label: string) => ReactNode;
}) {
  const [editor, setEditor] = useState<Challenge | "new" | null>(null);
  const [teamFor, setTeamFor] = useState("");
  const items = challenges.filter(item => item.lessonId === lessonId && !item.archived);
  if (!items.length && !canManage) return null;
  return <Card className="lesson-card"><div className="learning-row"><h2>Challenge proyek</h2>{canManage && <Button className="button-secondary button-small" onClick={() => setEditor("new")}>Tambah challenge</Button>}</div>
    {editor && <ChallengeEditor key={editor === "new" ? "new" : editor.id} courseId={courseId} lessonId={lessonId} value={editor === "new" ? undefined : editor} close={() => setEditor(null)} saved={() => { setEditor(null); changed(); }} onExpired={onExpired} />}
    {items.map(challenge => {
      const team = challenge.settings.teamMode === "team";
      return <article className="activity-item" key={challenge.id}>
        <div className="learning-row"><h3>{challenge.title}</h3><div className="badge-group"><span className="badge badge-discovery">{team ? `Tim · maks. ${challenge.settings.maxTeamSize}` : "Individu"}</span>{canManage && <Status published={challenge.published} />}</div></div>
        <p className="learning-muted">{challenge.dueAt ? `Tenggat pengiriman: ${formatDateTime(challenge.dueAt, timezone)} (${timezone})` : "Tanpa tenggat"}{canManage ? ` · ${challenge.projectCount} proyek` : ""}</p>
        <p className="learning-prose">{challenge.instructions}</p>
        {canManage && <div className="learning-actions">
          <Button className="button-secondary button-small" onClick={() => setEditor(challenge)}>{challenge.locked ? "Lihat pengaturan" : "Edit challenge"}</Button>
          {publishButton(`activities/${challenge.id}`, challenge.published, challenge.title)}
          {archiveButton(`activities/${challenge.id}`, challenge.title)}
          <Button className="button-small" aria-expanded={teamFor === challenge.id} onClick={() => setTeamFor(teamFor === challenge.id ? "" : challenge.id)}>{team ? "Bentuk tim" : "Buat proyek untuk santri"}</Button>
          {challenge.projectCount > 0 && <a className="material-link" href={`/projects?${new URLSearchParams({ challenge: challenge.id })}`}>Lihat {challenge.projectCount} proyek<Icon name="arrowRight" /></a>}
        </div>}
        {canManage && teamFor === challenge.id && <TeamForm courseId={courseId} challenge={challenge} close={() => setTeamFor("")} saved={() => { setTeamFor(""); changed(); }} onExpired={onExpired} />}
        {canParticipate && <StudentChallenge courseId={courseId} challenge={challenge} onExpired={onExpired} />}
      </article>;
    })}
    {!items.length && <p className="learning-muted">Belum ada challenge untuk lesson ini.</p>}
  </Card>;
}

function ChallengeEditor({ courseId, lessonId, value, close, saved, onExpired }: Omit<Common, "timezone"> & { lessonId: string; value?: Challenge | undefined; close: () => void; saved: () => void }) {
  const [mode, setMode] = useState<TeamMode>(value?.settings.teamMode ?? "team");
  const locked = Boolean(value?.locked);
  return <Card className="admin-form-card"><div className="learning-row"><h2>{value ? "Pengaturan challenge" : "Tambah challenge"}</h2><Button className="button-secondary button-small" onClick={close}>Tutup</Button></div>
    {locked ? <p className="info-state">Proyek sudah dikirim untuk review. Challenge terkunci agar semua tim dinilai dengan instruksi dan tenggat yang sama.</p>
      : value?.teamLocked && <p className="info-state">Tim sudah dibentuk. Mode dan ukuran tim tidak dapat diubah; judul, instruksi, dan tenggat masih dapat disesuaikan.</p>}
    <MutationForm path={`${learningApi}/${courseId}/challenges${value ? `/${value.id}` : ""}`} method={value ? "PATCH" : "POST"} label="Simpan challenge" disabled={locked} onExpired={onExpired} saved={saved}
      body={form => ({ lessonId, title: form.get("title"), instructions: form.get("instructions"), dueAt: fromLocalInput(form.get("dueAt")), teamMode: mode, maxTeamSize: mode === "team" ? Number(form.get("maxTeamSize")) : 1 })}>
      <Field name="title" label="Judul" value={value?.title} />
      <Field name="dueAt" type="datetime-local" required={false} label={`Tenggat pengiriman (opsional, ${deviceTimezone()})`} value={toLocalInput(value?.dueAt)} />
      <label className="learning-field"><span>Mode pengerjaan</span><select className="input" value={mode} disabled={Boolean(value?.teamLocked)} onChange={event => setMode(event.target.value as TeamMode)}><option value="team">Tim (dibentuk guru)</option><option value="individual">Individu (dimulai santri)</option></select></label>
      {mode === "team" && <Field key={String(value?.teamLocked)} name="maxTeamSize" type="number" min={2} max={10} step="1" label="Ukuran tim maksimal (2–10)" value={value?.settings.maxTeamSize ?? 4} />}
      <Field name="instructions" label="Instruksi & kriteria hasil" area max={20000} value={value?.instructions} />
      <p className="learning-muted field-wide">Tim mengerjakan proyek di board Kanban, lalu mengirimnya untuk review. Guru menyetujui dengan nilai 0–100 atau meminta revisi. Proyek yang disetujui dapat masuk showcase dan portfolio santri.</p>
    </MutationForm>
  </Card>;
}

function TeamForm({ courseId, challenge, close, saved, onExpired }: Omit<Common, "timezone"> & { challenge: Challenge; close: () => void; saved: () => void }) {
  const [members, setMembers] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const team = challenge.settings.teamMode === "team";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    if (!members.length) { setError("Pilih minimal satu santri."); return; }
    const title = new FormData(event.currentTarget).get("title");
    saving.current = true; setPending(true); setError("");
    try { await api(`${learningApi}/${courseId}/challenges/${challenge.id}/projects`, jsonRequest({ title, memberIds: members })); saved(); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { saving.current = false; setPending(false); }
  }
  return <section className="submission-card"><div className="learning-row"><h4>{team ? "Bentuk tim baru" : "Proyek individu untuk santri"}</h4><Button className="button-secondary button-small" onClick={close}>Tutup</Button></div>
    <p className="learning-muted">Setiap santri hanya dapat tergabung di satu proyek per challenge.</p>
    <MemberPicker courseId={courseId} max={challenge.settings.maxTeamSize} selected={members} onChange={setMembers} onExpired={onExpired} />
    <form className="learning-form" onSubmit={event => void submit(event)}><fieldset className="admin-fields" disabled={pending}>
      <Field name="title" label={team ? "Nama tim / judul proyek" : "Judul proyek"} />
      <div className="form-actions"><Button type="submit">{pending ? "Menyimpan…" : "Buat proyek"}</Button></div>
    </fieldset>{error && <ErrorState message={error} />}</form>
  </section>;
}

function StudentChallenge({ courseId, challenge, onExpired }: Omit<Common, "timezone"> & { challenge: Challenge }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const project = await api<{ id: string }>(`${learningApi}/${courseId}/challenges/${challenge.id}/projects`, jsonRequest({ title: new FormData(event.currentTarget).get("title") }));
      location.assign(`/projects/${project.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else { setError(errorMessage(cause)); setPending(false); }
    }
  }
  if (challenge.project) return <div className="submitted-answer"><div className="learning-row"><strong>{challenge.project.title}</strong><ProjectStatusBadge status={challenge.project.status} /></div>
    <a className="button button-small project-open" href={`/projects/${challenge.project.id}`}>Buka board proyek<Icon name="arrowRight" /></a></div>;
  if (challenge.settings.teamMode === "team") return <p className="info-state">Guru akan membentuk tim untuk challenge ini. Board proyek tampil di sini setelah Anda ditambahkan ke tim.</p>;
  return <form className="learning-form submitted-answer" onSubmit={event => void start(event)}><fieldset className="admin-fields" disabled={pending}>
    <Field name="title" label="Judul proyek Anda" value={challenge.title} />
    <div className="form-actions"><Button type="submit">{pending ? "Menyiapkan board…" : "Mulai proyek"}</Button></div>
  </fieldset>{error && <ErrorState message={error} />}</form>;
}
