import { useRef, useState, type FormEvent } from "react";
import type { Actor } from "../../core/permissions";
import type { AccountProfile, PasswordChangeResult } from "../../shared/account";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState, LoadingState, PageHeader, PanelHeading } from "../components/ui";
import { Icon } from "../components/icons";
import { formatDateTime, useData } from "../components/learning";
import { roleName, roleTone } from "../layouts/navigation";

// The signed-in user's own page, opened from the account menu. Profile fields are read-only here:
// administrators keep managing name, email, role, and identifiers under Administrasi → Pengguna.
export function Account({ actor, timezone, onExpired }: { actor: Actor; timezone: string; onExpired: () => void }) {
  const [revision, setRevision] = useState(0);
  const view = useData<AccountProfile>("/api/auth/account", onExpired, revision);
  const initial = actor.displayName.trim().charAt(0).toUpperCase() || "?";
  const identifiers = view.data?.roles.map(role => role.identifier).filter(Boolean).join(", ");
  return <>
    <PageHeader title="Profil saya" description="Informasi akun dan keamanan kata sandi Anda." />
    <div className="account-layout">
      <Card>
        <div className="card-heading"><h2>Informasi akun</h2></div>
        {view.error ? <ErrorState message={view.error} retry={view.retry} /> : !view.data ? <LoadingState /> : <>
          <div className="account-identity"><span className="avatar avatar-xl" aria-hidden="true">{initial}</span><div><strong>{view.data.name}</strong><span>{view.data.email}</span></div></div>
          <dl className="account-facts">
            <dt>Role</dt><dd><span className="badge-group">{view.data.roles.map(role => <span key={role.role} className={`badge ${roleTone(role.role)}`}>{roleName(role.role)}</span>)}</span></dd>
            <dt>Nomor identitas</dt><dd>{identifiers || "—"}</dd>
            <dt>Terdaftar sejak</dt><dd>{formatDateTime(view.data.createdAt, timezone)}</dd>
            <dt>Sesi aktif</dt><dd>{view.data.activeSessions} perangkat</dd>
          </dl>
          <p className="account-note"><Icon name="info" />Nama, email, role, dan nomor identitas dikelola oleh admin sekolah.</p>
        </>}
      </Card>
      <div className="account-side">
        <PasswordForm onExpired={onExpired} changed={() => setRevision(value => value + 1)} />
        {actor.permissions.includes("dashboard:view") && <Card>
          <div className="card-heading"><h2>Notifikasi</h2></div>
          <p className="account-links-text">Atur pengingat agenda, kenaikan level, dan pembukaan absensi QR.</p>
          <div className="account-links">
            <a className="button button-secondary button-small" href="/notifications"><Icon name="bell" />Buka notifikasi</a>
            <a className="button button-secondary button-small" href="/notifications?preferences=1">Atur preferensi</a>
          </div>
        </Card>}
      </div>
    </div>
  </>;
}

function PasswordForm({ onExpired, changed }: { onExpired: () => void; changed: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formKey, setFormKey] = useState(0);
  const saving = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    setSuccess("");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) { setError("Konfirmasi kata sandi baru tidak sama."); return; }
    saving.current = true; setPending(true); setError("");
    try {
      const result = await api<PasswordChangeResult>("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword }) });
      setSuccess(result.sessionsRevoked ? `Kata sandi diperbarui. ${result.sessionsRevoked} sesi di perangkat lain diakhiri.` : "Kata sandi diperbarui.");
      setFormKey(value => value + 1);
      changed();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Kata sandi tidak dapat diperbarui.");
    } finally { saving.current = false; setPending(false); }
  }
  return <Card className="admin-form-card">
    <PanelHeading title="Ubah kata sandi" description="Gunakan 12–128 karakter. Sesi di perangkat lain akan diakhiri." />
    <form key={formKey} onSubmit={event => void submit(event)}><fieldset disabled={pending} className="admin-fields">
      <div className="admin-field field-wide"><label htmlFor="current-password">Kata sandi saat ini</label><input className="input" id="current-password" name="currentPassword" type="password" required maxLength={128} autoComplete="current-password" /></div>
      <div className="admin-field"><label htmlFor="new-password">Kata sandi baru</label><input className="input" id="new-password" name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></div>
      <div className="admin-field"><label htmlFor="confirm-password">Ulangi kata sandi baru</label><input className="input" id="confirm-password" name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></div>
      <div className="form-actions"><Button type="submit" disabled={pending}><Icon name="lock" />{pending ? "Menyimpan…" : "Simpan kata sandi"}</Button></div>
    </fieldset></form>
    {error && <ErrorState message={error} />}
    {success && <p className="success-state" role="status">{success}</p>}
  </Card>;
}
