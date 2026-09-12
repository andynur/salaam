import type { Actor } from "../../core/permissions";
import type { IconName } from "../components/icons";

export interface NavItem { href: string; label: string; icon: IconName; active: (path: string) => boolean }
export interface NavGroup { label?: string; items: NavItem[] }
export interface FutureItem { label: string; icon: IconName }

const exact = (href: string) => (path: string) => path === href;

// Shared by the sidebar and the topbar search so both only offer pages the actor can open.
export function navigationFor(actor: Actor) {
  const can = (permission: string) => actor.permissions.includes(permission);
  const isStudent = actor.roles.includes("student") && !actor.roles.some(role => role === "admin" || role === "teacher");
  const main: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", active: exact("/dashboard") },
    ...(can("dashboard:view") ? [
      { href: "/calendar", label: "Kalender", icon: "calendar", active: exact("/calendar") } satisfies NavItem,
      { href: "/notifications", label: "Notifikasi", icon: "history", active: exact("/notifications") } satisfies NavItem,
    ] : []),
    ...(can("learning.view") ? [
      { href: "/learning", label: "Pembelajaran", icon: "book", active: (path: string) => path.startsWith("/learning") } satisfies NavItem,
      { href: "/projects", label: "Projects", icon: "board", active: (path: string) => path.startsWith("/projects") } satisfies NavItem,
      { href: "/attendance", label: "Kehadiran", icon: "attendance", active: (path: string) => path.startsWith("/attendance") } satisfies NavItem,
      { href: "/gamification", label: "Pertumbuhan", icon: "star", active: (path: string) => path.startsWith("/gamification") } satisfies NavItem,
    ] : []),
    ...(can("reports.view") ? [{ href: "/reports", label: "Laporan", icon: "chart", active: (path: string) => path.startsWith("/reports") } satisfies NavItem] : []),
  ];
  const admin: NavItem[] = ([
    ["/admin/users", "Akun & profil", "users", "admin.users.manage"],
    ["/admin/academic", "Akademik", "academic", "academic.manage"],
    ["/admin/audit", "Audit log", "history", "audit.view"],
  ] as const).filter(([, , , permission]) => can(permission)).map(([href, label, icon]) => ({ href, label, icon, active: exact(href) }));
  const future: FutureItem[] = [];
  const groups: NavGroup[] = [{ items: main },...(admin.length ? [{ label: "Administrasi", items: admin }] : [])];
  return { isStudent, groups, future, pages: groups.flatMap(group => group.items) };
}

const roleLabels: Record<string, string> = { admin: "Admin", teacher: "Guru", student: "Santri" };
export const roleLabel = (actor: Actor) => actor.roles.map(role => roleLabels[role] ?? role).join(" · ");
