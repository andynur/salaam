import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { Actor } from "../../core/permissions";
import { Icon } from "../components/icons";
import { brandTitle, BRAND } from "../lib/brand";
import logo from "../../../assets/logo-color.png";
import mark from "../../../assets/brand/salaam-mark.svg";
import { GlobalSearch } from "./GlobalSearch";
import { navigationFor, roleLabel } from "./navigation";

const collapsedKey = "salaam:sidebar-collapsed";
const mobileQuery = "(max-width: 760px)";
function readCollapsed() {
  try { return localStorage.getItem(collapsedKey) === "1"; } catch { return false; }
}

export function Shell({ actor, onLogout, onExpired, pending, children }: PropsWithChildren<{ actor: Actor; onLogout: () => void; onExpired: () => void; pending: boolean }>) {
  const { isStudent, groups, future, pages } = navigationFor(actor);
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const path = location.pathname;
  const pageLabel = pages.find(item => item.active(path))?.label;

  useEffect(() => { document.title = brandTitle(pageLabel); }, [pageLabel]);
  useEffect(() => {
    const media = matchMedia(mobileQuery);
    const change = () => { setMobile(media.matches); setDrawerOpen(false); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    document.querySelector<HTMLElement>("#sidebar a")?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawerOpen(false); toggle.current?.focus(); } };
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, [drawerOpen]);

  function toggleSidebar() {
    if (mobile) { setDrawerOpen(!drawerOpen); return; }
    setCollapsed(!collapsed);
    try { localStorage.setItem(collapsedKey, collapsed ? "0" : "1"); } catch { /* storage unavailable */ }
  }
  const sidebarVisible = mobile ? drawerOpen : !collapsed;

  return <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
    <a className="skip-link" href="#main">Langsung ke konten</a>
    <header className="topbar">
      <div className="topbar-start">
        <button ref={toggle} type="button" className="icon-button" aria-controls="sidebar" aria-expanded={sidebarVisible} aria-label={sidebarVisible ? "Tutup navigasi" : "Buka navigasi"} onClick={toggleSidebar}><Icon name="sidebar" size={20} /></button>
        <a className="brand" href="/dashboard"><img src={mark} alt="" /><strong>{BRAND.name}</strong></a>
      </div>
      <GlobalSearch pages={pages} canSearchCourses={actor.permissions.includes("learning.view")} onExpired={onExpired} />
      <div className="topbar-end"><AccountMenu actor={actor} onLogout={onLogout} pending={pending} /></div>
    </header>
    <aside id="sidebar" className={`sidebar${drawerOpen ? " is-open" : ""}`} aria-label="Sidebar">
      <div className="space-header"><span className="space-avatar" aria-hidden="true"><img src={logo} alt="" /></span><div><strong>HSI Boarding School</strong><span>{isStudent ? "Ruang santri" : "Ruang guru & admin"}</span></div></div>
      <nav aria-label="Navigasi utama" className="navigation">
        {groups.map((group, index) => <div className="nav-group" key={group.label ?? index}>
          {group.label && <div className="nav-heading" id={`nav-${index}`}>{group.label}</div>}
          <ul aria-labelledby={group.label ? `nav-${index}` : undefined}>{group.items.map(item => {
            const active = item.active(path);
            return <li key={item.href}><a href={item.href} className={`nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={20} /><span>{item.label}</span></a></li>;
          })}</ul>
        </div>)}
        {future.length > 0 && <div className="nav-group">
          <button type="button" className="nav-heading nav-disclosure" aria-expanded={futureOpen} aria-controls="nav-future" onClick={() => setFutureOpen(!futureOpen)}><span>Segera hadir</span><Icon name={futureOpen ? "chevronDown" : "chevronRight"} /></button>
          <ul id="nav-future" hidden={!futureOpen}>{future.map(item => <li key={item.label}><span className="nav-item nav-item-disabled" aria-disabled="true"><Icon name={item.icon} size={20} /><span>{item.label}</span><span className="nav-soon">Segera</span></span></li>)}</ul>
        </div>}
      </nav>
      <p className="sidebar-footer"><span className="gold-dot" aria-hidden="true" />{BRAND.tagline}</p>
    </aside>
    {drawerOpen && <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setDrawerOpen(false)} />}
    <main id="main" className="main-content" tabIndex={-1}>{children}</main>
  </div>;
}

function AccountMenu({ actor, onLogout, pending }: { actor: Actor; onLogout: () => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); removeEventListener("keydown", escape); };
  }, [open]);
  const initial = actor.displayName.trim().charAt(0).toUpperCase() || "?";
  return <div className="account-menu" ref={root}>
    <button ref={trigger} type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}>
      <span className="avatar" aria-hidden="true">{initial}</span><span className="account-name">{actor.displayName}</span><Icon name="chevronDown" />
    </button>
    {open && <div className="menu-popover" id="account-menu" role="menu" aria-label="Akun">
      <div className="menu-profile" role="presentation"><span className="avatar avatar-large" aria-hidden="true">{initial}</span><div><strong>{actor.displayName}</strong><span>{roleLabel(actor)}</span></div></div>
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item" disabled={pending} onClick={onLogout}><Icon name="logout" size={20} />{pending ? "Keluar…" : "Keluar"}</button>
    </div>}
  </div>;
}
