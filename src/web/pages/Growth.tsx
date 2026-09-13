import { useRef, useState } from "react";
import type { Actor } from "../../core/permissions";
import type { Badge, GrowthSummary, LeaderboardRow, RewardRule, RewardRuleKey } from "../../shared/gamification";
import { badgeCriteria, badgeIcons } from "../../shared/gamification";
import type { Page } from "../../shared/learning";
import type { ReportFilterOptions } from "../../shared/reporting";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, PersonName, gradeOf, initials, personTone } from "../components/ui";
import { Field, MutationForm, Pager, Search, formatDateTime, useData } from "../components/learning";
import { Icon, type IconName } from "../components/icons";

const ruleLabels: Record<RewardRuleKey, string> = {
  "lesson.completed": "Pelajaran selesai",
  "assignment.graded": "Tugas dinilai",
  "assessment.completed": "Kuis atau ujian selesai",
  "project.approved": "Proyek disetujui",
};
const ruleIcons: Record<RewardRuleKey, IconName> = {
  "lesson.completed": "book",
  "assignment.graded": "assignment",
  "assessment.completed": "quiz",
  "project.approved": "briefcase",
};
const criterionLabels: Record<Badge["criterion"], string> = {
  xp_total: "Total XP",
  lessons_completed: "Pelajaran selesai",
  assignments_graded: "Tugas dinilai",
  assessments_completed: "Kuis atau ujian selesai",
  projects_approved: "Proyek disetujui",
};
const grades = ["X", "XI", "XII", "Lainnya"];
const percentOf = (value: number, max: number) => max > 0 ? Math.max(0, Math.min(100, Math.round(value / max * 100))) : 0;

function LevelCard({ summary }: { summary: GrowthSummary }) {
  const { level } = summary;
  const earned = summary.badges.filter(badge => badge.earnedAt).length;
  const top = level.nextAt === null;
  const percent = top ? 100 : percentOf(level.total - level.levelAt, level.nextAt! - level.levelAt);
  return <Card className="growth-level">
    <div className="growth-level-main">
      <span className="growth-level-mark" aria-hidden="true">{level.level}</span>
      <div>
        <span className="summary-label">Level {level.level}</span>
        <strong className="summary-value">{level.total} XP</strong>
        <p>{top ? "Level tertinggi tercapai." : `${level.nextAt! - level.total} XP lagi menuju level ${level.level + 1}.`}</p>
      </div>
    </div>
    <div className="growth-progress">
      <div className="growth-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Kemajuan menuju level berikutnya"><span style={{ width: `${percent}%` }} /></div>
      <span className="growth-progress-meta"><span>{top ? "Level maksimal" : `${percent}% menuju level ${level.level + 1}`}</span><span>{earned} dari {summary.badges.length} lencana</span></span>
    </div>
  </Card>;
}

function BadgeGrid({ badges }: { badges: Badge[] }) {
  if (!badges.length) return <EmptyState icon="star" title="Belum ada lencana" description="Lencana akan terbuka saat Anda menyelesaikan pelajaran, tugas, dan proyek." />;
  // Earned badges first; within each group the catalogue order stays.
  const sorted = [...badges].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)));
  return <ul className="award-grid">{sorted.map(badge => <li key={badge.id} className={`award-tile ${badge.earnedAt ? "is-earned" : "is-locked"}`}>
    <span className="award-icon" aria-hidden="true"><Icon name={(badge.earnedAt ? badge.icon : "lock") as IconName} size={18} /></span>
    <div className="award-text">
      <strong>{badge.name}</strong>
      <p>{badge.description}</p>
      <span className="award-meta">{badge.earnedAt ? "Diraih" : `${Math.min(badge.progress, badge.threshold)} dari ${badge.threshold} · ${criterionLabels[badge.criterion]}`}</span>
      {!badge.earnedAt && <span className="award-meter" aria-hidden="true"><span style={{ width: `${percentOf(badge.progress, badge.threshold)}%` }} /></span>}
    </div>
  </li>)}</ul>;
}

function GrowthView({ path, timezone, onExpired }: { path: string; timezone: string; onExpired: () => void }) {
  const { data, error, retry } = useData<GrowthSummary>(path, onExpired);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  const earned = data.badges.filter(badge => badge.earnedAt).length;
  return <>
    <LevelCard summary={data} />
    <div className="dashboard-grid">
      <Card><div className="card-heading"><h2>Riwayat XP</h2><span className="badge badge-draft">{data.entries.length} terbaru</span></div>
        {!data.entries.length ? <EmptyState icon="history" title="Belum ada XP" description="XP tercatat saat pelajaran, tugas, kuis, dan proyek selesai." />
          : <ul className="task-list">{data.entries.map(entry => <li key={entry.id}><div className="xp-row">
            <span className="xp-row-main"><span className="xp-icon" aria-hidden="true"><Icon name={ruleIcons[entry.ruleKey]} /></span>
              <span className="task-body"><strong>{ruleLabels[entry.ruleKey]}</strong><span className="task-meta">{entry.courseName ?? "Tanpa course"} · {formatDateTime(entry.awardedAt, timezone)}</span></span></span>
            <span className="badge badge-gold">+{entry.points} XP</span>
          </div></li>)}</ul>}
      </Card>
      <Card><div className="card-heading"><h2>Lencana</h2><span className="badge badge-gold">{earned} dari {data.badges.length} diraih</span></div><BadgeGrid badges={data.badges} /></Card>
    </div>
  </>;
}

// Class options come from the report filters, grouped by grade. Only actors who can view
// reports get the filter; the leaderboard API already scopes what each actor sees.
function ClassFilter({ value, change, onExpired }: { value: string | null; change: (classId: string | null) => void; onExpired: () => void }) {
  const { data } = useData<ReportFilterOptions>("/api/reports/filters", onExpired);
  if (!data?.classes.length) return null;
  const yearName = (id: string | null) => data.years.find(year => year.id === id)?.name;
  const label = (item: ReportFilterOptions["classes"][number]) => data.classes.filter(other => other.name === item.name).length > 1 ? `${item.name} · ${yearName(item.parentId) ?? "—"}` : item.name;
  const groups = grades.map(grade => ({ grade, items: data.classes.filter(item => gradeOf(item.name) === grade) })).filter(group => group.items.length);
  return <label className="leaderboard-filter"><span className="visually-hidden">Kelas</span>
    <select className="input filter-select" value={value ?? ""} onChange={event => change(event.target.value || null)}>
      <option value="">Semua kelas</option>
      {groups.map(group => <optgroup key={group.grade} label={group.grade === "Lainnya" ? "Lainnya" : `Kelas ${group.grade}`}>
        {group.items.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}
      </optgroup>)}
    </select></label>;
}

type RankedRow = LeaderboardRow & { rank: number };

function Podium({ rows, open }: { rows: RankedRow[]; open: ((row: RankedRow) => void) | undefined }) {
  return <ol className="podium" aria-label="Tiga besar">{rows.map((row, index) => {
    const body = <>
      <span className="podium-rank"><Icon name="trophy" size={12} />Peringkat {row.rank}</span>
      <span className={`avatar podium-avatar ${personTone("student", row.className).tone}`} aria-hidden="true">{initials(row.studentName)}</span>
      <strong className="podium-name" title={row.studentName}>{row.studentName}</strong>
      <span className="podium-meta">{row.className} · Level {row.level}</span>
      <span className="podium-xp">{row.total} XP</span>
      <span className="podium-badges"><Icon name="star" size={12} />{row.badges} lencana</span>
    </>;
    return <li key={row.studentId} className={`podium-place podium-place-${index + 1}`}>
      {open ? <button type="button" className="podium-card" onClick={() => open(row)}>{body}</button> : <div className="podium-card">{body}</div>}
    </li>;
  })}</ol>;
}

function Leaderboard({ actor, onExpired }: { actor: Actor; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [student, setStudent] = useState<RankedRow | null>(null);
  // The first page's top total scales the XP bars on later pages of the same filter.
  const leaders = useRef(new Map<string, number>());
  const params = new URLSearchParams({ q, offset: String(offset) });
  if (classId) params.set("classId", classId);
  const { data, error, retry } = useData<Page<LeaderboardRow>>(`/api/gamification/leaderboard?${params}`, onExpired);
  const open = (actor.permissions.includes("learning.manage") || actor.permissions.includes("learning.assist")) ? (row: RankedRow) => { setStudent(row); window.scrollTo({ top: 0 }); } : undefined;
  if (student) return <>
    <div className="filter-bar"><Button className="button-secondary button-small" onClick={() => setStudent(null)}><Icon name="chevronLeft" />Kembali ke peringkat</Button></div>
    <PageHeader title={student.studentName} description={`Peringkat ${student.rank} · ${student.className} · ${student.total} XP`} />
    <GrowthView path={`/api/gamification/students/${student.studentId}`} timezone={Intl.DateTimeFormat().resolvedOptions().timeZone} onExpired={onExpired} />
  </>;
  // Equal totals share a rank (1, 2, 2, 4) within the page.
  const rows: RankedRow[] = (data?.items ?? []).map((row, _, items) => ({ ...row, rank: offset + items.findIndex(item => item.total === row.total) + 1 }));
  const filterKey = `${classId ?? ""}|${q}`;
  if (offset === 0 && rows[0]) leaders.current.set(filterKey, rows[0].total);
  const top = leaders.current.get(filterKey) ?? Math.max(0, ...rows.map(row => row.total));
  const podium = offset === 0 && !q && rows.length >= 3 && rows[0]!.total > 0 ? rows.slice(0, 3) : [];
  const filtered = Boolean(q || classId);
  return <Card>
    <div className="card-heading"><div className="leaderboard-heading"><h2>Peringkat kelas</h2><p>Diurutkan dari total XP tertinggi.{open ? " Pilih santri untuk melihat rinciannya." : ""}</p></div>
      <div className="card-tools">
        {actor.permissions.includes("reports.view") && <ClassFilter value={classId} change={value => { setClassId(value); setOffset(0); }} onExpired={onExpired} />}
        <Search change={value => { setQ(value); setOffset(0); }} />
      </div></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !rows.length
      ? (filtered
        ? <EmptyState icon="search" title="Tidak ada santri yang cocok" description="Ubah kata kunci atau pilih kelas lain." />
        : <EmptyState icon="users" title="Belum ada santri" description={actor.permissions.includes("learning.manage.all") ? "Santri akan muncul setelah terdaftar di kelas." : "Santri di kelas yang Anda ajar akan muncul di sini."} />)
      : <>{podium.length > 0 && <Podium rows={podium} open={open} />}
        <div className="table-scroll"><table className="data-table leaderboard-table">
          <thead><tr><th scope="col" className="rank-col">#</th><th scope="col">Santri</th><th scope="col">Kelas</th><th scope="col">Total XP</th><th scope="col">Lencana</th>{open && <th scope="col"><span className="visually-hidden">Aksi</span></th>}</tr></thead>
          <tbody>{rows.map(row => <tr key={`${row.studentId}-${row.className}`} className={open ? "is-clickable" : ""} onClick={open ? () => open(row) : undefined}>
            <td><span className={`rank-mark ${row.rank <= 3 ? `rank-mark-${row.rank}` : ""}`}>{row.rank}</span></td>
            <td><PersonName name={row.studentName} classroom={row.className} sub={`Level ${row.level}`} /></td>
            <td><span className={`grade-chip grade-chip-${gradeOf(row.className).toLowerCase()}`}>{row.className}</span></td>
            <td><span className="xp-cell"><strong>{row.total} XP</strong><span className="xp-bar" aria-hidden="true"><span style={{ width: `${percentOf(row.total, top)}%` }} /></span></span></td>
            <td><span className="badge-count"><Icon name="star" size={14} />{row.badges}</span></td>
            {open && <td><Button className="button-secondary button-small" onClick={event => { event.stopPropagation(); open(row); }}>Lihat<Icon name="chevronRight" /></Button></td>}
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
      <span className="xp-row-main"><span className="xp-icon" aria-hidden="true"><Icon name={ruleIcons[rule.key]} /></span>
        <span className="task-body"><strong>{ruleLabels[rule.key]}</strong><span className="task-meta">{rule.description}</span></span></span>
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
          <td><span className="xp-row-main"><span className={`award-icon ${row.active ? "" : "is-muted"}`} aria-hidden="true"><Icon name={row.icon as IconName} size={16} /></span>
            <span><strong className="table-link">{row.name}</strong><span className="table-sub">{row.key}</span></span></span></td>
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
  const tabs: { id: string; label: string; icon: IconName }[] = [
    ...(can("learning.participate") ? [{ id: "me", label: "Pertumbuhan saya", icon: "star" as const }] : []),
    ...(can("learning.manage") || can("learning.assist") || can("learning.participate") ? [{ id: "leaderboard", label: "Peringkat kelas", icon: "trophy" as const }] : []),
    ...(can("academic.manage") ? [{ id: "rules", label: "Aturan & lencana", icon: "shield" as const }] : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id ?? "me");
  const active = tabs.some(item => item.id === tab) ? tab : tabs[0]?.id ?? "me";
  return <>
    <PageHeader title="Pertumbuhan" description="XP, level, dan lencana dari pembelajaran, penilaian, dan proyek." />
    {tabs.length > 1 && <nav className="tabs growth-tabs" aria-label="Bagian pertumbuhan">{tabs.map(item =>
      <button key={item.id} type="button" className={item.id === active ? "tab-active" : ""} aria-current={item.id === active ? "page" : undefined} onClick={() => setTab(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav>}
    {active === "me" ? (can("learning.participate")
      ? <GrowthView path="/api/gamification/me" timezone={timezone} onExpired={onExpired} />
      : <EmptyState icon="star" title="Belum ada XP" description="XP dan lencana dikumpulkan oleh santri melalui pembelajaran dan proyek." />)
      : active === "leaderboard" ? <Leaderboard actor={actor} onExpired={onExpired} />
      : <div className="dashboard-side"><RewardRules onExpired={onExpired} /><BadgeCatalogue onExpired={onExpired} /></div>}
  </>;
}
