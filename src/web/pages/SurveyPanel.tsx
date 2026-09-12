import { useState } from "react";
import type { Survey } from "../../shared/assessment";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState } from "../components/ui";
import { Field, learningApi as base, errorMessage, Status } from "../components/learning";

export function LessonSurveys({ courseId, lessonId, surveys, canManage, canParticipate, publishButton, archiveButton, changed, onExpired }: {
  courseId: string; lessonId: string; surveys: Survey[]; canManage: boolean; canParticipate: boolean;
  publishButton: (path: string, published: boolean, label: string) => React.ReactNode;
  archiveButton: (path: string, label: string) => React.ReactNode; changed: () => void; onExpired: () => void;
}) {
  const items = surveys.filter(item => item.lessonId === lessonId && !item.archived);
  const [creating, setCreating] = useState(false);
  return <Card className="lesson-card"><div className="learning-row"><h2>Survey & kuesioner</h2>{canManage && <Button className="button-secondary button-small" onClick={() => setCreating(value => !value)}>{creating ? "Batal" : "Tambah survey"}</Button>}</div>
    {creating && <SurveyCreator courseId={courseId} lessonId={lessonId} saved={() => { setCreating(false); changed(); }} onExpired={onExpired} />}
    {items.map(item => <SurveyItem key={item.id} courseId={courseId} item={item} canManage={canManage} canParticipate={canParticipate} publishButton={publishButton} archiveButton={archiveButton} changed={changed} onExpired={onExpired} />)}
    {!items.length && !creating && <p className="learning-muted">Belum ada survey atau kuesioner untuk lesson ini.</p>}
  </Card>;
}

function SurveyCreator({ courseId, lessonId, saved, onExpired }: { courseId: string; lessonId: string; saved: () => void; onExpired: () => void }) {
  const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(""); const form = new FormData(event.currentTarget); try {
    const created = await api<{ id: string }>(`${base}/${courseId}/surveys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, kind: form.get("kind"), title: form.get("title"), instructions: form.get("instructions") }) });
    await api(`${base}/${courseId}/surveys/${created.id}/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: [{ prompt: form.get("prompt"), type: "short_answer", required: form.get("required") === "on" }] }) }); saved();
  } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); } finally { setPending(false); }
  }
  return <form className="learning-form" onSubmit={event => void submit(event)}><fieldset className="admin-fields" disabled={pending}><Field name="title" label="Judul" /><label className="learning-field"><span>Jenis</span><select name="kind" className="input" defaultValue="survey"><option value="survey">Survey</option><option value="questionnaire">Kuesioner</option></select></label><Field name="instructions" label="Petunjuk" area required={false} max={20000} /><Field name="prompt" label="Pertanyaan pertama" area max={5000} /><label className="learning-field"><span><input name="required" type="checkbox" defaultChecked /> Wajib dijawab</span></label><div className="form-actions"><Button type="submit">{pending ? "Menyimpan…" : "Buat survey"}</Button></div></fieldset>{error && <ErrorState message={error} />}</form>;
}

function SurveyItem({ courseId, item, canManage, canParticipate, publishButton, archiveButton, changed, onExpired }: { courseId: string; item: Survey; canManage: boolean; canParticipate: boolean; publishButton: (path: string, published: boolean, label: string) => React.ReactNode; archiveButton: (path: string, label: string) => React.ReactNode; changed: () => void; onExpired: () => void }) {
  return <article className="activity-item"><div className="learning-row"><h3>{item.title}</h3>{canManage && <Status published={item.published} />}</div><p className="learning-muted">{item.kind === "questionnaire" ? "Kuesioner" : "Survey"}{item.responded ? " · Sudah dikirim" : ""}</p>{item.instructions && <p className="learning-prose">{item.instructions}</p>}{canManage && <div className="learning-actions">{publishButton(`activities/${item.id}`, item.published, item.title)}{archiveButton(`activities/${item.id}`, item.title)}</div>}{canParticipate && item.published && !item.responded && <SurveyResponse courseId={courseId} item={item} changed={changed} onExpired={onExpired} />}</article>;
}

function SurveyResponse({ courseId, item, changed, onExpired }: { courseId: string; item: Survey; changed: () => void; onExpired: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({}); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  function setAnswer(id: string, value: string | string[]) { setAnswers(current => ({ ...current, [id]: value })); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setPending(true); setError(""); try { await api(`${base}/${courseId}/surveys/${item.id}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) }); changed(); } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); } finally { setPending(false); } }
  return <form className="learning-form" onSubmit={event => void submit(event)}>{item.questions.map(question => <label className="learning-field field-wide" key={question.id}><span>{question.prompt}{question.required ? " *" : ""}</span>{question.type === "short_answer" ? <textarea className="input" rows={3} required={question.required} value={String(answers[question.id] ?? "")} onChange={event => setAnswer(question.id, event.target.value)} /> : question.options.map(option => { const selected = answers[question.id]; const values = Array.isArray(selected) ? selected : []; return <span key={option.id}><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={question.id} value={option.id} checked={question.type === "multiple_choice" ? values.includes(option.id) : selected === option.id} onChange={event => question.type === "multiple_choice" ? setAnswer(question.id, [...values, event.target.value].filter((value, index, all) => all.indexOf(value) === index)) : setAnswer(question.id, event.target.value)} /> {option.text}</span>; })}</label>)}<div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Mengirim…" : "Kirim respons"}</Button></div>{error && <ErrorState message={error} />}</form>;
}
