import { useEffect, useState } from "react";
import type { Actor } from "../../core/permissions";
import type { LearningTask } from "../../shared/learning";
import { ApiError, api } from "../lib/api";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon, type IconName } from "../components/icons";

interface DashboardData { academic: string | null; courses: number; classes: number; tasks: LearningTask[]; events: never[] }
const taskTypes: Record<LearningTask["type"], { label: string; icon: IconName; badge: string }> = {
  assignment: { label: "Kumpulkan tugas", icon: "assignment", badge: "" },
  quiz: { label: "Kerjakan quiz", icon: "quiz", badge: "badge-discovery" },
  exam: { label: "Kerjakan ujian", icon: "timer", badge: "badge-danger" },
  lesson: { label: "Lanjutkan belajar", icon: "book", badge: "badge-success" },
  grading: { label: "Perlu dinilai", icon: "pen", badge: "badge-gold" },
};
const taskHref = (task: LearningTask) => `/learning/courses/${task.courseId}?${new URLSearchParams(task.type === "grading" ? { lesson: task.lessonId, review: task.id } : { lesson: task.lessonId })}`;
function greeting(timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}
export function Dashboard({ actor, timezone, onExpired }: { actor: Actor; timezone: string; onExpired: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(""); setData(null);
    api<DashboardData>("/api/dashboard").then(result => { if (active) setData(result); }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Dashboard tidak dapat dimuat.");
    });
    return () => { active = false; };
  }, [attempt, onExpired]);
  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: timezone }).format(new Date());
  const deadline = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  const taskMeta = (task: LearningTask) => task.type === "grading" ? `${task.pending} jawaban menunggu` : task.type === "lesson" ? "Lesson berikutnya"
    : task.dueAt ? `${task.type === "assignment" ? "Tenggat" : "Ditutup"} ${deadline(task.dueAt)}` : "Tanpa tenggat";
  const stats: { icon: IconName; tone: string; label: string; value: string | number; hint: string }[] = data ? [
    { icon: "calendar", tone: "stat-blue", label: "Tahun akademik", value: data.academic ?? "Belum diatur", hint: "Tahun ajaran sesuai tanggal sekolah saat ini." },
    { icon: "book", tone: "stat-purple", label: "Course", value: data.courses, hint: "Course dasar dalam akses Anda." },
    { icon: "layers", tone: "stat-gold", label: "Kelas", value: data.classes, hint: "Kelas dalam akses Anda." },
  ] : [];
  return <>
    <PageHeader title="Dashboard" description={`${greeting(timezone)}, ${actor.displayName}. Mari mulai langkah baik hari ini.`} actions={<span className="date-label"><Icon name="calendar" />{date}</span>} />
    {error ? <ErrorState message={error} retry={() => setAttempt(value => value + 1)} /> : !data ? <LoadingState /> : <>
      <div className="summary-grid">{stats.map(stat => <Card className="stat-card" key={stat.label}><span className={`stat-icon ${stat.tone}`} aria-hidden="true"><Icon name={stat.icon} size={20} /></span><div><span className="summary-label">{stat.label}</span><strong className="summary-value">{stat.value}</strong><p>{stat.hint}</p></div></Card>)}</div>
      <div className="dashboard-grid">
        <Card><div className="card-heading"><h2>Tugas hari ini</h2>{data.tasks.length > 0 && <span className="badge badge-draft">{data.tasks.length} tugas</span>}</div>
          {!data.tasks.length ? <EmptyState icon="success" title="Tidak ada yang menunggu" description={actor.permissions.includes("learning.manage") ? "Jawaban santri yang perlu dinilai akan tampil di sini." : "Tugas, quiz, ujian terbuka, dan lesson berikutnya akan tampil di sini."} />
            : <ul className="task-list">{data.tasks.map(task => <li key={`${task.type}-${task.id}`}><a className="task-item" href={taskHref(task)}>
              <span className={`task-icon task-${task.type}`} aria-hidden="true"><Icon name={taskTypes[task.type].icon} /></span>
              <span className="task-body"><strong>{task.title}</strong><span className="task-meta">{task.courseName} · {taskMeta(task)}</span></span>
              <span className={`badge ${taskTypes[task.type].badge}`}>{taskTypes[task.type].label}</span>
            </a></li>)}</ul>}
          {actor.permissions.includes("learning.view") && <a href="/learning" className="card-footer-link">Buka Pembelajaran<Icon name="arrowRight" /></a>}
        </Card>
        <Card><div className="card-heading"><h2>Agenda mendatang</h2><span className="badge badge-draft">Segera</span></div><EmptyState icon="calendar" title="Belum ada agenda" description="Jadwal akademik dan kegiatan sekolah akan hadir di ruang ini." /></Card>
      </div>
    </>}
  </>;
}
