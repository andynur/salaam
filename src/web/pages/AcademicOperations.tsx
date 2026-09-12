import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState, PageHeader } from "../components/ui";
import { Choice } from "./Foundation";

export function ClassTransfer({ onExpired }: { onExpired: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    try { await api("/api/admin/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: form.get("studentId"), toClassId: form.get("toClassId"), reason: form.get("reason") }) }); setSuccess("Transfer kelas berhasil dicatat."); event.currentTarget.reset(); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(cause instanceof Error ? cause.message : "Transfer tidak dapat diproses."); }
    finally { setPending(false); }
  }
  return <div className="lesson-workspace"><PageHeader breadcrumbs={[{ label: "Administrasi" }]} title="Transfer kelas" description="Pindahkan santri ke kelas lain dalam tahun ajaran yang sama tanpa mengubah histori attendance." />
    <Card className="admin-form-card"><form onSubmit={event => void submit(event)}><fieldset disabled={pending} className="admin-fields"><div className="admin-field"><label>Santri</label><Choice field={{ key: "studentId", label: "santri", source: "users", role: "student" }} onExpired={onExpired} /></div><div className="admin-field"><label>Kelas tujuan</label><Choice field={{ key: "toClassId", label: "kelas", source: "classes" }} onExpired={onExpired} /></div><div className="admin-field"><label htmlFor="transfer-reason">Alasan transfer</label><textarea className="input" id="transfer-reason" name="reason" required maxLength={500} rows={4} /></div><div className="form-actions"><Button type="submit">{pending ? "Menyimpan…" : "Catat transfer"}</Button></div></fieldset></form></Card>
    {error && <ErrorState message={error} />}{success && <p className="success-state" role="status">{success}</p>}
  </div>;
}
