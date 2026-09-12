import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { FoundationResource, RecordPage, RecordRow } from "../../shared/foundation";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Icon } from "../components/icons";

type Field = { key: string; label: string; type?: string; max?: number; source?: FoundationResource; role?: string };
type Definition = { title: string; action: string; description: string; columns: [string, string][]; fields: Field[] };
const name: Field = { key: "name", label: "Nama", max: 100 };
const year: Field = { key: "yearId", label: "Tahun ajaran", source: "years" };
const classField: Field = { key: "classId", label: "Kelas", source: "classes" };
const dateFields: Field[] = [{ key: "startsOn", label: "Tanggal mulai", type: "date" }, { key: "endsOn", label: "Tanggal selesai", type: "date" }];
const definitions: Record<FoundationResource, Definition> = {
  users: { title: "Akun & profil", action: "Buat akun", description: "Daftarkan santri, guru, dan admin beserta nomor identitasnya.",
    columns: [["name", "Nama"], ["email", "Email"], ["roles", "Role"], ["identifier", "Nomor identitas"], ["isActive", "Aktif"]],
    fields: [name, { key: "email", label: "Email", type: "email", max: 254 }, { key: "role", label: "Role", type: "role" }, { key: "identifier", label: "NIS / nomor pegawai", max: 50 }, { key: "password", label: "Kata sandi awal (12–128 karakter)", type: "password", max: 128 }] },
  years: { title: "Tahun ajaran", action: "Tambah tahun ajaran", description: "Atur rentang tahun ajaran sebelum membuat semester dan kelas.", columns: [["name", "Tahun ajaran"], ["startsOn", "Mulai"], ["endsOn", "Selesai"]], fields: [name, ...dateFields] },
  terms: { title: "Semester", action: "Tambah semester", description: "Tanggal semester harus berada di dalam rentang tahun ajaran.", columns: [["name", "Semester"], ["year", "Tahun ajaran"], ["startsOn", "Mulai"], ["endsOn", "Selesai"]], fields: [name, year, ...dateFields] },
  classes: { title: "Kelas", action: "Tambah kelas", description: "Setiap kelas terikat pada satu tahun ajaran.", columns: [["name", "Kelas"], ["year", "Tahun ajaran"]], fields: [name, year] },
  enrollments: { title: "Enrollment", action: "Enroll santri", description: "Daftarkan santri ke satu kelas per tahun ajaran.", columns: [["name", "Santri"], ["email", "Email"], ["class", "Kelas"], ["year", "Tahun ajaran"]], fields: [{ key: "studentId", label: "Santri", source: "users", role: "student" }, classField] },
  subjects: { title: "Mata pelajaran", action: "Tambah mata pelajaran", description: "Buat katalog mata pelajaran sekolah dengan kode yang unik.", columns: [["code", "Kode"], ["name", "Mata pelajaran"]], fields: [{ key: "code", label: "Kode mata pelajaran", max: 30 }, name] },
  courses: { title: "Course dasar", action: "Tambah course", description: "Hubungkan mata pelajaran, kelas, dan semester dalam tahun ajaran yang sama.", columns: [["name", "Course"], ["subject", "Mata pelajaran"], ["class", "Kelas"], ["term", "Semester"], ["year", "Tahun ajaran"]], fields: [name, { key: "subjectId", label: "Mata pelajaran", source: "subjects" }, classField, { key: "termId", label: "Semester", source: "terms" }] },
  "teaching-assignments": { title: "Penugasan guru", action: "Assign guru", description: "Tugaskan guru aktif ke course yang sudah dibuat.", columns: [["name", "Guru"], ["course", "Course"], ["class", "Kelas"], ["term", "Semester"], ["year", "Tahun ajaran"]], fields: [{ key: "teacherId", label: "Guru", source: "users", role: "teacher" }, { key: "courseId", label: "Course", source: "courses" }] },
  audit: { title: "Audit log", action: "", description: "Riwayat login, pembuatan akun, dan perubahan akademik. Waktu ditampilkan sesuai zona sekolah.", columns: [["createdAt", "Waktu"], ["actor", "Pelaku"], ["name", "Event"], ["resourceType", "Resource"], ["resourceId", "Resource ID"], ["requestId", "Request ID"]], fields: [] },
};
function optionLabel(row: RecordRow) {
  return [row.name, row.email, row.code, row.class, row.term, row.year].filter(Boolean).join(" · ");
}
function Choice({ field, onExpired }: { field: Field; onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<RecordPage | null>(null);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPage(null); setError("");
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q, offset: String(offset), role: field.role ?? "" });
      api<RecordPage>(`/api/admin/${field.source}?${params}`).then(result => { if (active) setPage(result); }).catch(cause => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) onExpired();
        else setError(cause instanceof Error ? cause.message : "Pilihan tidak dapat dimuat.");
      });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [q, offset, field.source, field.role, attempt, onExpired]);
  return <div className="relation-field">
    <input className="input choice-search" type="search" aria-label={`Cari ${field.label}`} placeholder={`Cari ${field.label.toLowerCase()}…`} maxLength={100} value={q} onChange={e => { setQ(e.target.value); setOffset(0); }} />
    <select className="input" id={field.key} name={field.key} required value={selected?.id ?? ""} onChange={e => setSelected(page?.items.find(row => row.id === e.target.value) ?? null)}>
      <option value="">{!page ? "Memuat pilihan…" : page.items.length ? `Pilih ${field.label.toLowerCase()}` : "Belum ada pilihan"}</option>
      {selected && !page?.items.some(row => row.id === selected.id) && <option value={selected.id}>{optionLabel(selected)}</option>}
      {page?.items.map(row => <option key={row.id} value={row.id}>{optionLabel(row)}</option>)}
    </select>
    {error && <ErrorState message={error} retry={() => setAttempt(value => value + 1)} />}
    {page && !page.items.length && <small>Buat data {field.label.toLowerCase()} terlebih dahulu atau ubah pencarian.</small>}
    {(offset > 0 || page?.nextOffset !== null && page?.nextOffset !== undefined) && <div className="choice-pager"><button type="button" disabled={!page || offset === 0} onClick={() => setOffset(offset - 50)}>Sebelumnya</button><button type="button" disabled={!page || page.nextOffset === null} onClick={() => setOffset(page!.nextOffset!)}>Berikutnya</button></div>}
  </div>;
}
export function Foundation({ resource, timezone, onExpired, title, tabs }: { resource: FoundationResource; timezone: string; onExpired: () => void; title?: string; tabs?: ReactNode }) {
  const definition = definitions[resource];
  const [creating, setCreating] = useState(false);
  const [recovery, setRecovery] = useState<RecordRow | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const recoveryPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (creating) panel.current?.querySelector<HTMLElement>("input, select")?.focus(); }, [creating]);
  useEffect(() => { if (recovery) recoveryPanel.current?.querySelector<HTMLElement>("input")?.focus(); }, [recovery]);
  const [page, setPage] = useState<RecordPage | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    setPage(null); setError("");
    api<RecordPage>(`/api/admin/${resource}?${new URLSearchParams({ q: search, offset: String(offset) })}`).then(result => { if (active) setPage(result); }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Data tidak dapat dimuat.");
    });
    return () => { active = false; };
  }, [resource, search, offset, revision, onExpired]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setPending(true); setSaveError(""); setSuccess("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/admin/${resource}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSuccess(`${definition.action} berhasil.`); setFormRevision(value => value + 1);
      setQ(""); setSearch(""); setOffset(0); setRevision(value => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setSaveError(cause instanceof Error ? cause.message : "Data tidak dapat disimpan.");
    } finally { saving.current = false; setPending(false); }
  }
  // Account recovery. The reset ends every session of that account, including the
  // administrator's own when they reset themselves, which surfaces as an expired session.
  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !recovery) return;
    saving.current = true; setPending(true); setSaveError(""); setSuccess("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const result = await api<{ sessionsRevoked: number }>(`/api/admin/users/${recovery.id}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      setSuccess(`Kata sandi ${recovery.name ?? "akun"} diperbarui. ${result.sessionsRevoked} sesi aktif diakhiri.`);
      setRecovery(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setSaveError(cause instanceof Error ? cause.message : "Kata sandi tidak dapat diperbarui.");
    } finally { saving.current = false; setPending(false); }
  }
  function display(row: RecordRow, key: string) {
    const value = row[key];
    if (key === "createdAt" && typeof value === "string") return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
    return typeof value === "boolean" ? <span className={`badge ${value ? "badge-success" : "badge-draft"}`}>{value ? "Ya" : "Tidak"}</span> : value ?? "—";
  }
  const canCreate = definition.fields.length > 0;
  const recoverable = resource === "users";
  function toggleCreate(open: boolean) { setCreating(open); setRecovery(null); setSuccess(""); setSaveError(""); }
  function openRecovery(row: RecordRow) { setCreating(false); setSuccess(""); setSaveError(""); setRecovery(row); }
  return <>
    <PageHeader breadcrumbs={[{ label: "Administrasi" }]} title={title ?? definition.title} description={definition.description}
      actions={canCreate && <Button aria-expanded={creating} aria-controls="create-panel" className={creating ? "button-secondary" : ""} onClick={() => toggleCreate(!creating)}><Icon name={creating ? "close" : "plus"} />{creating ? "Tutup formulir" : definition.action}</Button>} />
    {tabs}
    {canCreate && creating && <div id="create-panel" ref={panel}><Card className="admin-form-card"><h2>{definition.action}</h2>
      <form key={formRevision} onSubmit={event => void submit(event)}><fieldset disabled={pending} className="admin-fields">
        {definition.fields.map(field => <div className="admin-field" key={field.key}><label htmlFor={field.key}>{field.label}</label>{field.source ? <Choice field={field} onExpired={onExpired} /> : field.type === "role" ? <select className="input" id={field.key} name={field.key} required defaultValue="student"><option value="student">Santri</option><option value="teacher">Guru</option><option value="admin">Admin</option></select> : <input className="input" id={field.key} name={field.key} type={field.type ?? "text"} required maxLength={field.max} minLength={field.type === "password" ? 12 : undefined} autoComplete={field.type === "password" ? "new-password" : "off"} {...(field.type === "date" ? { min: "1900-01-01", max: "2200-12-31" } : {})} />}</div>)}
        <div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : definition.action}</Button></div>
      </fieldset></form>
      {saveError && <ErrorState message={saveError} />}
    </Card></div>}
    {recoverable && recovery && <div id="recovery-panel" ref={recoveryPanel}><Card className="admin-form-card"><h2>Atur ulang kata sandi</h2>
      <p>Akun <strong>{recovery.name ?? recovery.email}</strong> ({recovery.email}). Semua sesi aktif akun ini langsung diakhiri, dan kata sandi baru harus disampaikan secara pribadi.</p>
      <form onSubmit={event => void submitRecovery(event)}><fieldset disabled={pending} className="admin-fields">
        <div className="admin-field"><label htmlFor="recovery-password">Kata sandi baru (12–128 karakter)</label><input className="input" id="recovery-password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></div>
        <div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Atur ulang kata sandi"}</Button><Button type="button" className="button-secondary" disabled={pending} onClick={() => setRecovery(null)}>Batal</Button></div>
      </fieldset></form>
      {saveError && <ErrorState message={saveError} />}
    </Card></div>}
    {success && <p className="success-state" role="status">{success}</p>}
    <Card><div className="card-heading"><h2>Daftar {definition.title.toLowerCase()}</h2><form className="table-search" onSubmit={event => { event.preventDefault(); setSearch(q); setOffset(0); }}><input className="input" type="search" aria-label="Cari data" placeholder="Cari data…" maxLength={100} value={q} onChange={event => setQ(event.target.value)} /><Button className="button-secondary button-small" type="submit">Cari</Button></form></div>
      {error ? <ErrorState message={error} retry={() => setRevision(value => value + 1)} /> : !page ? <LoadingState /> : !page.items.length ? <EmptyState title="Belum ada data" description={search ? "Tidak ada hasil yang sesuai. Coba pencarian lain." : "Data yang sudah tercatat akan muncul di sini."} action={canCreate && !search && !creating && <Button onClick={() => toggleCreate(true)}><Icon name="plus" />{definition.action}</Button>} /> : <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabel ${definition.title}`}><table className="data-table"><thead><tr>{definition.columns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}{recoverable && <th scope="col">Aksi</th>}</tr></thead><tbody>{page.items.map(row => <tr key={row.id}>{definition.columns.map(([key]) => <td key={key}>{display(row, key)}</td>)}{recoverable && <td className="table-action"><Button className="button-secondary button-small" aria-expanded={recovery?.id === row.id} aria-controls="recovery-panel" onClick={() => openRecovery(row)}><Icon name="key" />Atur ulang sandi</Button></td>}</tr>)}</tbody></table></div>}
      <div className="table-pagination"><span>{page ? `${page.items.length ? offset + 1 : 0}–${offset + page.items.length} ditampilkan` : "Memuat…"}</span><div><Button className="button-secondary button-small" disabled={!page || offset === 0} onClick={() => setOffset(offset - 50)}>Sebelumnya</Button><Button className="button-secondary button-small" disabled={!page || page.nextOffset === null} onClick={() => setOffset(page!.nextOffset!)}>Berikutnya</Button></div></div>
    </Card>
  </>;
}
export function AcademicFoundation({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const [resource, setResource] = useState<FoundationResource>("years");
  const tabs = <nav className="tabs" aria-label="Administrasi akademik">{Object.entries(definitions).filter(([key]) => key !== "users" && key !== "audit").map(([key, definition]) => <button key={key} className={resource === key ? "tab-active" : ""} aria-current={resource === key ? "page" : undefined} onClick={() => setResource(key as FoundationResource)}>{definition.title}</button>)}</nav>;
  return <Foundation key={resource} resource={resource} title="Akademik" tabs={tabs} timezone={timezone} onExpired={onExpired} />;
}

type ImportPreview = { mode: "preview"; rows: { row: number; email: string; identifier: string; errors: string[]; action: string }[] };
function parseCsv(value: string) {
  const lines: string[][] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === '"') { if (quoted && value[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && value[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) lines.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(Boolean)) lines.push(row); }
  if (!lines.length || lines[0]!.map(header => header.toLowerCase()).join(",") !== "nama,email,identifier,password") throw new Error("Header harus: nama,email,identifier,password");
  return lines.slice(1).map(columns => ({ name: columns[0] ?? "", email: columns[1] ?? "", identifier: columns[2] ?? "", password: columns[3] ?? "" }));
}
export function StudentImport({ onExpired }: { onExpired: () => void }) {
  const [csv, setCsv] = useState("nama,email,identifier,password\n");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, mode: "preview" | "commit") {
    event.preventDefault(); setError(""); setMessage(""); setPending(true);
    try {
      const form = new FormData(event.currentTarget);
      const rows = parseCsv(csv);
      const result = await api<ImportPreview & { created?: number; enrolled?: number; skipped?: number }>("/api/admin/imports/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, classId: form.get("classId"), rows }) });
      if (mode === "preview") setPreview(result);
      else { setMessage(`${result.created} akun dibuat, ${result.enrolled} enrollment diproses, ${result.skipped} baris sudah ada.`); setPreview(null); }
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(cause instanceof Error ? cause.message : "Import tidak dapat diproses."); }
    finally { setPending(false); }
  }
  const hasErrors = preview?.rows.some(row => row.errors.length) ?? false;
  return <div className="lesson-workspace"><PageHeader breadcrumbs={[{ label: "Administrasi" }]} title="Import santri" description="Validasi CSV terlebih dahulu, lalu simpan akun dan enrollment secara atomik." />
    <Card className="admin-form-card"><form onSubmit={event => void submit(event, "preview")}><fieldset disabled={pending} className="admin-fields"><div className="admin-field"><label htmlFor="import-class">Kelas tujuan</label><Choice field={classField} onExpired={onExpired} /></div><div className="admin-field"><label htmlFor="student-csv">CSV santri</label><textarea className="input" id="student-csv" rows={12} value={csv} onChange={event => setCsv(event.target.value)} spellCheck={false} aria-describedby="student-csv-help" /></div><p id="student-csv-help" className="card-hint">Format wajib: nama,email,identifier,password. Maksimal 500 baris. Kata sandi awal harus 12–128 karakter.</p><div className="form-actions"><Button type="submit">{pending ? "Memeriksa…" : "Preview validasi"}</Button></div></fieldset></form></Card>
    {error && <ErrorState message={error} />}{message && <p className="success-state" role="status">{message}</p>}
    {preview && <Card><div className="card-heading"><h2>Hasil validasi</h2><span>{preview.rows.length} baris</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Baris</th><th>Email</th><th>Identifier</th><th>Hasil</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{row.email || "—"}</td><td>{row.identifier || "—"}</td><td>{row.errors.length ? row.errors.join(" ") : row.action === "skip" ? "Sudah terdaftar" : row.action === "enroll" ? "Tambahkan ke kelas" : "Akan dibuat"}</td></tr>)}</tbody></table></div>{!hasErrors && <form onSubmit={event => void submit(event, "commit")}><input type="hidden" name="classId" value={(document.querySelector("#classId") as HTMLSelectElement | null)?.value ?? ""} /><div className="form-actions"><Button type="submit" disabled={pending}>Simpan import</Button></div></form>}</Card>}
  </div>;
}
