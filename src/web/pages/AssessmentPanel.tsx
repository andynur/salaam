import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Assessment, AssessmentKind, AssessmentRubric, AttemptRow, Question, QuestionType, ResultsVisibility, RubricCriterion, ScoreAdjustment, ScoringMode } from "../../shared/assessment";
import type { Page } from "../../shared/learning";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { Field, MutationForm, Pager, Search, Status, deviceTimezone, errorMessage, formatDateTime, fromLocalInput, learningApi, toLocalInput, useData } from "../components/learning";

type Common = { courseId: string; timezone: string; onExpired: () => void };
const kindLabels: Record<AssessmentKind, string> = { quiz: "Quiz", exam: "Ujian" };
const typeLabels: Record<QuestionType, string> = { single_choice: "Pilihan ganda · satu jawaban", multiple_choice: "Pilihan ganda · banyak jawaban", true_false: "Benar/Salah", short_answer: "Jawaban singkat", essay: "Esai" };
const visibilityLabels: Record<ResultsVisibility, string> = { after_submit: "Nilai & pembahasan setelah dikumpulkan", after_close: "Nilai & pembahasan setelah ditutup", score_only: "Hanya nilai setelah dikumpulkan", hidden: "Disembunyikan dari santri" };
const scoringLabels: Record<ScoringMode, string> = { all_or_nothing: "Semua benar atau nol", partial_credit: "Poin sebagian untuk jawaban benar", negative_marking: "Kurangi poin untuk pilihan salah" };
const optionIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const json = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function LessonAssessments({ courseId, lessonId, assessments, canManage, canParticipate, publishButton, archiveButton, changed, timezone, onExpired }: Common & {
  lessonId: string; assessments: Assessment[]; canManage: boolean; canParticipate: boolean; changed: () => void;
  publishButton: (path: string, published: boolean, label: string) => ReactNode; archiveButton: (path: string, label: string) => ReactNode;
}) {
  const [editor, setEditor] = useState<Assessment | "new" | null>(null);
  const [resultsFor, setResultsFor] = useState("");
  const [starting, setStarting] = useState("");
  const [error, setError] = useState("");
  const items = assessments.filter(item => item.lessonId === lessonId && !item.archived);
  async function start(assessment: Assessment) {
    setStarting(assessment.id); setError("");
    try {
      const attempt = await api<{ id: string }>(`${learningApi}/${courseId}/assessments/${assessment.id}/attempts`, json({}));
      location.assign(`/learning/courses/${courseId}/attempts/${attempt.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else { setError(errorMessage(cause)); setStarting(""); }
    }
  }
  if (!items.length && !canManage) return null;
  return <Card className="lesson-card"><div className="learning-row"><h2>Quiz & ujian</h2>{canManage && <Button className="button-secondary button-small" onClick={() => setEditor("new")}>Tambah quiz/ujian</Button>}</div>
    {error && <ErrorState message={error} />}
    {editor && <AssessmentEditor key={editor === "new" ? "new" : editor.id} courseId={courseId} lessonId={lessonId} value={editor === "new" ? undefined : editor} close={() => setEditor(null)} saved={() => { setEditor(null); changed(); }} timezone={timezone} onExpired={onExpired} />}
    {items.map(assessment => {
      const settings = assessment.settings;
      const open = assessment.attempts.find(attempt => !attempt.submittedAt);
      return <article className="activity-item" key={assessment.id}>
        <div className="learning-row"><h3>{assessment.title}</h3><div className="learning-actions"><span className="badge badge-gold">{kindLabels[assessment.kind]}</span>{canManage && <Status published={assessment.published} />}</div></div>
        <p className="learning-muted">{assessment.questionCount} soal · nilai maks. {assessment.maxScore} · {settings.timeLimitMinutes ? `${settings.timeLimitMinutes} menit` : "tanpa batas waktu"} · {settings.maxAttempts}× percobaan{settings.opensAt ? ` · dibuka ${formatDateTime(settings.opensAt, timezone)}` : ""}{settings.closesAt ? ` · ditutup ${formatDateTime(settings.closesAt, timezone)}` : ""}</p>
        <p className="learning-prose">{assessment.instructions}</p>
        {canManage && <div className="learning-actions"><Button className="button-secondary button-small" onClick={() => setEditor(assessment)}>{assessment.locked ? "Lihat pengaturan" : "Edit & pilih soal"}</Button>{publishButton(`activities/${assessment.id}`, assessment.published, assessment.title)}{archiveButton(`activities/${assessment.id}`, assessment.title)}<Button className="button-small" aria-expanded={resultsFor === assessment.id} onClick={() => setResultsFor(resultsFor === assessment.id ? "" : assessment.id)}>Hasil santri</Button></div>}
        {canManage && resultsFor === assessment.id && <AttemptTable courseId={courseId} assessment={assessment} timezone={timezone} onExpired={onExpired} />}
        {canParticipate && <div className="submitted-answer">
          {assessment.attempts.map(attempt => <a key={attempt.id} className="material-link attempt-link" href={`/learning/courses/${courseId}/attempts/${attempt.id}`}>Percobaan {attempt.number}: {attempt.submittedAt ? attempt.score !== null ? `nilai ${attempt.score} / ${attempt.maxScore}` : "dikumpulkan" : "sedang berjalan"} →</a>)}
          {open ? <Button disabled={Boolean(starting)} onClick={() => void start(assessment)}>Lanjutkan mengerjakan</Button>
            : assessment.attempts.length < settings.maxAttempts ? <Button disabled={Boolean(starting)} onClick={() => void start(assessment)}>{starting === assessment.id ? "Menyiapkan soal…" : assessment.attempts.length ? "Mulai percobaan baru" : `Mulai ${kindLabels[assessment.kind].toLowerCase()}`}</Button>
            : <p className="learning-muted">Kesempatan mengerjakan sudah habis.</p>}
        </div>}
      </article>;
    })}
    {!items.length && <p className="learning-muted">Belum ada quiz atau ujian untuk lesson ini.</p>}
  </Card>;
}

function AssessmentEditor({ courseId, lessonId, value, close, saved, timezone, onExpired }: Common & { lessonId: string; value?: undefined |Assessment; close: () => void; saved: () => void }) {
  const [kind, setKind] = useState<AssessmentKind>(value?.kind ?? "quiz");
  const [picked, setPicked] = useState<{ questionId: string; points: number }[]>(value?.items?.map(({ questionId, points }) => ({ questionId, points })) ?? []);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rubricFor, setRubricFor] = useState("");
  const saving = useRef(false);
  const bank = useData<Page<Question>>(`${learningApi}/${courseId}/questions?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  const locked = Boolean(value?.locked);
  const settings = value?.settings;
  function toggle(questionId: string) {
    setPicked(items => items.some(item => item.questionId === questionId) ? items.filter(item => item.questionId !== questionId) : [...items, { questionId, points: 1 }]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || locked) return;
    const form = new FormData(event.currentTarget);
    const body = {
      lessonId, kind, title: form.get("title"), instructions: form.get("instructions"),
      opensAt: fromLocalInput(form.get("opensAt")), closesAt: fromLocalInput(form.get("closesAt")),
      timeLimitMinutes: form.get("timeLimitMinutes") ? Number(form.get("timeLimitMinutes")) : null,
      maxAttempts: kind === "exam" ? 1 : Number(form.get("maxAttempts")),
      shuffleQuestions: form.get("shuffleQuestions") === "on", shuffleOptions: form.get("shuffleOptions") === "on",
      resultsVisibility: form.get("resultsVisibility"),
      scoringMode: form.get("scoringMode"),
    };
    saving.current = true; setPending(true); setError("");
    try {
      const result = await api<{ id: string }>(`${learningApi}/${courseId}/assessments${value ? `/${value.id}` : ""}`, json(body, value ? "PATCH" : "POST"));
      if (picked.length) await api(`${learningApi}/${courseId}/assessments/${result.id}/items`, json({ items: picked }));
      saved();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { saving.current = false; setPending(false); }
  }
  const total = picked.reduce((sum, item) => sum + item.points, 0);
  return <Card className="admin-form-card"><div className="learning-row"><h2>{value ? `Pengaturan ${kindLabels[kind].toLowerCase()}` : "Tambah quiz/ujian"}</h2><Button className="button-secondary button-small" onClick={close}>Tutup</Button></div>
    {locked && <p className="info-state">Sudah dikerjakan santri. Pengaturan dan daftar soal terkunci agar penilaian adil.</p>}
    <form className="learning-form" onSubmit={event => void submit(event)}><fieldset className="admin-fields" disabled={pending || locked}>
      <label className="learning-field"><span>Jenis</span><select className="input" name="kind" value={kind} disabled={Boolean(value)} onChange={event => setKind(event.target.value as AssessmentKind)}><option value="quiz">Quiz</option><option value="exam">Ujian</option></select></label>
      <Field name="title" label="Judul" value={value?.title} />
      <Field name="opensAt" type="datetime-local" required={false} label={`Dibuka (opsional, ${deviceTimezone()})`} value={toLocalInput(settings?.opensAt)} />
      <Field name="closesAt" type="datetime-local" required={kind === "exam"} label={`Ditutup${kind === "exam" ? "" : " (opsional)"} (${deviceTimezone()})`} value={toLocalInput(settings?.closesAt)} />
      <Field name="timeLimitMinutes" type="number" required={kind === "exam"} min={1} max={600} step="1" label={`Batas waktu menit${kind === "exam" ? "" : " (opsional)"}`} value={settings?.timeLimitMinutes ?? ""} />
      {kind === "quiz" && <Field name="maxAttempts" type="number" min={1} max={10} step="1" label="Jumlah percobaan" value={settings?.maxAttempts ?? 1} />}
      <label className="learning-field"><span>Tampilan hasil untuk santri</span><select className="input" name="resultsVisibility" defaultValue={settings?.resultsVisibility ?? (kind === "exam" ? "after_close" : "after_submit")}>{Object.entries(visibilityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="learning-field"><span>Skema penilaian</span><select className="input" name="scoringMode" defaultValue={settings?.scoringMode ?? "all_or_nothing"}>{Object.entries(scoringLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="submission-confirm"><input type="checkbox" name="shuffleQuestions" defaultChecked={settings?.shuffleQuestions ?? true} /> Acak urutan soal per santri</label>
      <label className="submission-confirm"><input type="checkbox" name="shuffleOptions" defaultChecked={settings?.shuffleOptions ?? true} /> Acak urutan opsi per santri</label>
      <Field name="instructions" label="Instruksi" area max={20000} value={value?.instructions} />
      <div className="field-wide question-picker"><div className="learning-row"><strong>Pilih soal dari bank · {picked.length} soal · total {total} poin</strong><Search change={value => { setQ(value); setOffset(0); }} /></div>
        {bank.error ? <ErrorState message={bank.error} retry={bank.retry} /> : !bank.data ? <LoadingState /> : !bank.data.items.length ? <p className="learning-muted">Belum ada soal. Tambahkan soal di tab Bank soal.</p>
          : bank.data.items.map(question => {
            const item = picked.find(entry => entry.questionId === question.id);
            const written = question.type === "short_answer" || question.type === "essay";
            return <div className="picker-row" key={question.id}><label className="submission-confirm"><input type="checkbox" checked={Boolean(item)} onChange={() => toggle(question.id)} /><span><small className="text-muted">{typeLabels[question.type]}</small><br />{question.prompt}</span></label>
              {item && <label className="picker-points"><span>Poin</span><input className="input" type="number" min={0.01} max={1000} step="0.01" value={item.points} onChange={event => setPicked(items => items.map(entry => entry.questionId === question.id ? { ...entry, points: Number(event.target.value) } : entry))} /></label>}
              {written && item && value?.id && <Button type="button" className="button-secondary button-small" onClick={() => setRubricFor(rubricFor === question.id ? "" : question.id)}>Rubric</Button>}
              {rubricFor === question.id && value?.id && <RubricEditor courseId={courseId} activityId={value.id} questionId={question.id} onExpired={onExpired} />}</div>;
          })}
        {bank.data && <Pager offset={offset} next={bank.data.nextOffset} change={setOffset} />}
      </div>
      <div className="form-actions"><Button type="submit" disabled={pending || locked}>{pending ? "Menyimpan…" : "Simpan pengaturan & soal"}</Button></div>
    </fieldset>{error && <ErrorState message={error} />}</form>
    <p className="learning-muted">Publikasikan setelah soal dipilih. Poin sebagian menghitung pilihan benar; mode negatif mengurangi 25% poin per pilihan salah. Sisa waktu dihitung oleh server ({timezone}).</p>
  </Card>;
}

function RubricEditor({ courseId, activityId, questionId, onExpired }: { courseId: string; activityId: string; questionId: string; onExpired: () => void }) {
  const { data, error, retry } = useData<AssessmentRubric[]>(`${learningApi}/${courseId}/assessments/${activityId}/rubrics`, onExpired);
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([{ id: "criterion-1", label: "", description: "", maxPoints: 1 }]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded || !data) return;
    const existing = data.find(item => item.questionId === questionId);
    if (existing) { setTitle(existing.title); setCriteria(existing.criteria); }
    setLoaded(true);
  }, [data, loaded, questionId]);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  return <div className="rubric-editor field-wide"><strong>{data.some(item => item.questionId === questionId) ? "Edit rubric" : "Buat rubric"}</strong>
    <MutationForm path={`${learningApi}/${courseId}/assessments/${activityId}/rubric`} label="Simpan rubric" onExpired={onExpired} saved={() => setLoaded(false)} body={form => ({ questionId, title: form.get("rubricTitle"), criteria: criteria.map(criterion => ({ ...criterion, label: form.get(`label-${criterion.id}`), description: form.get(`description-${criterion.id}`), maxPoints: Number(form.get(`points-${criterion.id}`)) })) })}>
      <Field name="rubricTitle" label="Judul rubric" value={title} />
      {criteria.map((criterion, index) => <div className="picker-row" key={criterion.id}><Field name={`label-${criterion.id}`} label={`Kriteria ${index + 1}`} value={criterion.label} /><Field name={`description-${criterion.id}`} label="Deskripsi" value={criterion.description} /><Field name={`points-${criterion.id}`} label="Poin" type="number" min={0.01} max={1000} step="0.01" value={criterion.maxPoints} /></div>)}
    </MutationForm>
    <Button type="button" className="button-secondary button-small" onClick={() => setCriteria(items => [...items, { id: `criterion-${items.length + 1}`, label: "", description: "", maxPoints: 1 }])}>Tambah kriteria</Button>
  </div>;
}

export function QuestionBank({ courseId, onExpired }: Pick<Common, "courseId" | "onExpired">) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Question | "new" | null>(null);
  const [error, setError] = useState("");
  const params = new URLSearchParams({ q, offset: String(offset), ...(archived ? { archived: "1" } : {}) });
  const { data, error: loadError, retry } = useData<Page<Question>>(`${learningApi}/${courseId}/questions?${params}`, onExpired, revision);
  async function archive(question: Question) {
    setError("");
    try { await api(`${learningApi}/${courseId}/questions/${question.id}/archive`, json({ archived: !question.archived })); setRevision(value => value + 1); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
  }
  return <>
    {editor && <QuestionEditor key={editor === "new" ? "new" : editor.id} courseId={courseId} value={editor === "new" ? undefined : editor} close={() => setEditor(null)} saved={() => { setEditor(null); setRevision(value => value + 1); }} onExpired={onExpired} />}
    <Card><div className="card-heading"><h2>Bank soal</h2><div className="learning-actions"><label className="submission-confirm"><input type="checkbox" checked={archived} onChange={event => { setArchived(event.target.checked); setOffset(0); }} /> Tampilkan arsip</label><Search change={value => { setQ(value); setOffset(0); }} /><Button className="button-small" onClick={() => setEditor("new")}>Tambah soal</Button></div></div>
      {error && <ErrorState message={error} />}
      {loadError ? <ErrorState message={loadError} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState title="Belum ada soal" description={q ? "Tidak ada soal yang sesuai pencarian." : "Tambahkan soal pilihan ganda atau benar/salah untuk dipakai di quiz dan ujian."} />
        : <div className="question-list">{data.items.map(question => <article className="question-item" key={question.id}>
          <div className="learning-row"><span className="eyebrow text-muted">{typeLabels[question.type]} · dipakai {question.usage}×</span>{question.archived && <span className="badge badge-draft">Arsip</span>}</div>
          <p className="learning-prose">{question.prompt}</p>
          <ul className="option-list">{question.options.map(option => <li key={option.id} className={question.correct.includes(option.id) ? "option-correct" : ""}>{question.correct.includes(option.id) ? "✓ " : ""}{option.text}</li>)}</ul>
          {question.explanation && <p className="learning-muted">Pembahasan: {question.explanation}</p>}
          <div className="learning-actions">{!question.archived && <Button className="button-secondary button-small" onClick={() => setEditor(question)}>Edit soal</Button>}<Button className="button-secondary button-small" onClick={() => void archive(question)}>{question.archived ? "Pulihkan" : "Arsipkan"}</Button></div>
        </article>)}</div>}
      {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
    </Card>
  </>;
}

function QuestionEditor({ courseId, value, close, saved, onExpired }: { courseId: string; value?: undefined |Question; close: () => void; saved: () => void; onExpired: () => void }) {
  const [type, setType] = useState<QuestionType>(value?.type ?? "single_choice");
  const [optionsText, setOptionsText] = useState(value && value.type !== "true_false" ? value.options.map(option => option.text).join("\n") : "");
  const lines = type === "true_false" ? ["Benar", "Salah"] : optionsText.split("\n").map(line => line.trim()).filter(Boolean).slice(0, 10);
  return <Card className="admin-form-card"><div className="learning-row"><h2>{value ? "Edit soal" : "Tambah soal"}</h2><Button className="button-secondary button-small" onClick={close}>Batal</Button></div>
    <MutationForm path={`${learningApi}/${courseId}/questions${value ? `/${value.id}` : ""}`} method={value ? "PATCH" : "POST"} label="Simpan soal" onExpired={onExpired} saved={saved}
      body={form => ({ type, prompt: form.get("prompt"), explanation: form.get("explanation"), options: type === "true_false" || type === "short_answer" || type === "essay" ? undefined : lines, correct: type === "short_answer" || type === "essay" ? [] : form.getAll("correct") })}>
      <label className="learning-field"><span>Jenis soal</span><select className="input" value={type} onChange={event => setType(event.target.value as QuestionType)}>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <Field name="prompt" label="Pertanyaan" area max={5000} value={value?.prompt} />
      {type !== "true_false" && type !== "short_answer" && type !== "essay" && <label className="learning-field field-wide"><span>Opsi jawaban (satu per baris, 2–10 opsi)</span><textarea className="input" rows={5} value={optionsText} onChange={event => setOptionsText(event.target.value)} required /></label>}
      {type !== "short_answer" && type !== "essay" && <fieldset className="field-wide correct-options"><legend>{type === "multiple_choice" ? "Tandai semua jawaban benar" : "Pilih jawaban benar"}</legend>
        {lines.length < 2 ? <p className="learning-muted">Tulis minimal dua opsi.</p> : lines.map((line, index) => <label className="submission-confirm" key={`${type}-${index}-${line}`}><input type={type === "multiple_choice" ? "checkbox" : "radio"} name="correct" value={optionIds[index]} defaultChecked={value?.type === type && value.correct.includes(optionIds[index]!)} required={type !== "multiple_choice"} /> {line}</label>)}
      </fieldset>}
      <Field name="explanation" label="Pembahasan (opsional, tampil sesuai pengaturan hasil)" area required={false} max={2000} value={value?.explanation} />
    </MutationForm>
  </Card>;
}

function AttemptTable({ courseId, assessment, timezone, onExpired }: Common & { assessment: Assessment }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const [adjusting, setAdjusting] = useState("");
  const { data, error, retry } = useData<Page<AttemptRow>>(`${learningApi}/${courseId}/assessments/${assessment.id}/attempts?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired, revision);
  return <div className="submission-review"><div className="learning-row"><h4>Hasil santri · {assessment.title}</h4><Search change={value => { setQ(value); setOffset(0); }} /></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <EmptyState title="Belum ada percobaan" description="Percobaan santri akan tampil setelah mereka mulai mengerjakan." />
      : <div className="table-scroll" tabIndex={0} role="region" aria-label={`Hasil ${assessment.title}`}><table className="data-table"><thead><tr><th scope="col">Santri</th><th scope="col">Percobaan</th><th scope="col">Status</th><th scope="col">Nilai</th><th scope="col">Aksi</th></tr></thead><tbody>
        {data.items.map(attempt => <tr key={attempt.id}><td>{attempt.studentName}</td><td>{attempt.number}</td><td>{attempt.submittedAt ? `${attempt.submissionReason === "expired" ? "Waktu habis" : "Dikumpulkan"} · ${formatDateTime(attempt.submittedAt, timezone)}` : "Sedang mengerjakan"}</td><td>{attempt.score === null ? "—" : `${attempt.score} / ${attempt.maxScore}${attempt.adjusted ? " (dikoreksi)" : ""}`}</td>
          <td><div className="learning-actions"><a className="material-link" href={`/learning/courses/${courseId}/attempts/${attempt.id}`}>Lihat</a>{attempt.submittedAt && <Button className="button-secondary button-small" aria-expanded={adjusting === attempt.id} onClick={() => setAdjusting(adjusting === attempt.id ? "" : attempt.id)}>Koreksi nilai</Button>}</div></td></tr>)}
      </tbody></table></div>}
    {adjusting && data?.items.some(item => item.id === adjusting) && <AdjustForm courseId={courseId} attempt={data.items.find(item => item.id === adjusting)!} timezone={timezone} onExpired={onExpired} saved={() => { setAdjusting(""); setRevision(value => value + 1); }} />}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </div>;
}

function AdjustForm({ courseId, attempt, timezone, onExpired, saved }: Common & { attempt: AttemptRow; saved: () => void }) {
  const { data, error, retry } = useData<Page<ScoreAdjustment>>(`${learningApi}/${courseId}/attempts/${attempt.id}/adjustments`, onExpired);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  const latest = data.items[0];
  return <section className="submission-card"><h4>Koreksi nilai · {attempt.studentName} · percobaan {attempt.number}</h4>
    <MutationForm path={`${learningApi}/${courseId}/attempts/${attempt.id}/adjust`} label="Simpan koreksi" onExpired={onExpired} saved={saved} body={form => ({ score: Number(form.get("score")), reason: form.get("reason"), previousAdjustmentId: latest?.id ?? null })}>
      <Field name="score" type="number" min={0} max={attempt.maxScore} step="0.01" label={`Nilai (0–${attempt.maxScore})`} value={latest?.score ?? attempt.score ?? ""} />
      <Field name="reason" label="Alasan koreksi" area max={2000} />
    </MutationForm>
    {data.items.map(item => <div className="grade-entry" key={item.id}><strong>{item.score} / {attempt.maxScore}</strong><small>{item.graderName} · {formatDateTime(item.createdAt, timezone)}</small><p className="learning-prose">{item.reason}</p></div>)}
  </section>;
}
