import { useState } from "react";
import type { Actor } from "../../core/permissions";
import type { Badge, GrowthSummary, LeaderboardRow, RewardRule, RewardRuleKey } from "../../shared/gamification";
import { badgeCriteria, badgeIcons } from "../../shared/gamification";
import type { Page } from "../../shared/learning";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Field, MutationForm, Pager, Search, formatDateTime, useData } from "../components/learning";
import { Icon, type IconName } from "../components/icons";

const ruleLabels: Record<RewardRuleKey, string> = {
  "lesson.completed": "Pelajaran selesai",
  "assignment.graded": "Tugas dinilai",
  "assessment.completed": "Kuis atau ujian selesai",
  "project.approved": "Proyek disetujui",
};
const criterionLabels: Record<Badge["criterion"], string> = {
  xp_total: "Total XP",
  lessons_completed: "Pelajaran selesai",
  assignments_graded: "Tugas dinilai",
  assessments_completed: "Kuis atau ujian selesai",
  projects_approved: "Proyek disetujui",
};

function LevelCard({ summary }: { summary: GrowthSummary }) {
  const { level } = summary;
  const earned = summary.badges.filter(badge => badge.earnedAt).length;
  const span = level.nextAt === null ? 0 : level.nextAt - level.levelAt;
  return <Card className="growth-level">
    <div className="growth-level-main">
      <span className="growth-level-mark" aria-hidden="true"><Icon name="star" size={20} /></span>
      <div>
        <span className="summary-label">Level {level.level}</span>
        <strong className="summary-value">{level.total} XP</strong>
        <p>{level.nextAt === null ? "Level tertinggi tercapai." : `${level.nextAt - level.total} XP lagi menuju level ${level.level + 1}.`}</p>
      </div>
    </div>
    <div className="growth-progress">
      <progress value={span ? level.total - level.levelAt : 1} max={span || 1} aria-label={`Kemajuan menuju level berikutnya, ${level.total} XP`} />
      <span className="growth-progress-meta">{earned} dari {summary.badges.length} lencana</span>
    </div>
  </Card>;
}

function BadgeGrid({ badges }: { badges: Badge[] }) {
  if (!badges.length) return <EmptyState icon="star" title="Belum ada lencana" description="Lencana akan terbuka saat Anda menyelesaikan pelajaran, tugas, dan proyek." />;
  return <ul className="award-grid">{badges.map(badge => <li key={badge.id} className={`award-tile ${badge.earnedAt ? "" : "is-locked"}`}>
    <span className="award-icon" aria-hidden="true"><Icon name={badge.icon as IconName} size={20} /></span>
    <div className="award-text">
      <strong>{badge.name}</strong>
      <p>{badge.description}</p>
      <span className="award-meta">{badge.earnedAt ? "Diraih" : `${Math.min(badge.progress, badge.threshold)} dari ${badge.threshold} · ${criterionLabels[badge.criterion]}`}</span>
    </div>
  </li>)}</ul>;
}

function GrowthView({ path, timezone, onExpired }: { path: string; timezone: string; onExpired: () => void }) {
  const { data, error, retry } = useData<GrowthSummary>(path, onExpired);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  return <>
    <LevelCard summary={data} />
    <div className="dashboard-grid">
      <Card><div className="card-heading"><h2>Riwayat XP</h2><span className="badge badge-draft">{data.entries.length} terbaru</span></div>
        {!data.entries.length ? <EmptyState icon="history" title="Belum ada XP" description="XP tercatat saat pelajaran, tugas, kuis, dan proyek selesai." />
          : <ul className="task-list">{data.entries.map(entry => <li key={entry.id}><div className="xp-row">
            <span className="task-body"><strong>{ruleLabels[entry.ruleKey]}</strong><span className="task-meta">{entry.courseName ?? "Tanpa course"} · {formatDateTime(entry.awardedAt, timezone)}</span></span>
            <span className="badge badge-gold">+{entry.points} XP</span>
          </div></li>)}</ul>}
      </Card>
      <Card><div className="card-heading"><h2>Lencana</h2></div><BadgeGrid badges={data.badges} /></Card>
    </div>
  </>;
}

function Leaderboard({ actor, onExpired }: { actor: Actor; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [student, setStudent] = useState<LeaderboardRow | null>(null);
  const { data, error, retry } = useData<Page<LeaderboardRow>>(`/api/gamification/leaderboard?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  if (student) return <>
    <div className="filter-bar"><Button className="button-secondary button-small" onClick={() => setStudent(null)}><Icon name="chevronLeft" />Kembali ke peringkat</Button></div>
    <PageHeader title={student.studentName} description={`${student.className} · ${student.total} XP`} />
    <GrowthView path={`/api/gamification/students/${student.studentId}`} timezone={Intl.DateTimeFormat().resolvedOptions().timeZone} onExpired={onExpired} />
  </>;
  return <Card>
    <div className="card-heading"><h2>Peringkat kelas</h2><div className="card-tools"><Search change={value => { setQ(value); setOffset(0); }} /></div></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="users" title="Belum ada santri" description={actor.permissions.includes("learning.manage.all") ? "Santri akan muncul setelah terdaftar di kelas." : "Santri di kelas yang Anda ajar akan muncul di sini."} />
      : <><div className="table-scroll"><table className="data-table">
        <thead><tr><th scope="col">Santri</th><th scope="col">Kelas</th><th scope="col">Total XP</th><th scope="col">Lencana</th><th scope="col"><span className="visually-hidden">Aksi</span></th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.studentId}>
          <td><strong className="table-link">{row.studentName}</strong></td>
          <td>{row.className}</td>
          <td>{row.total} XP</td>
          <td>{row.badges}</td>
          <td><Button className="button-secondary button-small" onClick={() => setStudent(row)}>Lihat</Button></td>
        </tr>)}</tbody>
      </table></div>
      <Pager offset={offset} next={data.nextOffset} change={setOffset} /></>}
  </Card>;
}

function RewardRules({ onExpired }: { onExpired: () => void }) {
  const [revision, setRevision] = useState(0);
  const { data, error, retry } = useData<RewardRule[]>("/api/gamification/rules", onExpired, revision);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  return <Card>
    <div className="card-heading"><h2>Aturan XP</h2></div>
    <p className="card-hint">XP yang sudah tercatat tidak berubah saat aturan diubah; aturan baru berlaku untuk perolehan berikutnya.</p>
    <ul className="task-list">{data.map(rule => <li key={rule.key}><div className="rule-row">
      <span className="task-body"><strong>{ruleLabels[rule.key]}</strong><span className="task-meta">{rule.description}</span></span>
      <MutationForm path={`/api/gamification/rules/${rule.key}`} method="PATCH" label="Simpan" onExpired={onExpired}
        body={form => ({ points: Number(form.get("points")) })} saved={() => setRevision(value => value + 1)}>
        <Field label="XP" name="points" type="number" value={rule.points} min={0} max={1000} step="1" />
      </MutationForm>
    </div></li>)}</ul>
  </Card>;
}

function BadgeCatalogue({ onExpired }: { onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Badge | "new" | null>(null);
  const { data, error, retry } = useData<Page<Badge>>(`/api/gamification/badges?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired, revision);
  const badge = editing === "new" ? null : editing;
  return <Card>
    <div className="card-heading"><h2>Katalog lencana</h2><div className="card-tools"><Search change={value => { setQ(value); setOffset(0); }} />
      <Button className="button-small" onClick={() => setEditing(editing ? null : "new")} aria-expanded={editing !== null}>{editing ? "Tutup" : "Tambah lencana"}</Button></div></div>
    {editing !== null && <div className="admin-form-card">
      <MutationForm key={badge?.id ?? "new"} path={badge ? `/api/gamification/badges/${badge.id}` : "/api/gamification/badges"} method={badge ? "PATCH" : "POST"}
        label={badge ? "Simpan lencana" : "Tambah lencana"} onExpired={onExpired}
        body={form => ({
          key: String(form.get("key") ?? ""), name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""),
          icon: String(form.get("icon") ?? ""), criterion: String(form.get("criterion") ?? ""),
          threshold: Number(form.get("threshold")), active: form.get("active") === "on",
        })}
        saved={() => { setEditing(null); setRevision(value => value + 1); }}>
        <Field label="Kode" name="key" value={badge?.key} max={40} />
        <Field label="Nama" name="name" value={badge?.name} max={80} />
        <Field label="Deskripsi" name="description" value={badge?.description} max={300} area />
        <label className="learning-field"><span>Ikon</span>
          <select className="input" name="icon" defaultValue={badge?.icon ?? "star"}>{badgeIcons.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label>
        <label className="learning-field"><span>Kriteria</span>
          <select className="input" name="criterion" defaultValue={badge?.criterion ?? "xp_total"}>{badgeCriteria.map(criterion => <option key={criterion} value={criterion}>{criterionLabels[criterion]}</option>)}</select></label>
        <Field label="Target" name="threshold" type="number" value={badge?.threshold ?? 1} min={1} max={100000} step="1" />
        <label className="learning-field"><span>Aktif</span>
          <input className="input" type="checkbox" name="active" defaultChecked={badge?.active ?? true} /></label>
      </MutationForm>
    </div>}
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="star" title="Belum ada lencana" description="Tambahkan lencana untuk menandai pencapaian santri." action={<Button onClick={() => setEditing("new")}>Tambah lencana</Button>} />
      : <><div className="table-scroll"><table className="data-table">
        <thead><tr><th scope="col">Lencana</th><th scope="col">Kriteria</th><th scope="col">Target</th><th scope="col">Diraih</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Aksi</span></th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}>
          <td><strong className="table-link">{row.name}</strong><span className="table-sub">{row.key}</span></td>
          <td>{criterionLabels[row.criterion]}</td>
          <td>{row.threshold}</td>
          <td>{row.progress} santri</td>
          <td><span className={`badge ${row.active ? "badge-success" : "badge-draft"}`}>{row.active ? "Aktif" : "Nonaktif"}</span></td>
          <td><Button className="button-secondary button-small" onClick={() => setEditing(row)}>Ubah</Button></td>
        </tr>)}</tbody>
      </table></div>
      <Pager offset={offset} next={data.nextOffset} change={setOffset} /></>}
  </Card>;
}

export function Growth({ actor, timezone, onExpired }: { actor: Actor; timezone: string; onExpired: () => void }) {
  const can = (permission: string) => actor.permissions.includes(permission);
  const tabs = [
    ...(can("learning.participate") ? [{ id: "me", label: "Pertumbuhan saya" }] : []),
    ...(can("learning.manage") ? [{ id: "leaderboard", label: "Peringkat santri" }] : []),
    ...(can("academic.manage") ? [{ id: "rules", label: "Aturan & lencana" }] : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id ?? "me");
  const active = tabs.some(item => item.id === tab) ? tab : tabs[0]?.id ?? "me";
  return <>
    <PageHeader title="Pertumbuhan" description="XP, level, dan lencana dari pembelajaran, penilaian, dan proyek." />
    {tabs.length > 1 && <nav className="tabs" aria-label="Bagian pertumbuhan">{tabs.map(item =>
      <button key={item.id} type="button" className={item.id === active ? "tab-active" : ""} aria-current={item.id === active ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>}
    {active === "me" ? (can("learning.participate")
      ? <GrowthView path="/api/gamification/me" timezone={timezone} onExpired={onExpired} />
      : <EmptyState icon="star" title="Belum ada XP" description="XP dan lencana dikumpulkan oleh santri melalui pembelajaran dan proyek." />)
      : active === "leaderboard" ? <Leaderboard actor={actor} onExpired={onExpired} />
      : <div className="dashboard-side"><RewardRules onExpired={onExpired} /><BadgeCatalogue onExpired={onExpired} /></div>}
  </>;
}
