import { useState } from "react";
import type { Page, Progress } from "../../shared/learning";
import type { ProjectMember, ProjectStatus, TaskStatus } from "../../shared/project";
import { ErrorState, LoadingState, initials } from "./ui";
import { Pager, Search, learningApi, useData } from "./learning";

export const projectsApi = "/api/projects";
export const jsonRequest = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const projectStatusLabels: Record<ProjectStatus, { label: string; badge: string }> = {
  in_progress: { label: "Dikerjakan", badge: "" },
  submitted: { label: "Menunggu review", badge: "badge-discovery" },
  changes_requested: { label: "Perlu revisi", badge: "badge-danger" },
  approved: { label: "Disetujui", badge: "badge-success" },
};
export const taskStatusLabels: Record<TaskStatus, string> = { todo: "Akan dikerjakan", in_progress: "Sedang dikerjakan", review: "Ditinjau", done: "Selesai" };

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, badge } = projectStatusLabels[status];
  return <span className={`badge ${badge}`}>{label}</span>;
}

// Overlapping initials; names are visible text or screen-reader text so the list stays accessible.
export function AvatarStack({ members, names = false, max = 4 }: { members: ProjectMember[]; names?: boolean; max?: number }) {
  return <span className="avatar-stack">
    {members.slice(0, max).map(member => <span className="avatar avatar-small" key={member.id} aria-hidden="true" title={member.name}>{initials(member.name)}</span>)}
    {members.length > max && <span className="avatar avatar-small avatar-more" aria-hidden="true">+{members.length - max}</span>}
    <span className={names ? "avatar-names" : "visually-hidden"}>{members.map(member => member.name).join(", ") || "Belum ada anggota"}</span>
  </span>;
}

// Roster comes from the manager-only course progress list, which covers every enrolled student.
export function MemberPicker({ courseId, max, selected, onChange, onExpired }: { courseId: string; max: number; selected: string[]; onChange: (ids: string[]) => void; onExpired: () => void }) {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const { data, error, retry } = useData<Page<Progress>>(`${learningApi}/${courseId}/progress?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  return <div className="question-picker member-picker">
    <div className="learning-row"><strong>Anggota · {selected.length} / {max} santri</strong><Search change={value => { setQ(value); setOffset(0); }} /></div>
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !data.items.length ? <p className="learning-muted">{q ? "Tidak ada santri yang sesuai pencarian." : "Belum ada santri di kelas course ini."}</p>
      : data.items.map(row => {
        const checked = selected.includes(row.studentId);
        return <div className="picker-row" key={row.studentId}><label className="submission-confirm"><input type="checkbox" checked={checked} disabled={!checked && selected.length >= max}
          onChange={() => onChange(checked ? selected.filter(id => id !== row.studentId) : [...selected, row.studentId])} /><span>{row.studentName}</span></label></div>;
      })}
    {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
  </div>;
}
