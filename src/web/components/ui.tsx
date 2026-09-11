import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function EmptyState({ title, description, symbol = "◇" }: { title: string; description: string; symbol?: string }) {
  return <div className="empty-state"><span className="empty-symbol" aria-hidden="true">{symbol}</span><h3>{title}</h3><p>{description}</p></div>;
}
export function LoadingState() {
  return <div className="loading-state" role="status"><span className="loading-dot" aria-hidden="true" />Memuat ruang belajar…</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><p>{message}</p>{retry && <Button className="button-secondary" onClick={retry}>Coba lagi</Button>}</div>;
}
