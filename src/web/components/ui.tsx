import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}
export type Crumb = { label: string; href?: string };
// Breadcrumbs list ancestors only; the h1 names the current page.
export function PageHeader({ title, description, breadcrumbs = [], actions }: { title: ReactNode; description?: ReactNode; breadcrumbs?: Crumb[]; actions?: ReactNode }) {
  return <header className="page-header">
    {breadcrumbs.length > 0 && <nav aria-label="Breadcrumb"><ol className="breadcrumbs">{breadcrumbs.map(crumb => <li key={`${crumb.label}-${crumb.href ?? ""}`}>{crumb.href ? <a href={crumb.href}>{crumb.label}</a> : <span>{crumb.label}</span>}</li>)}</ol></nav>}
    <div className="page-header-main"><div className="page-header-text"><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>
  </header>;
}
// Title row of a form panel (.admin-form-card): heading, optional hint, optional close button.
export function PanelHeading({ title, description, close }: { title: string; description?: ReactNode; close?: () => void }) {
  return <div className="admin-form-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{close && <button type="button" className="icon-button" aria-label="Tutup panel" onClick={close}><Icon name="close" /></button>}</div>;
}
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word.charAt(0)).join("").toUpperCase();
// Grade level from a class name such as "X-A", "XI IPA 2", or "XII"; the schema has no grade column.
export const gradeOf = (className: string) => className.match(/^(XII|XI|X)(?=-|\s|$)/)?.[1] ?? "Lainnya";
const personTones: Record<string, { tone: string; label: string }> = {
  admin: { tone: "avatar-admin", label: "Admin" },
  teacher: { tone: "avatar-teacher", label: "Guru" },
  X: { tone: "avatar-grade-x", label: "Santri kelas X" },
  XI: { tone: "avatar-grade-xi", label: "Santri kelas XI" },
  XII: { tone: "avatar-grade-xii", label: "Santri kelas XII" },
  student: { tone: "avatar-student", label: "Santri" },
};
// Avatar colour tells who a person is at a glance. `role` may list several keys ("admin, teacher");
// the strongest wins. A class name marks a santri and picks the grade colour.
export function personTone(role = "", classroom?: string | null) {
  const roles = role.split(",").map(key => key.trim());
  const key = roles.includes("admin") ? "admin" : roles.includes("teacher") ? "teacher" : classroom ? gradeOf(classroom) : roles.includes("student") ? "student" : "";
  return personTones[key] ?? (classroom || key ? personTones.student! : { tone: "", label: "" });
}
// A person in a table row or list: initials avatar coloured by role or grade, name, and an optional meta line.
export function PersonName({ name, sub, role, classroom, className = "" }: { name: string; sub?: ReactNode; role?: string; classroom?: string | null | undefined; className?: string }) {
  const { tone, label } = personTone(role, classroom);
  return <span className={`person-name ${className}`}><span className={`avatar avatar-small ${tone}`} aria-hidden="true" title={label || undefined}>{initials(name)}</span><span className="person-name-text">{name}{sub && <span className="table-sub">{sub}</span>}</span></span>;
}
export function EmptyState({ title, description, icon = "inbox", action }: { title: string; description: string; icon?: IconName; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-symbol" aria-hidden="true"><Icon name={icon} size={24} /></span><h3>{title}</h3><p>{description}</p>{action && <div className="empty-action">{action}</div>}</div>;
}
export function LoadingState() {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Memuat ruang belajar…</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><Icon name="error" size={20} /><div><p>{message}</p>{retry && <Button className="button-secondary button-small" onClick={retry}>Coba lagi</Button>}</div></div>;
}
