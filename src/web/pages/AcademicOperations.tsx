import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorState, PageHeader, PanelHeading } from "../components/ui";
import { Icon } from "../components/icons";
import { Choice } from "./Foundation";

// The "Transfer kelas" tab of Administrasi → Akademik.
export function ClassTransfer({ tabs, onExpired }: { tabs?: ReactNode; onExpired: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formKey, setFormKey] = useState(0);
  const saving = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const form = new FormData(event.currentTarget);
    saving.current = true; setPending(true); setError(""); setSuccess("");
    try {
      await api("/api/admin/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: form.get("studentId"), toClassId: form.get("toClassId"), reason: form.get("reason") }) });
      setSuccess("Transfer kelas berhasil dicatat. Riwayat kehadiran santri tetap utuh.");
      setFormKey(value => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Transfer tidak dapat diproses.");
    } finally { saving.current = false; setPending(false); }
  }
  return <>
    <PageHeader breadcrumbs={[{ label: "Administrasi" }]} title="Akademik" description="Pindahkan santri ke kelas lain dalam tahun ajaran yang sama tanpa mengubah histori kehadiran." />
    {tabs}
    <Card className="admin-form-card">
      <PanelHeading title="Catat transfer kelas" description="Santri harus sudah terdaftar di kelas pada tahun ajaran yang sama dengan kelas tujuan." />
      <form key={formKey} onSubmit={event => void submit(event)}><fieldset disabled={pending} className="admin-fields">
        <div className="admin-field"><label htmlFor="studentId">Santri</label><Choice field={{ key: "studentId", label: "Santri", source: "users", role: "student" }} onExpired={onExpired} /></div>
        <div className="admin-field"><label htmlFor="toClassId">Kelas tujuan</label><Choice field={{ key: "toClassId", label: "Kelas", source: "classes" }} onExpired={onExpired} /></div>
        <div className="admin-field field-wide"><label htmlFor="transfer-reason">Alasan transfer</label><textarea className="input" id="transfer-reason" name="reason" required maxLength={500} rows={4} /></div>
        <div className="form-actions"><Button type="submit" disabled={pending}><Icon name="transfer" />{pending ? "Menyimpan…" : "Catat transfer"}</Button></div>
      </fieldset></form>
      {error && <ErrorState message={error} />}
    </Card>
    {success && <p className="success-state" role="status">{success}</p>}
  </>;
}
