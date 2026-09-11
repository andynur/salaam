import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Actor } from "../core/permissions";
import { api, ApiError } from "./lib/api";
import { ErrorState, LoadingState } from "./components/ui";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Foundation, AcademicFoundation } from "./pages/Foundation";
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
    try { setSession(await api<Session>("/api/auth/me")); if (!location.pathname.startsWith("/admin/")) history.replaceState(null, "", "/dashboard"); }
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
  const permission = path === "/admin/users" ? "admin.users.manage" : path === "/admin/audit" ? "audit.view" : "academic.manage";
  const content = adminPage ? !session.actor.permissions.includes(permission) ? <ErrorState message="Anda tidak memiliki akses ke halaman ini." /> : path === "/admin/academic" ? <AcademicFoundation timezone={session.timezone} onExpired={expired} /> : <Foundation resource={path === "/admin/users" ? "users" : "audit"} timezone={session.timezone} onExpired={expired} /> : <Dashboard actor={session.actor} timezone={session.timezone} onExpired={expired} />;
  return <Shell actor={session.actor} onLogout={() => void logout()} pending={loggingOut}>{error && <ErrorState message={error} />}{content}</Shell>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Never serialize user content into logs. */ }
  render() { return this.state.failed ? <div className="standalone-error"><ErrorState message="Halaman mengalami gangguan." retry={() => location.reload()} /></div> : this.props.children; }
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<ErrorBoundary><App /></ErrorBoundary>);
