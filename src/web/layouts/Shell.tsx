import { useState, type PropsWithChildren } from "react";
import type { Actor } from "../../core/permissions";
import { Button } from "../components/ui";
import logo from "../../../assets/logo-color.png";

const navigation = ["Courses", "Activities", "Kehadiran", "Projects", "Kalender", "Laporan"];
export function Shell({ actor, onLogout, pending, children }: PropsWithChildren<{ actor: Actor; onLogout: () => void; pending: boolean }>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isStudent = actor.roles.includes("student") && !actor.roles.some(role => role === "admin" || role === "teacher");
  const adminNavigation = [["/admin/users", "Akun & profil", "admin.users.manage"], ["/admin/academic", "Akademik", "academic.manage"], ["/admin/audit", "Audit log", "audit.view"]] as const;
  return <div className="app-shell">
    <a className="skip-link" href="#main">Langsung ke konten</a>
    <header className="topbar"><div className="brand"><img src={logo} alt="HSI Boarding School" /><span className="brand-divider" /><span>Learning <strong>OS</strong></span></div><div className="topbar-right"><span className="workspace-label">Ruang akademik</span><span className="avatar" aria-hidden="true">{actor.displayName.charAt(0).toUpperCase()}</span><span className="user-name">{actor.displayName}</span><Button className="button-secondary button-small" onClick={onLogout} disabled={pending}>{pending ? "Keluar…" : "Keluar"}</Button></div></header>
    <aside className="sidebar"><div className="workspace"><span className="workspace-icon" aria-hidden="true">H</span><div><strong>HSI Boarding School</strong><span>{isStudent ? "Ruang santri" : "Ruang guru & admin"}</span></div></div><button className="menu-toggle" aria-expanded={menuOpen} aria-controls="navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu navigasi <span aria-hidden="true">☰</span></button>
      <nav id="navigation" aria-label="Navigasi utama" className={menuOpen ? "navigation is-open" : "navigation"}><span className="nav-label">WORKSPACE</span><a className={location.pathname === "/dashboard" ? "nav-active" : ""} href="/dashboard" aria-current={location.pathname === "/dashboard" ? "page" : undefined}><span aria-hidden="true">▦</span>Dashboard</a>{adminNavigation.filter(([, , permission]) => actor.permissions.includes(permission)).map(([href, label]) => <a key={href} href={href} className={location.pathname === href ? "nav-active" : ""} aria-current={location.pathname === href ? "page" : undefined}><span aria-hidden="true">◇</span>{label}</a>)}{(isStudent ? ["Pembelajaran", "Tugas", "Projects", "Kalender"] : navigation).map(label => <span className="nav-future" key={label}><span aria-hidden="true">◇</span>{label}<span className="future-label">Segera</span></span>)}</nav>
      <div className="sidebar-note"><span className="gold-dot" /><strong>Ruang untuk bertumbuh</strong><p>Ilmu yang bermanfaat.<br />Karya yang berdampak.</p></div>
    </aside><main id="main" className="main-content" tabIndex={-1}>{children}</main>
  </div>;
}
