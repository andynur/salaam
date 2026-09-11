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
export function EmptyState({ title, description, icon = "inbox", action }: { title: string; description: string; icon?: IconName; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-symbol" aria-hidden="true"><Icon name={icon} size={24} /></span><h3>{title}</h3><p>{description}</p>{action && <div className="empty-action">{action}</div>}</div>;
}
export function LoadingState() {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Memuat ruang belajar…</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><Icon name="error" size={20} /><div><p>{message}</p>{retry && <Button className="button-secondary button-small" onClick={retry}>Coba lagi</Button>}</div></div>;
}
