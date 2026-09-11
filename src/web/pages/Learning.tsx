import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { maxUploadBytes, uploadTypes } from "../../shared/learning";
import type { Activity, CourseDetail, CourseModule, Grade, LearningCourse, Lesson, Material, Page, Progress, StoredFile, Submission } from "../../shared/learning";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "../components/ui";

type Common = { timezone: string; onExpired: () => void };
const base = "/api/learning/courses";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Data tidak dapat dimuat.";
const date = (value: string, timezone: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
const accept = Object.keys(uploadTypes).map(extension => `.${extension}`).join(",");
const fileSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const chosenFile = (form: FormData) => { const file = form.get("file"); return file instanceof File && (file.name || file.size) ? file : null; };

function useData<T>(path: string, onExpired: () => void, revision = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    api<T>(path).then(result => { if (active) setData(result); }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(message(cause));
    });
    return () => { active = false; };
  }, [path, onExpired, revision, retry]);
  return { data, error, retry: () => setRetry(value => value + 1) };
}

function Pager({ offset, next, change }: { offset: number; next: number | null; change: (offset: number) => void }) {
  return <div className="table-pagination"><span>Halaman {offset / 50 + 1}</span><div><Button className="button-secondary button-small" disabled={!offset} onClick={() => change(offset - 50)}>Sebelumnya</Button><Button className="button-secondary button-small" disabled={next === null} onClick={() => next !== null && change(next)}>Berikutnya</Button></div></div>;
}
function Search({ change }: { change: (q: string) => void }) {
  return <form className="table-search" onSubmit={event => { event.preventDefault(); change(String(new FormData(event.currentTarget).get("q") ?? "")); }}><input name="q" className="input" type="search" aria-label="Cari data" placeholder="Cari…" maxLength={100} /><Button type="submit" className="button-secondary button-small">Cari</Button></form>;
}
function Status({ published }: { published: boolean }) { return <span className={`badge ${published ? "" : "badge-draft"}`}>{published ? "Terbit" : "Draft"}</span>; }
function FileLink({ href, file }: { href: string; file: StoredFile }) { return <a className="material-link" href={href}>Unduh {file.name} ({fileSize(file.sizeBytes)}) ↓</a>; }

export function Learning({ timezone, onExpired }: Common) {
  const courseId = location.pathname.match(/^\/learning\/courses\/([0-9a-f-]+)$/i)?.[1];
  const query = new URLSearchParams(location.search);
  if (courseId) return <CourseWorkspace key={courseId} courseId={courseId} initialLesson={query.get("lesson") ?? ""} initialReview={query.get("review") ?? ""} timezone={timezone} onExpired={onExpired} />;
  return <CourseList onExpired={onExpired} />;
}
function CourseList({ onExpired }: Pick<Common, "onExpired">) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<LearningCourse>>(`${base}?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <><div className="page-heading"><div><span className="eyebrow text-muted">RUANG BELAJAR</span><h1>Pembelajaran</h1><p>Materi, tugas, dan progres belajar dalam course Anda.</p></div></div>
    <Card><div className="card-heading"><h2>Courses Anda</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
      {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState title="Belum ada course" description={q ? "Tidak ada hasil yang sesuai dengan pencarian." : "Course akan tampil setelah Anda terdaftar dan course dipublikasikan. Guru dapat membuka course yang ditugaskan."} /> : <div className="course-grid">{data.items.map(course => <a className="course-tile" href={`/learning/courses/${course.id}`} key={course.id}><div className="learning-row"><span className="eyebrow text-muted">{course.className}</span><Status published={course.published} /></div><h3>{course.name}</h3><p>{course.term} · {course.year}</p><span className="course-open">{course.canManage ? "Kelola pembelajaran" : "Mulai belajar"} →</span></a>)}</div>}
      {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
    </Card></>;
}

type Editor = { resource: "modules"; value?: CourseModule } | { resource: "lessons"; parentId: string; value?: Lesson } | { resource: "materials"; parentId: string; value?: Material } | { resource: "activities"; parentId: string; value?: Activity };
function CourseWorkspace({ courseId, initialLesson, initialReview, timezone, onExpired }: Common & { courseId: string; initialLesson: string; initialReview: string }) {
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<CourseDetail>(`${base}/${courseId}`, onExpired, revision);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tab, setTab] = useState("content");
  const [selectedLesson, setSelectedLesson] = useState(initialLesson);
  const [reviewId, setReviewId] = useState(initialReview);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const saving = useRef(false);
  function changed() { setRevision(value => value + 1); }
  async function mutate(path: string, body: unknown, done: string) {
    if (saving.current) return;
    saving.current = true; setPending(true); setSaveError(""); setSuccess("");
    try {
      await api(`${base}/${courseId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSuccess(done); changed();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setSaveError(message(cause)); }
    finally { saving.current = false; setPending(false); }
  }
  if (error) return <><a href="/learning" className="learning-back">← Semua course</a><ErrorState message={error} retry={retry} /></>;
  if (!data) return <LoadingState />;
  const { course } = data;
  // Managers also receive archived items; the outline shows active content only.
  const modules = data.modules.filter(item => !item.archived);
  const activeModules = new Set(modules.map(item => item.id));
  const lessons = data.lessons.filter(item => !item.archived && activeModules.has(item.moduleId));
  const materials = data.materials.filter(item => !item.archived);
  const activities = data.activities.filter(item => !item.archived);
  const archived = [
    ...data.modules.filter(item => item.archived).map(item => ({ path: `modules/${item.id}`, label: "Modul", title: item.title })),
    ...data.lessons.filter(item => item.archived).map(item => ({ path: `lessons/${item.id}`, label: "Lesson", title: item.title })),
    ...data.materials.filter(item => item.archived).map(item => ({ path: `materials/${item.id}`, label: "Materi", title: item.title })),
    ...data.activities.filter(item => item.archived).map(item => ({ path: `activities/${item.id}`, label: "Tugas", title: item.title })),
  ];
  const lesson = lessons.find(item => item.id === selectedLesson) ?? lessons[0];
  const publishButton = (path: string, published: boolean, label: string) => <Button className="button-secondary button-small" disabled={pending} onClick={() => void mutate(path ? `${path}/publish` : "publish", { published: !published }, published ? "Konten dikembalikan ke draft." : "Konten dipublikasikan. Santri dapat membukanya jika course, modul, dan lesson juga terbit.")} aria-label={`${published ? "Jadikan draft" : "Publikasikan"} ${label}`}>{published ? "Jadikan draft" : "Publikasikan"}</Button>;
  const archiveButton = (path: string, label: string) => <Button className="button-secondary button-small" disabled={pending} aria-label={`Arsipkan ${label}`} onClick={() => { if (confirm(`Arsipkan "${label}"? Santri tidak akan melihatnya lagi. Jawaban, nilai, dan progres tetap tersimpan, dan konten dapat dipulihkan.`)) void mutate(`${path}/archive`, { archived: true }, "Konten diarsipkan. Pulihkan dari bagian Konten diarsipkan bila diperlukan."); }}>Arsipkan</Button>;
  return <>
    <a href="/learning" className="learning-back">← Semua course</a>
    <div className="page-heading"><div><span className="eyebrow text-muted">{course.className} · {course.term} · {course.year}</span><h1>{course.name}</h1><p>{course.canManage ? "Susun pembelajaran, publikasikan materi, dan dampingi progres santri." : "Pelajari materi, selesaikan lesson, lalu kumpulkan tugas Anda."}</p></div><div className="learning-actions"><Status published={course.published} />{course.canManage && publishButton("", course.published, "course")}</div></div>
    {success && <p className="success-state" role="status">{success}</p>}{saveError && <ErrorState message={saveError} />}
    {data.progress && <ProgressSummary value={data.progress} />}
    <nav className="academic-tabs" aria-label="Halaman course"><button className={tab === "content" ? "tab-active" : ""} aria-current={tab === "content" ? "page" : undefined} onClick={() => setTab("content")}>Materi & tugas</button>{course.canManage && <button className={tab === "progress" ? "tab-active" : ""} aria-current={tab === "progress" ? "page" : undefined} onClick={() => setTab("progress")}>Progres santri</button>}</nav>
    {tab === "progress" && course.canManage ? <ProgressTable courseId={courseId} onExpired={onExpired} /> : <>
      {course.canManage && <div className="learning-toolbar"><Button onClick={() => setEditor({ resource: "modules" })}>Tambah modul</Button><p>Publikasikan setiap tingkat agar konten terlihat oleh santri.</p></div>}
      {editor && <ContentEditor key={`${editor.resource}-${editor.value?.id ?? ("parentId" in editor ? editor.parentId : "new")}`} editor={editor} modules={modules} courseId={courseId} onExpired={onExpired} close={() => setEditor(null)} saved={() => { setEditor(null); setSuccess("Konten berhasil disimpan."); changed(); }} />}
      {!modules.length ? <Card><EmptyState title="Belum ada modul" description={course.canManage ? "Tambahkan modul pertama untuk menyusun lesson dan tugas." : "Guru akan mempublikasikan modul pembelajaran di sini."} /></Card> : <div className="learning-layout">
        <Card className="course-outline"><h2>Daftar pembelajaran</h2>{modules.map(module => <section className="module-outline" key={module.id}><div className="learning-row"><h3>{module.position}. {module.title}</h3>{course.canManage && <Status published={module.published} />}</div>{course.canManage && <div className="learning-actions"><Button className="button-secondary button-small" onClick={() => setEditor({ resource: "modules", value: module })}>Edit modul</Button>{publishButton(`modules/${module.id}`, module.published, module.title)}<Button className="button-secondary button-small" onClick={() => setEditor({ resource: "lessons", parentId: module.id })}>Tambah lesson</Button>{archiveButton(`modules/${module.id}`, module.title)}</div>}
          {lessons.filter(item => item.moduleId === module.id).map(item => <button key={item.id} className={`lesson-nav ${lesson?.id === item.id ? "lesson-active" : ""}`} aria-current={lesson?.id === item.id ? "page" : undefined} onClick={() => { setSelectedLesson(item.id); setReviewId(""); setEditor(null); }}><span>{item.completed ? "✓ " : ""}{item.title}</span>{course.canManage && <Status published={item.published} />}</button>)}
          {!lessons.some(item => item.moduleId === module.id) && <p className="outline-empty">Belum ada lesson.</p>}
        </section>)}</Card>
        <div className="lesson-workspace">{!lesson ? <Card><EmptyState title="Belum ada lesson" description="Lesson yang tersedia akan tampil di sini." /></Card> : <>
          <Card className="lesson-card"><div className="learning-row"><h2>{lesson.title}</h2>{course.canManage && <Status published={lesson.published} />}</div>{course.canManage && <div className="learning-actions"><Button className="button-secondary button-small" onClick={() => setEditor({ resource: "lessons", parentId: lesson.moduleId, value: lesson })}>Edit lesson</Button>{publishButton(`lessons/${lesson.id}`, lesson.published, lesson.title)}{archiveButton(`lessons/${lesson.id}`, lesson.title)}</div>}<p className="learning-prose">{lesson.content}</p>
            {data.canParticipate && <MutationForm path={`${base}/${courseId}/lessons/${lesson.id}/complete`} label={lesson.completed ? "✓ Lesson selesai" : "Tandai lesson selesai"} disabled={lesson.completed} onExpired={onExpired} saved={changed} body={() => ({})} />}
          </Card>
          <Card className="lesson-card"><div className="learning-row"><h2>Materi pendukung</h2>{course.canManage && <Button className="button-secondary button-small" onClick={() => setEditor({ resource: "materials", parentId: lesson.id })}>Tambah materi</Button>}</div>
            {materials.filter(item => item.lessonId === lesson.id).map(material => <article className="material-item" key={material.id}><div className="learning-row"><h3>{material.title}</h3>{course.canManage && <div className="learning-actions"><Button className="button-secondary button-small" onClick={() => setEditor({ resource: "materials", parentId: lesson.id, value: material })}>Edit materi</Button>{archiveButton(`materials/${material.id}`, material.title)}</div>}</div>
              {material.kind === "link" ? <a className="material-link" href={material.content} target="_blank" rel="noopener noreferrer">Buka {material.title} ↗</a>
                : material.kind === "file" && material.file ? <>{material.content && <p className="learning-prose">{material.content}</p>}<FileLink href={`${base}/${courseId}/materials/${material.id}/file`} file={material.file} /></>
                : <p className="learning-prose">{material.content}</p>}</article>)}
            {!materials.some(item => item.lessonId === lesson.id) && <p className="learning-muted">Belum ada materi pendukung.</p>}
          </Card>
          <Card className="lesson-card"><div className="learning-row"><h2>Tugas</h2>{course.canManage && <Button className="button-secondary button-small" onClick={() => setEditor({ resource: "activities", parentId: lesson.id })}>Tambah tugas</Button>}</div>
            {activities.filter(item => item.lessonId === lesson.id).map(activity => <article className="activity-item" id={`activity-${activity.id}`} key={activity.id}><div className="learning-row"><h3>{activity.title}</h3>{course.canManage && <Status published={activity.published} />}</div><p className="learning-muted">{activity.dueAt ? `Tenggat: ${date(activity.dueAt, timezone)} (${timezone})` : "Tanpa tenggat"}</p><p className="learning-prose">{activity.instructions}</p>
              {course.canManage && <div className="learning-actions"><Button className="button-secondary button-small" onClick={() => setEditor({ resource: "activities", parentId: lesson.id, value: activity })}>Edit tugas</Button>{publishButton(`activities/${activity.id}`, activity.published, activity.title)}{archiveButton(`activities/${activity.id}`, activity.title)}<Button className="button-small" aria-expanded={reviewId === activity.id} onClick={() => setReviewId(reviewId === activity.id ? "" : activity.id)}>Jawaban & nilai</Button></div>}
              {data.canParticipate && <StudentSubmission activity={activity} courseId={courseId} timezone={timezone} onExpired={onExpired} saved={changed} />}
              {reviewId === activity.id && course.canManage && <SubmissionReview courseId={courseId} activity={activity} timezone={timezone} onExpired={onExpired} />}
            </article>)}{!activities.some(item => item.lessonId === lesson.id) && <p className="learning-muted">Belum ada tugas untuk lesson ini.</p>}
          </Card>
        </>}</div>
      </div>}
      {course.canManage && archived.length > 0 && <Card className="lesson-card archive-card"><h2>Konten diarsipkan</h2><p className="learning-muted">Santri tidak melihat konten ini. Lesson, materi, dan tugas di dalam modul yang diarsipkan ikut tersembunyi sampai modulnya dipulihkan.</p>
        {archived.map(item => <div className="archive-item" key={item.path}><div><span className="eyebrow text-muted">{item.label}</span><strong>{item.title}</strong></div><Button className="button-secondary button-small" disabled={pending} aria-label={`Pulihkan ${item.title}`} onClick={() => void mutate(`${item.path}/archive`, { archived: false }, "Konten dipulihkan.")}>Pulihkan</Button></div>)}
      </Card>}
    </>}
  </>;
}

function MutationForm({ path, label, body, saved, onExpired, children, method = "POST", disabled = false }: { path: string; label: string; body: (form: FormData) => unknown; saved: () => void; onExpired: () => void; children?: ReactNode; method?: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || disabled) return;
    const payload = body(new FormData(event.currentTarget));
    const file = payload instanceof FormData ? chosenFile(payload) : null;
    if (file && file.size > maxUploadBytes) { setError("Ukuran berkas maksimal 10 MB."); return; }
    saving.current = true; setPending(true); setError("");
    try {
      // Multipart bodies let the browser set the boundary header itself.
      await api(path, payload instanceof FormData ? { method, body: payload } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      saved();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(message(cause)); }
    finally { saving.current = false; setPending(false); }
  }
  return <form className="learning-form" onSubmit={event => void submit(event)}><fieldset className="admin-fields" disabled={pending || disabled}>{children}<div className="form-actions"><Button type="submit" disabled={pending || disabled}>{pending ? "Menyimpan…" : label}</Button></div></fieldset>{error && <ErrorState message={error} />}</form>;
}
function Field({ label, name, value = "", area = false, type = "text", required = true, max = 150, min, step }: { label: string; name: string; value?: string | number | undefined; area?: boolean; type?: string; required?: boolean; max?: number; min?: number; step?: string }) {
  return <label className={`learning-field ${area ? "field-wide" : ""}`}><span>{label}</span>{area ? <textarea className="input" name={name} required={required} maxLength={max} defaultValue={value} rows={5} /> : <input className="input" name={name} required={required} maxLength={type === "text" ? max : undefined} type={type} defaultValue={value} min={min} max={type === "number" ? max : undefined} step={step} />}</label>;
}
function ContentEditor({ editor, modules, courseId, onExpired, close, saved }: { editor: Editor; modules: CourseModule[]; courseId: string; onExpired: () => void; close: () => void; saved: () => void }) {
  const value = editor.value;
  const current = editor.resource === "materials" ? editor.value : undefined;
  const [kind, setKind] = useState<Material["kind"]>(current?.kind ?? "text");
  const title = { modules: "modul", lessons: "lesson", materials: "materi", activities: "tugas" }[editor.resource];
  const due = editor.resource === "activities" ? editor.value?.dueAt : null;
  // datetime-local uses the device timezone; the form explicitly labels that timezone.
  const localDue = due ? new Date(new Date(due).getTime() - new Date(due).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  return <Card className="admin-form-card"><div className="learning-row"><h2>{value ? "Edit" : "Tambah"} {title}</h2><Button className="button-secondary button-small" onClick={close}>Batal</Button></div>
    <MutationForm path={`${base}/${courseId}/${editor.resource}${value ? `/${value.id}` : ""}`} method={value ? "PATCH" : "POST"} label={`Simpan ${title}`} onExpired={onExpired} saved={saved} body={form => {
      if (editor.resource === "materials") form.set("lessonId", editor.parentId);
      if (editor.resource === "materials" && kind === "file") {
        if (!chosenFile(form)) form.delete("file");
        return form;
      }
      const body: Record<string, unknown> = Object.fromEntries(form);
      if ("position" in body) body.position = Number(body.position);
      if (editor.resource === "activities") { body.lessonId = editor.parentId; body.kind = "assignment"; body.dueAt = body.dueAt ? new Date(String(body.dueAt)).toISOString() : null; }
      return body;
    }}>
      <Field name="title" label="Judul" value={value?.title} />
      {editor.resource === "lessons" && <label className="learning-field"><span>Modul</span><select name="moduleId" className="input" defaultValue={editor.value?.moduleId ?? editor.parentId}>{modules.map(module => <option key={module.id} value={module.id}>{module.position}. {module.title}</option>)}</select></label>}
      {(editor.resource === "modules" || editor.resource === "lessons") && <Field name="position" label="Urutan" type="number" value={editor.value?.position ?? 1} min={0} max={10000} step="1" />}
      {editor.resource === "lessons" && <Field name="content" label="Isi lesson" area max={20000} value={editor.value?.content} />}
      {editor.resource === "materials" && <>
        <label className="learning-field"><span>Jenis materi</span><select name="kind" className="input" value={kind} onChange={event => setKind(event.target.value as Material["kind"])}><option value="text">Teks</option><option value="link">Tautan HTTP/HTTPS</option><option value="file">Berkas</option></select></label>
        {kind === "file" ? <>
          <label className="learning-field"><span>{current?.file ? `Ganti berkas (saat ini: ${current.file.name})` : "Berkas materi"}</span><input className="input" type="file" name="file" accept={accept} required={!current?.file} /></label>
          <Field key="file-note" name="content" label="Keterangan (opsional)" area required={false} max={2000} value={current?.kind === "file" ? current.content : ""} />
          <p className="learning-muted field-wide">PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, atau ZIP. Maksimal 10 MB. Berkas selalu diunduh, tidak dibuka di dalam aplikasi.</p>
        </> : <Field key={kind} name="content" label={kind === "link" ? "URL materi" : "Isi materi"} area max={kind === "link" ? 2000 : 20000} value={current?.kind === kind ? current.content : ""} />}
      </>}
      {editor.resource === "activities" && <><Field name="dueAt" label={`Tenggat opsional (${Intl.DateTimeFormat().resolvedOptions().timeZone})`} type="datetime-local" required={false} value={localDue} /><Field name="instructions" label="Instruksi tugas" area max={20000} value={editor.value?.instructions} /><p className="learning-muted field-wide">Jawaban berupa teks, tautan, atau satu berkas (maks. 10 MB), dikumpulkan satu kali. Nilai 0–100. Instruksi dan tenggat terkunci setelah ada jawaban.</p></>}
    </MutationForm>
  </Card>;
}
function StudentSubmission({ activity, courseId, timezone, onExpired, saved }: Common & { activity: Activity; courseId: string; saved: () => void }) {
  const submission = activity.submission;
  if (submission) return <div className="submitted-answer"><p className="badge">✓ Dikumpulkan {date(submission.submittedAt, timezone)}</p>{submission.content && <p className="learning-prose">{submission.content}</p>}{submission.file && <FileLink href={`${base}/${courseId}/submissions/${submission.id}/file`} file={submission.file} />}{submission.grade ? <><h4>Nilai: {submission.grade.score} / 100</h4><p className="learning-prose">{submission.grade.feedback}</p><History courseId={courseId} submissionId={submission.id} timezone={timezone} onExpired={onExpired} /></> : <p className="learning-muted">Menunggu penilaian guru.</p>}</div>;
  return <MutationForm path={`${base}/${courseId}/activities/${activity.id}/submit`} label="Kumpulkan jawaban" onExpired={onExpired} saved={saved} body={form => chosenFile(form) ? form : { content: form.get("content") }}>
    <Field name="content" label="Jawaban Anda (teks atau tautan karya)" area required={false} max={20000} />
    <label className="learning-field field-wide"><span>Lampiran berkas (opsional, maks. 10 MB)</span><input className="input" type="file" name="file" accept={accept} /></label>
    <label className="submission-confirm field-wide"><input type="checkbox" required /> Saya sudah memeriksa jawaban dan lampiran. Jawaban yang dikumpulkan tidak dapat diganti.</label>
  </MutationForm>;
}
function SubmissionReview({ courseId, activity, timezone, onExpired }: Common & { courseId: string; activity: Activity }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<Page<Submission>>(`${base}/${courseId}/activities/${activity.id}/submissions?offset=${offset}`, onExpired, revision);
  return <div className="submission-review"><h4>Jawaban & nilai · {activity.title}</h4>{error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState title="Belum ada jawaban" description="Jawaban santri akan muncul setelah dikumpulkan." /> : data.items.map(submission => <section className="submission-card" key={submission.id}><h4>{submission.studentName}</h4><p className="learning-muted">{date(submission.submittedAt, timezone)}</p>{submission.content && <p className="learning-prose">{submission.content}</p>}{submission.file && <FileLink href={`${base}/${courseId}/submissions/${submission.id}/file`} file={submission.file} />}<MutationForm path={`${base}/${courseId}/submissions/${submission.id}/grade`} label={submission.grade ? "Simpan koreksi nilai" : "Simpan nilai"} onExpired={onExpired} saved={() => setRevision(value => value + 1)} body={form => ({ score: Number(form.get("score")), feedback: form.get("feedback"), previousGradeId: submission.grade?.id ?? null })}><Field name="score" label="Nilai (0–100)" type="number" min={0} max={100} step="0.01" value={submission.grade?.score ?? ""} /><Field name="feedback" label="Umpan balik" area max={5000} value={submission.grade?.feedback} /></MutationForm><History courseId={courseId} submissionId={submission.id} timezone={timezone} onExpired={onExpired} /></section>)}{data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}</div>;
}
function History({ courseId, submissionId, timezone, onExpired }: Common & { courseId: string; submissionId: string }) {
  const [open, setOpen] = useState(false);
  return <div className="grade-history"><Button className="button-secondary button-small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Tutup riwayat nilai" : "Riwayat nilai"}</Button>{open && <HistoryRows courseId={courseId} submissionId={submissionId} timezone={timezone} onExpired={onExpired} />}</div>;
}
function HistoryRows({ courseId, submissionId, timezone, onExpired }: Common & { courseId: string; submissionId: string }) {
  const [offset, setOffset] = useState(0);
  const { data, error, retry } = useData<Page<Grade>>(`${base}/${courseId}/submissions/${submissionId}/grades?offset=${offset}`, onExpired);
  return error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : <>{!data.items.length ? <p className="learning-muted">Belum ada nilai.</p> : data.items.map(grade => <div className="grade-entry" key={grade.id}><strong>{grade.score} / 100</strong><small>{date(grade.createdAt, timezone)}</small><p className="learning-prose">{grade.feedback}</p></div>)}<Pager offset={offset} next={data.nextOffset} change={setOffset} /></>;
}
function ProgressSummary({ value }: { value: Progress }) {
  return <div className="learning-progress"><div><strong>{value.completed} / {value.lessons} lesson selesai</strong><progress aria-label="Progres lesson" max={value.lessons || 1} value={value.completed} /></div><span>{value.submitted} / {value.activities} tugas dikumpulkan</span><span>{value.graded} tugas dinilai</span></div>;
}
function ProgressTable({ courseId, onExpired }: { courseId: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<Progress>>(`${base}/${courseId}/progress?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <Card><div className="card-heading"><h2>Progres konten terbit</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>{error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState title="Belum ada santri" description="Santri yang terdaftar di kelas akan muncul di sini." /> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Progres santri"><table className="data-table"><thead><tr><th scope="col">Santri</th><th scope="col">Lesson selesai</th><th scope="col">Tugas dikumpulkan</th><th scope="col">Tugas dinilai</th></tr></thead><tbody>{data.items.map(row => <tr key={row.studentId}><td>{row.studentName}</td><td>{row.completed} / {row.lessons}</td><td>{row.submitted} / {row.activities}</td><td>{row.graded}</td></tr>)}</tbody></table></div>}{data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}</Card>;
}
