import { Calendar, Notifications } from "./pages/Calendar";
import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Actor } from "../core/permissions";
import { api, ApiError } from "./lib/api";
import { ErrorState, LoadingState } from "./components/ui";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Foundation, AcademicFoundation, StudentImport } from "./pages/Foundation";
import { Learning } from "./pages/Learning";
import { Projects } from "./pages/Projects";
import { Attendance } from "./pages/Attendance";
import { Growth } from "./pages/Growth";
import { Reports } from "./pages/Reports";
import { Shell } from "./layouts/Shell";

type Session = { actor: Actor; timezone: string };
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const expired = useCallback(() => { setSession(null); history.replaceState(null, "", "/login"); }, []);
  const loadSession = useCallback(async () => {
    setLoading(true); setError("");
    try { setSession(await api<Session>("/api/auth/me")); if (!location.pathname.startsWith("/calendar") && !location.pathname.startsWith("/notifications") && !location.pathname.startsWith("/admin/") && !location.pathname.startsWith("/learning") && !location.pathname.startsWith("/projects") && !location.pathname.startsWith("/gamification") && !location.pathname.startsWith("/reports") && !location.pathname.startsWith("/attendance")) history.replaceState(null, "", "/dashboard"); }
    catch (cause) {
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
  const adminPage = path.startsWith("/admin/");
  const permission = path === "/admin/users" || path === "/admin/import" ? "admin.users.manage" : path === "/admin/audit" ? "audit.view" : "academic.manage";
  const content = path === "/calendar" ? <Calendar actor={session.actor} onExpired={expired} /> : path === "/notifications" ? <Notifications onExpired={expired} /> : path.startsWith("/attendance") ? <Attendance timezone={session.timezone} onExpired={expired} /> : path.startsWith("/learning") ? <Learning timezone={session.timezone} onExpired={expired} />
    : path.startsWith("/projects") ? <Projects actor={session.actor} timezone={session.timezone} onExpired={expired} />
    : path.startsWith("/gamification") ? <Growth actor={session.actor} timezone={session.timezone} onExpired={expired} />
    : path.startsWith("/reports") ? <Reports actor={session.actor} timezone={session.timezone} onExpired={expired} /> : adminPage ? !session.actor.permissions.includes(permission) ? <ErrorState message="Anda tidak memiliki akses ke halaman ini." /> : path === "/admin/academic" ? <AcademicFoundation timezone={session.timezone} onExpired={expired} /> : path === "/admin/import" ? <StudentImport onExpired={expired} /> : <Foundation resource={path === "/admin/users" ? "users" : "audit"} timezone={session.timezone} onExpired={expired} /> : <Dashboard actor={session.actor} timezone={session.timezone} onExpired={expired} />;
  return <Shell actor={session.actor} onLogout={() => void logout()} onExpired={expired} pending={loggingOut}>{error && <ErrorState message={error} />}{content}</Shell>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Never serialize user content into logs. */ }
  render() { return this.state.failed ? <div className="standalone-error"><ErrorState message="Halaman mengalami gangguan." retry={() => location.reload()} /></div> : this.props.children; }
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
