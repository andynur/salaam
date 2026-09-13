import { Calendar, Notifications } from "./pages/Calendar";
import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Actor } from "../core/permissions";
import { api, ApiError } from "./lib/api";
import { ErrorState, LoadingState } from "./components/ui";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Foundation, AcademicFoundation, UsersAdmin } from "./pages/Foundation";
import { Account } from "./pages/Account";
import { Learning } from "./pages/Learning";
import { Projects } from "./pages/Projects";
import { Attendance } from "./pages/Attendance";
import { Growth } from "./pages/Growth";
import { Club } from "./pages/Club";
import { Curriculum } from "./pages/Curriculum";
import { Reports } from "./pages/Reports";
import { Links } from "./pages/Links";
import { Shell } from "./layouts/Shell";

type Session = { actor: Actor; timezone: string };
const exactPaths = ["/account", "/curriculum"];
const pathPrefixes = ["/calendar", "/notifications", "/admin/", "/learning", "/projects", "/gamification", "/club", "/reports", "/attendance", "/links"];
const adminPermissions: Record<string, string> = { "/admin/users": "admin.users.manage", "/admin/import": "admin.users.manage", "/admin/academic": "academic.manage", "/admin/transfers": "academic.manage", "/admin/audit": "audit.view" };

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const expired = useCallback(() => { setSession(null); history.replaceState(null, "", "/login"); }, []);
  const loadSession = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setSession(await api<Session>("/api/auth/me"));
      const path = location.pathname;
      if (!exactPaths.includes(path) && !pathPrefixes.some(prefix => path.startsWith(prefix))) history.replaceState(null, "", "/dashboard");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      else setError(cause instanceof Error ? cause.message : "Sesi tidak dapat dimuat.");
    } finally { setLoading(false); }
  }, [expired]);
  useEffect(() => { void loadSession(); }, [loadSession]);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true); setError("");
    try { await api("/api/auth/logout", { method: "POST" }); expired(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Tidak dapat keluar. Coba lagi."); }
    finally { setLoggingOut(false); }
  }
  if (loading) return <LoadingState />;
  if (!session) return error ? <div className="standalone-error"><ErrorState message={error} retry={() => void loadSession()} /></div> : <Login onLogin={loadSession} />;
  const path = location.pathname;
  const { actor, timezone } = session;
  function adminContent() {
    const permission = adminPermissions[path];
    if (!permission) return <ErrorState message="Halaman tidak ditemukan." />;
    if (!actor.permissions.includes(permission)) return <ErrorState message="Anda tidak memiliki akses ke halaman ini." />;
    if (path === "/admin/users" || path === "/admin/import") return <UsersAdmin timezone={timezone} onExpired={expired} />;
    if (path === "/admin/academic" || path === "/admin/transfers") return <AcademicFoundation timezone={timezone} onExpired={expired} />;
    return <Foundation resource="audit" timezone={timezone} onExpired={expired} />;
  }
  const content = path === "/calendar" ? <Calendar actor={actor} onExpired={expired} />
    : path === "/notifications" ? <Notifications onExpired={expired} />
    : path === "/account" ? <Account actor={actor} timezone={timezone} onExpired={expired} />
    : path === "/curriculum" ? <Curriculum onExpired={expired} />
    : path.startsWith("/attendance") ? <Attendance timezone={timezone} onExpired={expired} />
    : path.startsWith("/learning") ? <Learning actor={actor} timezone={timezone} onExpired={expired} />
    : path.startsWith("/projects") ? <Projects actor={actor} timezone={timezone} onExpired={expired} />
    : path.startsWith("/gamification") ? <Growth actor={actor} timezone={timezone} onExpired={expired} />
    : path.startsWith("/club") ? <Club actor={actor} timezone={timezone} onExpired={expired} />
    : path.startsWith("/links") ? <Links onExpired={expired} />
    : path.startsWith("/reports") ? <Reports actor={actor} timezone={timezone} onExpired={expired} />
    : path.startsWith("/admin/") ? adminContent()
    : <Dashboard actor={actor} timezone={timezone} onExpired={expired} />;
  return <Shell actor={actor} timezone={timezone} onLogout={() => void logout()} onExpired={expired} pending={loggingOut}>{error && <ErrorState message={error} />}{content}</Shell>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Never serialize user content into logs. */ }
  render() { return this.state.failed ? <div className="standalone-error"><ErrorState message="Halaman mengalami gangguan." retry={() => location.reload()} /></div> : this.props.children; }
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
