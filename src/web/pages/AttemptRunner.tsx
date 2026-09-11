import { useCallback, useEffect, useRef, useState } from "react";
import type { AttemptDetail, AttemptQuestion } from "../../shared/assessment";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { errorMessage, formatDateTime, learningApi } from "../components/learning";

type Answer = { selected: string[]; revision: number };
type Sync = "saved" | "saving" | "offline" | "error";
const syncLabels: Record<Sync, string> = { saved: "Semua jawaban tersimpan", saving: "Menyimpan…", offline: "Koneksi terputus. Jawaban disimpan di perangkat dan dikirim ulang otomatis.", error: "Sebagian jawaban ditolak server. Periksa pilihan Anda." };
const storageKey = (attemptId: string) => `learning-os:attempt:${attemptId}`;
// Unsynced answers survive reloads and dropped connections on this device.
function readPending(attemptId: string): Record<string, Answer> {
  try { return JSON.parse(localStorage.getItem(storageKey(attemptId)) ?? "{}") as Record<string, Answer>; } catch { return {}; }
}
function writePending(attemptId: string, pending: Record<string, Answer>) {
  try { if (Object.keys(pending).length) localStorage.setItem(storageKey(attemptId), JSON.stringify(pending)); else localStorage.removeItem(storageKey(attemptId)); } catch { /* storage unavailable */ }
}
function clock(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function AttemptRunner({ courseId, attemptId, timezone, onExpired }: { courseId: string; attemptId: string; timezone: string; onExpired: () => void }) {
  const base = `${learningApi}/${courseId}/attempts/${attemptId}`;
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sync, setSync] = useState<Sync>("saved");
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const offset = useRef(0);
  const pending = useRef<Record<string, Answer>>(readPending(attemptId));
  const flushing = useRef(false);
  const autoSubmitted = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const detail = await api<AttemptDetail>(base);
      // The server clock is authoritative; the countdown only corrects for device drift.
      offset.current = new Date(detail.serverNow).getTime() - Date.now();
      if (!detail.canAnswer) { pending.current = {}; if (detail.submittedAt) writePending(attemptId, {}); }
      setAnswers(Object.fromEntries(detail.questions.map(question => {
        const local = pending.current[question.questionId];
        return [question.questionId, local && local.revision > question.revision ? local : { selected: question.selected, revision: question.revision }];
      })));
      setAttempt(detail);
      return detail;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(errorMessage(cause));
      return null;
    }
  }, [base, attemptId, onExpired]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current) return false;
    flushing.current = true;
    try {
      while (Object.keys(pending.current).length) {
        const [questionId, answer] = Object.entries(pending.current)[0]!;
        setSync("saving");
        try {
          const saved = await api<{ revision: number }>(`${base}/answers`, json({ questionId, ...answer }));
          if ((pending.current[questionId]?.revision ?? 0) <= saved.revision) delete pending.current[questionId];
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) { onExpired(); return false; }
          // Submitted or expired on the server: stop retrying and show the final state.
          if (cause instanceof ApiError && cause.status === 409) { pending.current = {}; writePending(attemptId, {}); await load(); return false; }
          if (cause instanceof ApiError && cause.status > 0) { delete pending.current[questionId]; writePending(attemptId, pending.current); setSync("error"); continue; }
          setSync("offline");
          return false;
        }
        writePending(attemptId, pending.current);
      }
      setSync(current => current === "error" ? "error" : "saved");
      return true;
    } finally { flushing.current = false; }
  }, [base, attemptId, load, onExpired]);

  const submit = useCallback(async (automatic: boolean) => {
    if (!automatic && !confirm("Kumpulkan jawaban sekarang? Jawaban tidak dapat diubah setelah dikumpulkan.")) return;
    setSubmitting(true); setError("");
    try {
      const synced = await flush();
      if (!synced && Object.keys(pending.current).length && !automatic) { setError("Masih ada jawaban yang belum tersimpan. Periksa koneksi lalu coba lagi."); return; }
      await api(`${base}/submit`, json({}));
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(errorMessage(cause));
    } finally { setSubmitting(false); }
  }, [base, flush, load, onExpired]);

  useEffect(() => { void load().then(detail => { if (detail?.canAnswer) void flush(); }); }, [load, flush]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const retry = setInterval(() => { if (Object.keys(pending.current).length) void flush(); }, 3000);
    const online = () => void flush();
    addEventListener("online", online);
    return () => { clearInterval(tick); clearInterval(retry); removeEventListener("online", online); };
  }, [flush]);
  const left = attempt?.deadlineAt ? new Date(attempt.deadlineAt).getTime() - (now + offset.current) : null;
  useEffect(() => {
    if (attempt?.canAnswer && left !== null && left <= 0 && !autoSubmitted.current) { autoSubmitted.current = true; void submit(true); }
  }, [attempt, left, submit]);

  function choose(question: AttemptQuestion, optionId: string) {
    const current = answers[question.questionId] ?? { selected: [], revision: 0 };
    const selected = question.type === "multiple_choice"
      ? current.selected.includes(optionId) ? current.selected.filter(id => id !== optionId) : [...current.selected, optionId].sort()
      : [optionId];
    const next = { selected, revision: current.revision + 1 };
    setAnswers(value => ({ ...value, [question.questionId]: next }));
    pending.current[question.questionId] = next;
    writePending(attemptId, pending.current);
    void flush();
  }

  const crumbs = [{ label: "Pembelajaran", href: "/learning" }, { label: "Course", href: `/learning/courses/${courseId}` }];
  if (error && !attempt) return <><PageHeader breadcrumbs={crumbs} title="Percobaan" /><ErrorState message={error} retry={() => void load()} /></>;
  if (!attempt) return <LoadingState />;
  const answering = attempt.canAnswer;
  const answered = attempt.questions.filter(question => (answers[question.questionId]?.selected.length ?? 0) > 0).length;
  const heading = answering ? "Kerjakan soal" : attempt.submittedAt ? "Hasil pengerjaan" : `Pengerjaan ${attempt.studentName}`;
  const summary = attempt.submittedAt
    ? `${attempt.studentName} · dikumpulkan ${formatDateTime(attempt.submittedAt, timezone)}${attempt.submissionReason === "expired" ? " (otomatis saat waktu habis)" : ""}.`
    : answering ? "Jawaban tersimpan otomatis setiap kali Anda memilih." : "Santri masih mengerjakan. Tampilan ini hanya untuk melihat.";
  return <>
    <PageHeader breadcrumbs={crumbs} title={heading} description={`Percobaan ke-${attempt.number} · ${summary}`} />
    {error && <ErrorState message={error} />}
    {!answering && <Card className="lesson-card attempt-result">{attempt.scoreVisible && attempt.score !== null
      ? <><span className="summary-label">Nilai</span><strong className="summary-value">{attempt.score} / {attempt.maxScore}</strong>{attempt.adjusted && <p className="learning-muted">Nilai telah dikoreksi guru.</p>}</>
      : <p className="learning-muted">{attempt.submittedAt ? "Nilai dan pembahasan akan tampil sesuai pengaturan guru." : "Nilai tersedia setelah attempt selesai."}</p>}</Card>}
    {answering && <div className="attempt-bar" role="status"><span role="timer" className={left !== null && left < 60000 ? "attempt-timer attempt-timer-low" : "attempt-timer"}>{left === null ? "Tanpa batas waktu" : `Sisa waktu ${clock(left)}`}</span><span>{answered} / {attempt.questions.length} dijawab</span><span className={`sync-status sync-${sync}`}>{syncLabels[sync]}</span></div>}
    <div className="attempt-questions">{attempt.questions.map((question, index) => {
      const selected = answers[question.questionId]?.selected ?? [];
      return <Card className="lesson-card attempt-question" key={question.questionId}><fieldset disabled={!answering || submitting}>
        <legend><span className="eyebrow text-muted">SOAL {index + 1} · {question.points} POIN · {question.type === "multiple_choice" ? "PILIH SEMUA YANG BENAR" : "PILIH SATU"}</span><span className="learning-prose">{question.prompt}</span></legend>
        {question.options.map(option => {
          const mark = !answering && question.correct ? question.correct.includes(option.id) ? " option-correct" : selected.includes(option.id) ? " option-wrong" : "" : "";
          return <label className={`option-row${mark}`} key={option.id}><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={`question-${question.questionId}`} checked={selected.includes(option.id)} onChange={() => choose(question, option.id)} /><span>{option.text}</span></label>;
        })}
        {question.awarded !== null && <p className="learning-muted">Poin: {question.awarded} / {question.points}</p>}
        {question.explanation && <p className="learning-prose attempt-explanation">{question.explanation}</p>}
      </fieldset></Card>;
    })}</div>
    {answering && <div className="learning-toolbar"><Button disabled={submitting} onClick={() => void submit(false)}>{submitting ? "Mengumpulkan…" : "Kumpulkan jawaban"}</Button><p>Pastikan semua jawaban tersimpan sebelum mengumpulkan.</p></div>}
  </>;
}
