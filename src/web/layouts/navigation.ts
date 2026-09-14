import type { Actor } from "../../core/permissions";
import type { IconName } from "../components/icons";

export interface NavItem { href: string; label: string; icon: IconName; active: (path: string) => boolean }
export interface NavGroup { id: string; label?: string; items: NavItem[] }
export interface FutureItem { label: string; icon: IconName }

const exact = (href: string) => (path: string) => path === href;
const prefix = (href: string) => (path: string) => path === href || path.startsWith(`${href}/`);
const oneOf = (...hrefs: string[]) => (path: string) => hrefs.includes(path);
const item = (href: string, label: string, icon: IconName, active = prefix(href)): NavItem => ({ href, label, icon, active });

// Shared by the sidebar, the topbar, and the topbar search so all only offer pages the actor can open.
// The sidebar holds workspaces; personal pages (profile, notifications) live in the topbar, and
// administration sections with several screens are one entry whose screens are tabs.
export function navigationFor(actor: Actor) {
  const can = (permission: string) => actor.permissions.includes(permission);
  const isStudent = actor.roles.includes("student") && !actor.roles.some(role => role === "admin" || role === "teacher");
  const main = [
    item("/dashboard", "Dashboard", "dashboard", exact("/dashboard")),
    ...(can("learning.view") ? [
      item("/learning", "Pembelajaran", "book"),
      item("/attendance", "Kehadiran", "attendance"),
      item("/projects", "Projects", "board"),
      item("/curriculum", "Kurikulum", "route", exact("/curriculum")),
    ] : []),
    ...(can("dashboard:view") ? [item("/calendar", "Kalender", "calendar", exact("/calendar"))] : []),
    ...(can("reports.view") ? [item("/reports", "Laporan", "chart")] : []),
  ];
  const growth = [
    ...(can("learning.view") ? [item("/gamification", "Pertumbuhan", "star")] : []),
    ...(can("links.view") ? [item("/links", "Tautan", "link")] : []),
    ...(can("club.view") ? [item("/club", "Club", "club")] : []),
  ];
  const admin = [
    ...(can("admin.users.manage") ? [item("/admin/users", "Pengguna", "users", oneOf("/admin/users", "/admin/import"))] : []),
    ...(can("academic.manage") ? [item("/admin/academic", "Akademik", "academic", oneOf("/admin/academic", "/admin/transfers"))] : []),
    ...(can("audit.view") ? [item("/admin/audit", "Audit log", "shield", exact("/admin/audit"))] : []),
  ];
  const groups: NavGroup[] = [
    { id: "main", items: main },
    { id: "growth", label: "Pembinaan", items: growth },
    { id: "admin", label: "Administrasi", items: admin },
  ].filter(group => group.items.length > 0);
  const account = [
    item("/account", "Profil saya", "user", exact("/account")),
    ...(can("dashboard:view") ? [item("/notifications", "Notifikasi", "bell", exact("/notifications"))] : []),
  ];
  // Screens reached through a tab rather than the sidebar; listed so search can jump to them.
  const screens = [
    ...(can("admin.users.manage") ? [item("/admin/import", "Import santri", "upload", exact("/admin/import"))] : []),
    ...(can("academic.manage") ? [item("/admin/transfers", "Transfer kelas", "transfer", exact("/admin/transfers"))] : []),
  ];
  const future: FutureItem[] = [];
  const pages = [...groups.flatMap(group => group.items), ...account, ...screens];
  return { isStudent, groups, future, account, pages, canNotify: can("dashboard:view") };
}

const roleLabels: Record<string, string> = { admin: "Admin", teacher: "Guru", asmen: "Asisten Mentor", student: "Santri" };
export const roleName = (role: string) => roleLabels[role] ?? role;
const roleTones: Record<string, string> = { admin: "badge-discovery", teacher: "", asmen: "badge-gold", student: "badge-success" };
export const roleTone = (role: string) => roleTones[role] ?? "badge-draft";
export const roleLabel = (actor: Actor) => actor.roles.map(roleName).join(" · ");
