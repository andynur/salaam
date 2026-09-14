import { AgendaShortcut } from "./Calendar";
import { useEffect, useState } from "react";
import type { Actor } from "../../core/permissions";
import type { LearningTask } from "../../shared/learning";
import type { Level } from "../../shared/gamification";
import { ApiError, api } from "../lib/api";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon, type IconName } from "../components/icons";

interface DashboardData { academic: string | null; courses: number; classes: number; tasks: LearningTask[]; events: never[]; growth: { level: Level; badges: number } | null }
type DashboardRole = "admin" | "teacher" | "asmen" | "student";
interface DashboardAction { href: string; label: string; description: string; icon: IconName; permission: string }
interface DashboardExperience { role: DashboardRole; label: string; tone: string; intro: string; taskTitle: string; emptyTitle: string; emptyDescription: string; actions: DashboardAction[] }
const experiences: Record<DashboardRole, Omit<DashboardExperience, "role">> = {
  admin: {
    label: "Admin", tone: "badge-discovery", intro: "Pantau operasional sekolah dan lanjutkan pekerjaan yang paling penting.", taskTitle: "Prioritas operasional", emptyTitle: "Operasional terkendali", emptyDescription: "Sesi, penilaian, dan review yang perlu ditindaklanjuti akan tampil di sini.",
    actions: [
      { href: "/admin/users", label: "Kelola pengguna", description: "Akun, role, dan akses", icon: "users", permission: "admin.users.manage" },
      { href: "/admin/academic", label: "Kelola akademik", description: "Tahun, kelas, dan course", icon: "academic", permission: "academic.manage" },
      { href: "/reports", label: "Buka laporan", description: "Kehadiran dan progres", icon: "chart", permission: "reports.view" },
      { href: "/admin/audit", label: "Periksa audit", description: "Aktivitas penting sistem", icon: "shield", permission: "audit.view" },
    ],
  },
  teacher: {
    label: "Guru", tone: "", intro: "Fokus pada pembelajaran, kehadiran, dan pekerjaan santri yang menunggu tindak lanjut.", taskTitle: "Antrean mengajar", emptyTitle: "Tidak ada antrean mengajar", emptyDescription: "Jawaban, proyek, dan sesi kelas yang perlu ditindaklanjuti akan tampil di sini.",
    actions: [
      { href: "/learning", label: "Kelola pembelajaran", description: "Materi, aktivitas, dan nilai", icon: "book", permission: "learning.manage" },
      { href: "/attendance", label: "Catat kehadiran", description: "Buka agenda sesi hari ini", icon: "attendance", permission: "attendance.manage" },
      { href: "/projects", label: "Review proyek", description: "Pantau karya dan tim", icon: "board", permission: "learning.manage" },
      { href: "/reports", label: "Lihat laporan", description: "Progres course dan santri", icon: "chart", permission: "reports.view" },
    ],
  },
  asmen: {
    label: "Asisten Mentor", tone: "badge-gold", intro: "Dampingi sesi yang ditugaskan dan pastikan pencatatan kehadiran tetap lengkap.", taskTitle: "Agenda pendampingan", emptyTitle: "Tidak ada sesi yang menunggu", emptyDescription: "Sesi terjadwal dan berlangsung pada course dampingan akan tampil di sini.",
    actions: [
      { href: "/attendance", label: "Buka kehadiran", description: "Catat dan lengkapi dokumentasi", icon: "attendance", permission: "attendance.manage" },
      { href: "/calendar", label: "Lihat kalender", description: "Jadwal sekolah dan course", icon: "calendar", permission: "dashboard:view" },
      { href: "/reports", label: "Pantau laporan", description: "Kehadiran course dampingan", icon: "chart", permission: "reports.view" },
      { href: "/links", label: "Buka tautan", description: "Sumber daya sekolah", icon: "link", permission: "links.view" },
    ],
  },
  student: {
    label: "Santri", tone: "badge-success", intro: "Lanjutkan prioritas belajar, cek jadwal, dan jaga progres hari ini.", taskTitle: "Prioritas belajar", emptyTitle: "Semua prioritas selesai", emptyDescription: "Tugas, quiz, ujian, proyek, dan lesson berikutnya akan tampil di sini.",
    actions: [
      { href: "/learning", label: "Lanjutkan belajar", description: "Materi dan aktivitas course", icon: "book", permission: "learning.view" },
      { href: "/attendance", label: "Cek kehadiran", description: "Agenda dan absen QR", icon: "attendance", permission: "learning.view" },
      { href: "/projects", label: "Buka proyek", description: "Tugas tim dan portofolio", icon: "board", permission: "learning.view" },
      { href: "/gamification", label: "Lihat pertumbuhan", description: "Level, XP, dan lencana", icon: "star", permission: "learning.view" },
    ],
  },
};
export function dashboardExperience(actor: Actor): DashboardExperience {
  const role: DashboardRole = actor.roles.includes("admin") ? "admin" : actor.roles.includes("teacher") ? "teacher" : actor.roles.includes("asmen") ? "asmen" : "student";
  const experience = experiences[role];
  return { role, ...experience, actions: experience.actions.filter(action => actor.permissions.includes(action.permission)) };
}
const taskTypes: Record<LearningTask["type"], { label: string; icon: IconName; badge: string }> = {
  attendance: { label: "Sesi kelas", icon: "attendance", badge: "badge-discovery" },
  assignment: { label: "Kumpulkan tugas", icon: "assignment", badge: "" },
  quiz: { label: "Kerjakan quiz", icon: "quiz", badge: "badge-discovery" },
  exam: { label: "Kerjakan ujian", icon: "timer", badge: "badge-danger" },
  lesson: { label: "Lanjutkan belajar", icon: "book", badge: "badge-success" },
  grading: { label: "Perlu dinilai", icon: "pen", badge: "badge-gold" },
  challenge: { label: "Kerjakan proyek", icon: "board", badge: "badge-discovery" },
  review: { label: "Perlu direview", icon: "check", badge: "badge-gold" },
};
const taskHref = (task: LearningTask) => task.type === "attendance" ? `/attendance/courses/${task.courseId}/sessions/${task.id}` : task.type === "review" ? `/projects?${new URLSearchParams({ status: "submitted", challenge: task.id })}`
  : task.type === "challenge" && task.projectId ? `/projects/${task.projectId}`
  : `/learning/courses/${task.courseId}?${new URLSearchParams(task.type === "grading" ? { lesson: task.lessonId, review: task.id } : { lesson: task.lessonId })}`;
function greeting(timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}
export function Dashboard({ actor, timezone, onExpired }: { actor: Actor; timezone: string; onExpired: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
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
  const experience = dashboardExperience(actor);
  const taskMeta = (task: LearningTask) => task.type === "attendance" ? `Sesi kelas${task.dueAt ? ` · ${deadline(task.dueAt)}` : ""}` : task.type === "grading" ? `${task.pending} jawaban menunggu` : task.type === "review" ? `${task.pending} proyek menunggu review`
    : task.type === "lesson" ? "Lesson berikutnya"
    : task.dueAt ? `${task.type === "assignment" || task.type === "challenge" ? "Tenggat" : "Ditutup"} ${deadline(task.dueAt)}` : "Tanpa tenggat";
  const priorityCount = data?.tasks.reduce((total, task) => total + (task.type === "grading" || task.type === "review" ? task.pending : 1), 0) ?? 0;
  const attendanceCount = data?.tasks.filter(task => task.type === "attendance").length ?? 0;
  const groups = [{ key: "all", label: "Semua" }, ...Object.entries(taskTypes).filter(([type]) => data?.tasks.some(task => task.type === type)).map(([key, value]) => ({ key, label: value.label }))];
  const filteredTasks = data?.tasks.filter(task => filter === "all" || task.type === filter) ?? [];
  const visibleTasks = expanded ? filteredTasks : filteredTasks.slice(0, 5);
  const focus = data?.tasks[0];
  const workspaceTitle = { admin: "Kelola sekolah", teacher: "Ruang mengajar", asmen: "Ruang pendampingan", student: "Ruang belajar" }[experience.role];
  const stats: { icon: IconName; tone: string; label: string; value: string | number; hint: string }[] = !data ? [] : experience.role === "admin" ? [
    { icon: "calendar", tone: "stat-blue", label: "Tahun akademik", value: data.academic ?? "Belum diatur", hint: "Periode sekolah yang sedang berjalan." },
    { icon: "book", tone: "stat-purple", label: "Total course", value: data.courses, hint: "Seluruh course dalam pengelolaan." },
    { icon: "layers", tone: "stat-gold", label: "Total kelas", value: data.classes, hint: "Seluruh kelas dalam pengelolaan." },
  ] : experience.role === "teacher" ? [
    { icon: "book", tone: "stat-blue", label: "Course diajar", value: data.courses, hint: "Course yang menjadi tanggung jawab Anda." },
    { icon: "layers", tone: "stat-purple", label: "Kelas diajar", value: data.classes, hint: "Kelas dari course yang Anda ajar." },
    { icon: "inbox", tone: "stat-gold", label: "Perlu ditindaklanjuti", value: priorityCount, hint: "Penilaian, review, dan sesi aktif." },
  ] : experience.role === "asmen" ? [
    { icon: "book", tone: "stat-blue", label: "Course dampingan", value: data.courses, hint: "Course yang ditugaskan kepada Anda." },
    { icon: "layers", tone: "stat-purple", label: "Kelas dampingan", value: data.classes, hint: "Kelas dalam lingkup pendampingan." },
    { icon: "attendance", tone: "stat-gold", label: "Sesi pendampingan", value: attendanceCount, hint: "Sesi terjadwal atau berlangsung." },
  ] : [
    { icon: "book", tone: "stat-blue", label: "Course aktif", value: data.courses, hint: "Course terbit untuk kelas Anda." },
    { icon: "inbox", tone: "stat-purple", label: "Prioritas belajar", value: priorityCount, hint: "Pekerjaan yang dapat dilanjutkan sekarang." },
    { icon: data.growth ? "star" : "layers", tone: "stat-gold", label: data.growth ? "Level saat ini" : "Kelas", value: data.growth ? data.growth.level.level : data.classes, hint: data.growth ? `${data.growth.level.total} XP telah dikumpulkan.` : "Kelas aktif Anda." },
  ];
  return <>
    <PageHeader title="Dashboard" description={`${greeting(timezone)}, ${actor.displayName}. Mulai dengan Bismillah. ${experience.intro}`} actions={<div className="dashboard-header-actions"><span className={`badge ${experience.tone}`}>{experience.label}</span><span className="date-label"><Icon name="calendar" />{date}</span></div>} />
    {error ? <ErrorState message={error} retry={() => setAttempt(value => value + 1)} /> : !data ? <LoadingState /> : <>
      <div className="summary-grid">{stats.map(stat => <Card className="stat-card" key={stat.label}><span className={`stat-icon ${stat.tone}`} aria-hidden="true"><Icon name={stat.icon} size={20} /></span><div><span className="summary-label">{stat.label}</span><strong className="summary-value">{stat.value}</strong><p>{stat.hint}</p></div></Card>)}</div>
      {experience.actions.length > 0 && <section className="dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-title">
        <div className="dashboard-section-heading"><div><h2 id="dashboard-shortcuts-title">{workspaceTitle}</h2><p>Akses cepat untuk aktivitas {experience.role === "student" ? "belajar Anda" : "harian Anda"}.</p></div><span className={`badge ${experience.tone}`}>{experience.label}</span></div>
        <nav className="quick-action-grid" aria-label={`Akses cepat ${experience.label}`}>{experience.actions.map((action, index) => <a className="quick-action" href={action.href} key={action.href}>
          <span className={`quick-action-icon ${["stat-blue", "stat-purple", "stat-gold", "stat-blue"][index]}`} aria-hidden="true"><Icon name={action.icon} size={20} /></span>
          <span className="quick-action-copy"><strong>{action.label}</strong><small>{action.description}</small></span><Icon name="arrowRight" />
        </a>)}</nav>
      </section>}
      <div className="dashboard-grid">
        <Card><div className="card-heading"><h2>{experience.taskTitle}</h2>{data.tasks.length > 0 && <span className="badge badge-draft">{data.tasks.length} aktivitas</span>}</div>
          {groups.length > 2 && <div className="dashboard-task-filters" aria-label="Filter prioritas">{groups.map(group => <button type="button" key={group.key} className={`button button-small ${filter === group.key ? "button-primary" : "button-secondary"}`} aria-pressed={filter === group.key} onClick={() => { setFilter(group.key); setExpanded(false); }}>{group.label}<span>{group.key === "all" ? data.tasks.length : data.tasks.filter(task => task.type === group.key).length}</span></button>)}</div>}
          {!data.tasks.length ? <EmptyState icon="success" title={experience.emptyTitle} description={experience.emptyDescription} />
            : <ul className="task-list" id="dashboard-tasks">{visibleTasks.map(task => <li key={`${task.type}-${task.id}`}><a className="task-item" href={taskHref(task)}>
              <span className={`task-icon task-${task.type}`} aria-hidden="true"><Icon name={taskTypes[task.type].icon} /></span>
              <span className="task-body"><strong>{task.title}</strong><span className="task-meta">{task.courseName} · {taskMeta(task)}</span></span>
              <span className={`badge ${taskTypes[task.type].badge}`}>{taskTypes[task.type].label}</span>
            </a></li>)}</ul>}
          {filteredTasks.length > 5 && <div className="dashboard-list-control"><span role="status">{visibleTasks.length} dari {filteredTasks.length} aktivitas</span><button type="button" className="button button-secondary button-small" aria-expanded={expanded} aria-controls="dashboard-tasks" onClick={() => setExpanded(value => !value)}>{expanded ? "Tampilkan lebih sedikit" : "Lihat semua aktivitas"}<Icon name={expanded ? "chevronUp" : "chevronDown"} /></button></div>}
          {actor.permissions.includes("learning.view") && <a href={experience.role === "asmen" ? "/attendance" : "/learning"} className="card-footer-link">{experience.role === "asmen" ? "Buka Kehadiran" : "Buka Pembelajaran"}<Icon name="arrowRight" /></a>}
        </Card>
        <div className="dashboard-side">
          {focus && <Card className="dashboard-focus"><span className="dashboard-focus-label"><Icon name={taskTypes[focus.type].icon} />{experience.role === "admin" ? "Tindak lanjut operasional" : experience.role === "teacher" ? "Berikutnya untuk ditangani" : experience.role === "asmen" ? "Sesi untuk didampingi" : "Langkah belajar berikutnya"}</span><h2>{focus.title}</h2><p>{focus.courseName}</p><span className="task-meta">{taskMeta(focus)}</span><a className="button button-primary" href={taskHref(focus)}>{focus.type === "grading" ? "Mulai menilai" : focus.type === "review" ? "Review proyek" : focus.type === "attendance" ? "Buka sesi" : taskTypes[focus.type].label}<Icon name="arrowRight" /></a></Card>}
          {data.growth && <Card><div className="card-heading"><h2>Pertumbuhan</h2><span className="badge badge-gold">Level {data.growth.level.level}</span></div>
            <div className="growth-progress">
              <progress value={data.growth.level.nextAt === null ? 1 : data.growth.level.total - data.growth.level.levelAt}
                max={data.growth.level.nextAt === null ? 1 : data.growth.level.nextAt - data.growth.level.levelAt}
                aria-label={`Kemajuan level, ${data.growth.level.total} XP`} />
              <span className="growth-progress-meta">{data.growth.level.total} XP · {data.growth.badges} lencana</span>
            </div>
            <a href="/gamification" className="card-footer-link">Lihat pertumbuhan<Icon name="arrowRight" /></a>
          </Card>}
          <AgendaShortcut onExpired={onExpired} />
        </div>
      </div>
    </>}
  </>;
}
