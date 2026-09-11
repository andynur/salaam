import { useState } from "react";
import type { Actor } from "../../core/permissions";
import type { Page } from "../../shared/learning";
import { projectStatuses, type PortfolioEntry, type ProjectRow, type ProjectStatus, type ShowcaseItem } from "../../shared/project";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon } from "../components/icons";
import { Pager, Search, errorMessage, formatDateTime, useData } from "../components/learning";
import { AvatarStack, ProjectStatusBadge, jsonRequest, projectStatusLabels, projectsApi } from "../components/projects";
import { ProjectDetailPage } from "./ProjectBoard";

type Common = { actor: Actor; timezone: string; onExpired: () => void };
type Tab = "projects" | "showcase" | "portfolio";

export function Projects({ actor, timezone, onExpired }: Common) {
  const projectId = location.pathname.match(/^\/projects\/([0-9a-f-]+)$/i)?.[1];
  if (projectId) return <ProjectDetailPage key={projectId} projectId={projectId} timezone={timezone} onExpired={onExpired} />;
  return <ProjectHub actor={actor} timezone={timezone} onExpired={onExpired} />;
}

function ProjectHub({ actor, timezone, onExpired }: Common) {
  const manager = actor.permissions.includes("learning.manage");
  const participant = actor.permissions.includes("learning.participate");
  const requested = new URLSearchParams(location.search).get("tab");
  const [tab, setTab] = useState<Tab>(requested === "showcase" || (requested === "portfolio" && participant) ? requested : "projects");
  function select(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(location.search);
    if (next === "projects") params.delete("tab"); else params.set("tab", next);
    history.replaceState(null, "", `/projects${params.toString() ? `?${params}` : ""}`);
  }
  const tabButton = (key: Tab, label: string) => <button className={tab === key ? "tab-active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => select(key)}>{label}</button>;
  return <>
    <PageHeader title="Projects" description={manager ? "Pantau proyek tim, review hasil karya, dan pilih karya terbaik untuk showcase sekolah." : "Kerjakan proyek bersama tim, kirim untuk review, dan kumpulkan karya terbaik di portfolio."} />
    <nav className="tabs" aria-label="Halaman projects">{tabButton("projects", manager ? "Semua proyek" : "Proyek saya")}{tabButton("showcase", "Showcase")}{participant && tabButton("portfolio", "Portfolio saya")}</nav>
    {tab === "showcase" ? <Showcase onExpired={onExpired} /> : tab === "portfolio" && participant ? <Portfolio timezone={timezone} onExpired={onExpired} /> : <ProjectList manager={manager} timezone={timezone} onExpired={onExpired} />}
  </>;
}

function ProjectList({ manager, timezone, onExpired }: { manager: boolean; timezone: string; onExpired: () => void }) {
  const query = new URLSearchParams(location.search);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(projectStatuses.includes(query.get("status") as ProjectStatus) ? query.get("status")! : "");
  const [challenge, setChallenge] = useState(query.get("challenge") ?? "");
  const params = new URLSearchParams({ q, offset: String(offset), ...(status ? { status } : {}), ...(challenge ? { activityId: challenge } : {}) });
  const { data, error, retry } = useData<Page<ProjectRow>>(`${projectsApi}?${params}`, onExpired);
  function clearChallenge() {
    setChallenge(""); setOffset(0);
    const next = new URLSearchParams(location.search);
    next.delete("challenge");
    history.replaceState(null, "", `/projects${next.toString() ? `?${next}` : ""}`);
  }
  const filtered = Boolean(q || status || challenge);
  return <Card>
    <div className="card-heading"><h2>{manager ? "Proyek di course Anda" : "Proyek saya"}</h2><div className="card-tools">
      <select className="input filter-select" aria-label="Filter status proyek" value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}>
        <option value="">Semua status</option>{projectStatuses.map(key => <option key={key} value={key}>{projectStatusLabels[key].label}</option>)}
      </select>
      <Search change={value => { setQ(value); setOffset(0); }} />
    </div></div>
    {challenge && <div className="filter-bar"><span className="badge badge-discovery">Challenge: {data?.items[0]?.challengeTitle ?? "terpilih"}</span><Button className="button-secondary button-small" onClick={clearChallenge}><Icon name="close" />Hapus filter</Button></div>}
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="board" title="Belum ada proyek" description={filtered ? "Tidak ada proyek yang sesuai dengan filter." : manager ? "Buat challenge di lesson, lalu bentuk tim agar proyek tampil di sini." : "Proyek tampil setelah guru menambahkan Anda ke tim atau Anda memulai challenge individu."} />
      : <div className="table-scroll" tabIndex={0} role="region" aria-label="Daftar proyek"><table className="data-table"><thead><tr><th scope="col">Proyek</th><th scope="col">Course</th><th scope="col">Tim</th><th scope="col">Progres board</th><th scope="col">Status</th><th scope="col">Diperbarui</th></tr></thead>
        <tbody>{data.items.map(row => <tr key={row.id}>
          <td><a className="table-link" href={`/projects/${row.id}`}><strong>{row.title}</strong></a><small className="table-sub">{row.challengeTitle}</small></td>
          <td>{row.courseName}<small className="table-sub">{row.className}</small></td>
          <td><AvatarStack members={row.members} /></td>
          <td><span className="board-progress"><progress max={row.taskCount || 1} value={row.doneCount} aria-hidden="true" /><span>{row.doneCount}/{row.taskCount} selesai</span></span></td>
          <td><span className="badge-group"><ProjectStatusBadge status={row.status} />{row.showcased && <span className="badge badge-gold">Showcase</span>}</span></td>
          <td>{formatDateTime(row.updatedAt, timezone)}</td>
        </tr>)}</tbody></table></div>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card>;
}

function Showcase({ onExpired }: { onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<ShowcaseItem>>(`${projectsApi}/showcase?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <Card>
    <div className="card-heading"><h2>Showcase sekolah</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="star" title="Belum ada karya di showcase" description={q ? "Tidak ada karya yang sesuai pencarian." : "Guru memilih proyek terbaik yang sudah disetujui untuk ditampilkan di sini."} />
      : <div className="course-grid">{data.items.map(item => <article className="course-tile showcase-tile" key={item.id}>
        <div className="learning-row"><span className="course-avatar" aria-hidden="true"><Icon name="star" size={20} /></span><span className="badge badge-gold">Showcase</span></div>
        <h3>{item.title}</h3>
        <p>{item.courseName} · {item.className} · {item.challengeTitle}</p>
        {item.summary && <p className="showcase-summary">{item.summary}</p>}
        <div className="showcase-team"><AvatarStack members={item.members} names /></div>
        <div className="showcase-links">
          {item.deliverableUrl && <a className="material-link" href={item.deliverableUrl} target="_blank" rel="noopener noreferrer">Lihat hasil karya<Icon name="link" /></a>}
          {item.canOpen && <a className="material-link" href={`/projects/${item.id}`}>Buka proyek<Icon name="arrowRight" /></a>}
        </div>
      </article>)}</div>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card>;
}

function Portfolio({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [removing, setRemoving] = useState("");
  const [actionError, setActionError] = useState("");
  const { data, error, retry } = useData<Page<PortfolioEntry>>(`${projectsApi}/portfolio?offset=${offset}`, onExpired, revision);
  async function remove(entry: PortfolioEntry) {
    if (removing || !confirm(`Hapus "${entry.projectTitle}" dari portfolio? Anda dapat menambahkannya kembali dari halaman proyek.`)) return;
    setRemoving(entry.id); setActionError("");
    try { await api(`${projectsApi}/${entry.projectId}/portfolio/archive`, jsonRequest({ archived: true })); setRevision(value => value + 1); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setActionError(errorMessage(cause)); }
    finally { setRemoving(""); }
  }
  return <Card>
    <div className="card-heading"><h2>Portfolio saya</h2></div>
    {actionError && <ErrorState message={actionError} />}
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length
      ? <EmptyState icon="briefcase" title="Portfolio masih kosong" description="Setelah proyek disetujui guru, tambahkan proyek ke portfolio dari halaman proyek beserta refleksi Anda." />
      : <ul className="portfolio-list">{data.items.map(entry => <li className="portfolio-entry" key={entry.id}>
        <div className="learning-row"><div className="portfolio-title"><h3>{entry.projectTitle}</h3><p className="learning-muted">{entry.courseName} · {entry.challengeTitle}</p></div>{entry.score !== null && <span className="badge badge-success">Nilai {entry.score}</span>}</div>
        {entry.summary && <p className="learning-prose">{entry.summary}</p>}
        <div className="portfolio-reflection"><span className="eyebrow text-muted">REFLEKSI</span><p className="learning-prose">{entry.reflection}</p></div>
        <p className="learning-muted">Tim: {entry.members.map(member => member.name).join(", ")} · Diperbarui {formatDateTime(entry.updatedAt, timezone)}</p>
        <div className="learning-actions">
          {entry.deliverableUrl && <a className="material-link" href={entry.deliverableUrl} target="_blank" rel="noopener noreferrer">Lihat hasil karya<Icon name="link" /></a>}
          {entry.canOpen && <a className="material-link" href={`/projects/${entry.projectId}`}>Buka proyek<Icon name="arrowRight" /></a>}
          <Button className="button-secondary button-small" disabled={Boolean(removing)} onClick={() => void remove(entry)}>{removing === entry.id ? "Menghapus…" : "Hapus dari portfolio"}</Button>
        </div>
      </li>)}</ul>}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </Card>;
}
