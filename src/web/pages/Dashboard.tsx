import { useEffect, useState } from "react";
import type { Actor } from "../../core/permissions";
import type { LearningTask } from "../../shared/learning";
import { ApiError, api } from "../lib/api";
import { Card, EmptyState, ErrorState, LoadingState } from "../components/ui";

interface DashboardData { academic: string | null; courses: number; classes: number; tasks: LearningTask[]; events: never[] }
const taskLabels: Record<LearningTask["type"], string> = { assignment: "Kumpulkan tugas", lesson: "Lanjutkan belajar", grading: "Perlu dinilai" };
const taskHref = (task: LearningTask) => `/learning/courses/${task.courseId}?${new URLSearchParams(task.type === "grading" ? { lesson: task.lessonId, review: task.id } : { lesson: task.lessonId })}`;
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
  const taskMeta = (task: LearningTask) => task.type === "grading" ? `${task.pending} jawaban menunggu` : task.type === "assignment" ? task.dueAt ? `Tenggat ${deadline(task.dueAt)}` : "Tanpa tenggat" : "Lesson berikutnya";
  return <>
    <div className="breadcrumb">Workspace <span aria-hidden="true">/</span> <strong>Dashboard</strong></div>
    <div className="page-heading"><div><span className="eyebrow text-muted">RUANG BELAJAR ANDA</span><h1>Dashboard</h1><p>Selamat datang, {actor.displayName}. Mari mulai langkah baik hari ini.</p></div><span className="date-label">{date}</span></div>
    {error ? <ErrorState message={error} retry={() => setAttempt(value => value + 1)} /> : !data ? <LoadingState /> : <>
      <div className="welcome-banner"><div><span className="badge badge-gold">AWAL PERJALANAN</span><h2>Ruang belajar kita, mulai dari sini.</h2><p>Pembelajaran, aktivitas, dan karya santri akan terhubung dalam satu ruang.</p></div><div className="banner-art" aria-hidden="true"><span>01</span><small>BELAJAR · BERKARYA · BERTUMBUH</small></div></div>
      <div className="summary-grid"><Card><span className="summary-label">Tahun akademik</span><strong className="summary-value">{data.academic ?? "Belum diatur"}</strong><p>Tahun ajaran sesuai tanggal sekolah saat ini.</p></Card><Card><span className="summary-label">Courses</span><strong className="summary-value">{data.courses}</strong><p>Course dasar dalam akses Anda.</p></Card><Card><span className="summary-label">Kelas</span><strong className="summary-value">{data.classes}</strong><p>Kelas dalam akses Anda.</p></Card></div>
      <div className="dashboard-grid"><Card><div className="card-heading"><h2>Tugas hari ini</h2><span className="badge">Today's Tasks</span></div>
        {!data.tasks.length ? <EmptyState symbol="✓" title="Tidak ada yang menunggu" description={actor.permissions.includes("learning.manage") ? "Jawaban santri yang perlu dinilai akan tampil di sini." : "Tugas terbuka dan lesson berikutnya akan tampil di sini."} />
          : <ul className="task-list">{data.tasks.map(task => <li key={`${task.type}-${task.id}`}><a className="task-item" href={taskHref(task)}><span className={`task-type task-${task.type}`}>{taskLabels[task.type]}</span><strong>{task.title}</strong><span className="task-meta">{task.courseName} · {taskMeta(task)}</span></a></li>)}</ul>}
        {actor.permissions.includes("learning.view") && <a href="/learning" className="dashboard-learning-link">Buka Pembelajaran →</a>}</Card>
        <Card><div className="card-heading"><h2>Agenda mendatang</h2><span className="calendar-icon" aria-hidden="true">▦</span></div><EmptyState title="Belum ada agenda" description="Jadwal akademik dan kegiatan sekolah akan hadir di ruang ini." /></Card></div>
      <div className="dashboard-footer"><span>Setiap langkah kecil adalah bagian dari perjalanan besar.</span><span>HSI BOARDING SCHOOL</span></div>
    </>}
  </>;
}
