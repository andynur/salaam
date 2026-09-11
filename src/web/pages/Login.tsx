import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { Button, ErrorState } from "../components/ui";
import logo from "../../../assets/logo-color.png";

export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) });
      await onLogin();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tidak dapat masuk."); }
    finally { setPending(false); }
  }
  return <main className="login-page">
    <section className="login-intro">
      <div className="brand-tile"><img src={logo} alt="HSI Boarding School" /></div>
      <div className="login-copy"><span className="eyebrow">HSI BOARDING SCHOOL</span><h1>Satu ruang.<br />Bertumbuh bersama.</h1><p>Ruang belajar yang menghubungkan ilmu, karya, dan perjalanan setiap santri.</p><div className="intro-rule" /><span className="intro-caption">Belajar dengan arah. Berkarya dengan makna.</span></div>
      <span className="intro-footer">LEARNING OS <span>•</span> RUANG AKADEMIK HSI</span>
    </section>
    <section className="login-form-area"><div className="login-form-wrap">
      <span className="badge">Ruang belajar HSI</span><h2>Selamat datang kembali</h2><p className="text-muted">Masuk dengan akun sekolah untuk melanjutkan.</p>
      <form onSubmit={submit} aria-busy={pending}>
        <label htmlFor="email">Email sekolah</label><input className="input" id="email" name="email" type="email" autoComplete="username" placeholder="nama@sekolah.sch.id" required maxLength={254} disabled={pending} aria-describedby={error ? "login-error" : undefined} />
        <label htmlFor="password">Kata sandi</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" placeholder="Masukkan kata sandi" required maxLength={128} disabled={pending} aria-describedby={error ? "login-error" : undefined} />
        {error && <div id="login-error"><ErrorState message={error} /></div>}
        <Button type="submit" disabled={pending}>{pending ? "Sedang masuk…" : "Masuk ke ruang belajar"}<span aria-hidden="true">→</span></Button>
      </form>
      <p className="login-help">Belum memiliki akun atau kesulitan masuk?<br />Hubungi administrator sekolah.</p>
    </div><p className="login-footer">HSI Learning OS <span>Platform internal sekolah</span></p></section>
  </main>;
}
