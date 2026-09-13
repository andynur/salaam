import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PropsWithChildren, type RefObject } from "react";
import type { Actor } from "../../core/permissions";
import type { NotificationItem } from "../../shared/calendar";
import { Icon } from "../components/icons";
import { ErrorState } from "../components/ui";
import { formatDateTime } from "../components/learning";
import { api, ApiError } from "../lib/api";
import { brandTitle, BRAND } from "../lib/brand";
import logo from "../../../assets/logo-color.png";
import mark from "../../../assets/brand/salaam-mark.svg";
import { notificationCategoryClass, notificationIcons, notificationLabels, notificationsChanged } from "../pages/Calendar";
import { GlobalSearch } from "./GlobalSearch";
import { navigationFor, roleLabel, type NavGroup, type NavItem } from "./navigation";

const collapsedKey = "salaam:sidebar-collapsed";
const closedGroupsKey = "salaam:nav-closed-groups";
const mobileQuery = "(max-width: 760px)";
function readCollapsed() {
  try { return localStorage.getItem(collapsedKey) === "1"; } catch { return false; }
}
// A group holding the current page always starts open, whatever was remembered.
function readClosedGroups(groups: NavGroup[], path: string) {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(closedGroupsKey) ?? "[]");
    const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    return ids.filter(id => !groups.find(group => group.id === id)?.items.some(item => item.active(path)));
  } catch { return []; }
}
// Closes a popover on an outside pointer or Escape, and returns focus to its trigger on Escape.
function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, trigger: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); removeEventListener("keydown", escape); };
  }, [open, close, root, trigger]);
}

export function Shell({ actor, timezone, onLogout, onExpired, pending, children }: PropsWithChildren<{ actor: Actor; timezone: string; onLogout: () => void; onExpired: () => void; pending: boolean }>) {
  const { isStudent, groups, future, account, pages, canNotify } = navigationFor(actor);
  const path = location.pathname;
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState(() => readClosedGroups(groups, path));
  const toggle = useRef<HTMLButtonElement>(null);
  const pageLabel = (pages.find(item => item.href === path) ?? pages.find(item => item.active(path)))?.label;

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
  function toggleGroup(id: string) {
    const next = closedGroups.includes(id) ? closedGroups.filter(group => group !== id) : [...closedGroups, id];
    setClosedGroups(next);
    try { localStorage.setItem(closedGroupsKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
  }
  const sidebarVisible = mobile ? drawerOpen : !collapsed;
  const navLink = (item: NavItem) => {
    const active = item.active(path);
    return <li key={item.href}><a href={item.href} className={`nav-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={20} /><span>{item.label}</span></a></li>;
  };

  return <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
    <a className="skip-link" href="#main">Langsung ke konten</a>
    <header className="topbar">
      <div className="topbar-start">
        <button ref={toggle} type="button" className="icon-button" aria-controls="sidebar" aria-expanded={sidebarVisible} aria-label={sidebarVisible ? "Tutup navigasi" : "Buka navigasi"} onClick={toggleSidebar}><Icon name="sidebar" size={20} /></button>
        <a className="brand" href="/dashboard"><img src={mark} alt="" /><strong>{BRAND.name}</strong></a>
      </div>
      <GlobalSearch pages={pages} canSearchCourses={actor.permissions.includes("learning.view")} onExpired={onExpired} />
      <div className="topbar-end">
        {canNotify && <NotificationMenu timezone={timezone} onExpired={onExpired} />}
        <AccountMenu actor={actor} items={account} path={path} onLogout={onLogout} pending={pending} />
      </div>
    </header>
    <aside id="sidebar" className={`sidebar${drawerOpen ? " is-open" : ""}`} aria-label="Sidebar">
      <div className="space-header"><span className="space-avatar" aria-hidden="true"><img src={logo} alt="" /></span><div><strong>HSI Boarding School</strong><span>{isStudent ? "Ruang santri" : "Ruang guru & admin"}</span></div></div>
      <nav aria-label="Navigasi utama" className="navigation">
        {groups.map(group => {
          if (!group.label) return <div className="nav-group" key={group.id}><ul>{group.items.map(navLink)}</ul></div>;
          const open = !closedGroups.includes(group.id);
          return <div className="nav-group" key={group.id}>
            <button type="button" id={`nav-${group.id}-heading`} className="nav-heading nav-disclosure" aria-expanded={open} aria-controls={`nav-${group.id}`} onClick={() => toggleGroup(group.id)}><span>{group.label}</span><Icon name={open ? "chevronDown" : "chevronRight"} /></button>
            <ul id={`nav-${group.id}`} aria-labelledby={`nav-${group.id}-heading`} hidden={!open}>{group.items.map(navLink)}</ul>
          </div>;
        })}
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

type Inbox = { items: NotificationItem[]; nextOffset: number | null };
// Unread notifications in the topbar. The inbox page stays the full view with history and preferences;
// both announce read receipts through `notificationsChanged` so the badge and the list agree.
function NotificationMenu({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const load = useCallback(async () => {
    try { setInbox(await api<Inbox>("/api/notifications?offset=0&unread=true")); setError(""); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Notifikasi tidak dapat dimuat.");
    }
  }, [onExpired]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    const changed = () => void load();
    addEventListener(notificationsChanged, changed);
    return () => { clearInterval(timer); removeEventListener(notificationsChanged, changed); };
  }, [load]);
  useEffect(() => { if (open) { panel.current?.focus(); void load(); } }, [open, load]);
  useDismiss(open, close, root, trigger);

  async function markRead(item: NotificationItem, follow: boolean) {
    if (busy.current) return;
    busy.current = true; setMarking(true);
    try {
      await api(`/api/notifications/${item.id}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      dispatchEvent(new Event(notificationsChanged));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { onExpired(); return; }
      if (!follow) setError(cause instanceof Error ? cause.message : "Notifikasi tidak dapat ditandai.");
    } finally { busy.current = false; setMarking(false); }
    if (follow) location.assign(item.href);
  }
  function openItem(event: MouseEvent<HTMLAnchorElement>, item: NotificationItem) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void markRead(item, true);
  }
  const count = inbox?.items.length ?? 0;
  const countLabel = inbox?.nextOffset !== null && inbox?.nextOffset !== undefined ? "50+" : String(count);
  return <div className="notification-menu" ref={root}>
    <button ref={trigger} type="button" className="icon-button notification-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="notification-menu" aria-label={count ? `Notifikasi, ${countLabel} belum dibaca` : "Notifikasi"} onClick={() => setOpen(!open)}>
      <Icon name="bell" size={20} />{count > 0 && <span className="notification-count" aria-hidden="true">{countLabel}</span>}
    </button>
    {open && <div ref={panel} className="menu-popover notification-popover" id="notification-menu" role="dialog" aria-labelledby="notification-menu-title" tabIndex={-1}>
      <div className="notification-popover-header"><h2 id="notification-menu-title">Notifikasi</h2>{count > 0 && <span className="badge">{countLabel} belum dibaca</span>}</div>
      {error ? <ErrorState message={error} retry={() => void load()} />
        : !inbox ? <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />Memuat notifikasi…</div>
        : !inbox.items.length ? <div className="notification-popover-empty"><span className="empty-symbol" aria-hidden="true"><Icon name="bell" size={20} /></span><strong>Semua sudah dibaca</strong><span>Notifikasi baru akan muncul di sini.</span></div>
        : <ul className="notification-popover-list">{inbox.items.slice(0, 6).map(item => <li className="notification-popover-item" key={item.id}>
          <span className={`notification-icon ${notificationCategoryClass(item.kind)}`} aria-hidden="true"><Icon name={notificationIcons[item.kind]} /></span>
          <div className="notification-popover-text"><a href={item.href} onClick={event => openItem(event, item)}>{item.title}</a><span>{notificationLabels[item.kind]} · {formatDateTime(item.deliveredAt ?? item.scheduledAt, timezone)}</span></div>
          <button type="button" className="icon-button icon-button-small" aria-label={`Tandai dibaca: ${item.title}`} title="Tandai dibaca" disabled={marking} onClick={() => void markRead(item, false)}><Icon name="check" /></button>
        </li>)}</ul>}
      <a className="card-footer-link" href="/notifications">Lihat semua notifikasi</a>
    </div>}
  </div>;
}

function AccountMenu({ actor, items, path, onLogout, pending }: { actor: Actor; items: NavItem[]; path: string; onLogout: () => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => { if (open) root.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus(); }, [open]);
  useDismiss(open, close, root, trigger);
  function keydown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") { setOpen(false); return; }
    const options = [...(root.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)") ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (index + 1) % options.length : event.key === "ArrowUp" ? (index - 1 + options.length) % options.length
      : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
    if (next < 0 || !options.length) return;
    event.preventDefault();
    options[next]!.focus();
  }
  const initial = actor.displayName.trim().charAt(0).toUpperCase() || "?";
  return <div className="account-menu" ref={root}>
    <button ref={trigger} type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}>
      <span className="avatar" aria-hidden="true">{initial}</span><span className="account-name">{actor.displayName}</span><Icon name="chevronDown" />
    </button>
    {open && <div className="menu-popover" id="account-menu" role="menu" aria-label="Akun" onKeyDown={keydown}>
      <div className="menu-profile" role="presentation"><span className="avatar avatar-large" aria-hidden="true">{initial}</span><div><strong>{actor.displayName}</strong><span>{roleLabel(actor)}</span></div></div>
      <div className="menu-separator" role="separator" />
      {items.map(item => {
        const active = item.active(path);
        return <a key={item.href} role="menuitem" href={item.href} className={`menu-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}><Icon name={item.icon} size={20} />{item.label}</a>;
      })}
      <div className="menu-separator" role="separator" />
      <button type="button" role="menuitem" className="menu-item" disabled={pending} onClick={onLogout}><Icon name="logout" size={20} />{pending ? "Keluar…" : "Keluar"}</button>
    </div>}
  </div>;
}
