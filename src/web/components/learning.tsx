import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { maxUploadBytes } from "../../shared/learning";
import { api, ApiError } from "../lib/api";
import { Button, ErrorState } from "./ui";

export const learningApi = "/api/learning/courses";
export const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "Data tidak dapat dimuat.";
export const formatDateTime = (value: string, timezone: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
export const chosenFile = (form: FormData) => { const file = form.get("file"); return file instanceof File && (file.name || file.size) ? file : null; };
// datetime-local inputs use the device timezone; forms label that timezone explicitly.
export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const toLocalInput = (value: string | null | undefined) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
export const fromLocalInput = (value: FormDataEntryValue | null) => value ? new Date(String(value)).toISOString() : null;

export function useData<T>(path: string, onExpired: () => void, revision = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    api<T>(path).then(result => { if (active) setData(result); }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(errorMessage(cause));
    });
    return () => { active = false; };
  }, [path, onExpired, revision, retry]);
  return { data, error, retry: () => setRetry(value => value + 1) };
}

export function Pager({ offset, next, change }: { offset: number; next: number | null; change: (offset: number) => void }) {
  return <div className="table-pagination"><span>Halaman {offset / 50 + 1}</span><div><Button className="button-secondary button-small" disabled={!offset} onClick={() => change(offset - 50)}>Sebelumnya</Button><Button className="button-secondary button-small" disabled={next === null} onClick={() => next !== null && change(next)}>Berikutnya</Button></div></div>;
}
export function Search({ change }: { change: (q: string) => void }) {
  return <form className="table-search" onSubmit={event => { event.preventDefault(); change(String(new FormData(event.currentTarget).get("q") ?? "")); }}><input name="q" className="input" type="search" aria-label="Cari data" placeholder="Cari…" maxLength={100} /><Button type="submit" className="button-secondary button-small">Cari</Button></form>;
}
export function Status({ published }: { published: boolean }) { return <span className={`badge ${published ? "badge-success" : "badge-draft"}`}>{published ? "Terbit" : "Draft"}</span>; }

export function MutationForm({ path, label, body, saved, onExpired, children, method = "POST", disabled = false }: { path: string; label: string; body: (form: FormData) => unknown; saved: () => void; onExpired: () => void; children?: ReactNode; method?: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || disabled) return;
    const payload = body(new FormData(event.currentTarget));
    const file = payload instanceof FormData ? chosenFile(payload) : null;
    if (file && file.size > maxUploadBytes) { setError("Ukuran berkas maksimal 10 MB."); return; }
    saving.current = true; setPending(true); setError("");
    try {
      // Multipart bodies let the browser set the boundary header itself.
      await api(path, payload instanceof FormData ? { method, body: payload } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      saved();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { saving.current = false; setPending(false); }
  }
  return <form className="learning-form" onSubmit={event => void submit(event)}><fieldset className="admin-fields" disabled={pending || disabled}>{children}<div className="form-actions"><Button type="submit" disabled={pending || disabled}>{pending ? "Menyimpan…" : label}</Button></div></fieldset>{error && <ErrorState message={error} />}</form>;
}
export function Field({ label, name, value = "", area = false, type = "text", required = true, max = 150, min, step }: { label: string; name: string; value?: string | number | undefined; area?: boolean; type?: string; required?: boolean; max?: number; min?: number; step?: string }) {
  return <label className={`learning-field ${area ? "field-wide" : ""}`}><span>{label}</span>{area ? <textarea className="input" name={name} required={required} maxLength={max} defaultValue={value} rows={5} /> : <input className="input" name={name} required={required} maxLength={type === "text" ? max : undefined} type={type} defaultValue={value} min={min} max={type === "number" ? max : undefined} step={step} />}</label>;
}
