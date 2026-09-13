import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { FoundationResource, RecordPage, RecordRow } from "../../shared/foundation";
import { api, ApiError } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, PanelHeading, PersonName } from "../components/ui";
import { Icon, type IconName } from "../components/icons";
import { roleName, roleTone } from "../layouts/navigation";
import { ClassTransfer } from "./AcademicOperations";

type Field = { key: string; label: string; type?: string; max?: number; source?: FoundationResource; role?: string };
type Definition = { title: string; action: string; description: string; icon: IconName; columns: [string, string][]; fields: Field[] };
const name: Field = { key: "name", label: "Nama", max: 100 };
const year: Field = { key: "yearId", label: "Tahun ajaran", source: "years" };
const classField: Field = { key: "classId", label: "Kelas", source: "classes" };
const dateFields: Field[] = [{ key: "startsOn", label: "Tanggal mulai", type: "date" }, { key: "endsOn", label: "Tanggal selesai", type: "date" }];
const definitions: Record<FoundationResource, Definition> = {
  users: { title: "Akun pengguna", action: "Buat akun", description: "Daftarkan santri, guru, asisten mentor, dan admin beserta nomor identitasnya.", icon: "users",
    columns: [["name", "Nama"], ["email", "Email"], ["roles", "Role"], ["identifier", "Nomor identitas"], ["isActive", "Status"]],
    fields: [name, { key: "email", label: "Email", type: "email", max: 254 }, { key: "role", label: "Role", type: "role" }, { key: "identifier", label: "NIS / nomor pegawai", max: 50 }, { key: "password", label: "Kata sandi awal (12–128 karakter)", type: "password", max: 128 }] },
  years: { title: "Tahun ajaran", action: "Tambah tahun ajaran", description: "Atur rentang tahun ajaran sebelum membuat semester dan kelas.", icon: "calendar", columns: [["name", "Tahun ajaran"], ["startsOn", "Mulai"], ["endsOn", "Selesai"], ["archived", "Status"]], fields: [name, ...dateFields] },
  terms: { title: "Semester", action: "Tambah semester", description: "Tanggal semester harus berada di dalam rentang tahun ajaran.", icon: "layers", columns: [["name", "Semester"], ["year", "Tahun ajaran"], ["startsOn", "Mulai"], ["endsOn", "Selesai"], ["archived", "Status"]], fields: [name, year, ...dateFields] },
  classes: { title: "Kelas", action: "Tambah kelas", description: "Setiap kelas terikat pada satu tahun ajaran.", icon: "board", columns: [["name", "Kelas"], ["year", "Tahun ajaran"], ["archived", "Status"]], fields: [name, year] },
  enrollments: { title: "Enrollment", action: "Enroll santri", description: "Daftarkan santri ke satu kelas per tahun ajaran.", icon: "attendance", columns: [["name", "Santri"], ["email", "Email"], ["class", "Kelas"], ["year", "Tahun ajaran"]], fields: [{ key: "studentId", label: "Santri", source: "users", role: "student" }, classField] },
  subjects: { title: "Mata pelajaran", action: "Tambah mata pelajaran", description: "Buat katalog mata pelajaran sekolah dengan kode yang unik.", icon: "assignment", columns: [["code", "Kode"], ["name", "Mata pelajaran"]], fields: [{ key: "code", label: "Kode mata pelajaran", max: 30 }, name] },
  courses: { title: "Course dasar", action: "Tambah course", description: "Hubungkan mata pelajaran, kelas, dan semester dalam tahun ajaran yang sama.", icon: "book", columns: [["name", "Course"], ["subject", "Mata pelajaran"], ["class", "Kelas"], ["term", "Semester"], ["year", "Tahun ajaran"]], fields: [name, { key: "subjectId", label: "Mata pelajaran", source: "subjects" }, classField, { key: "termId", label: "Semester", source: "terms" }] },
  "teaching-assignments": { title: "Penugasan pembelajaran", action: "Tugaskan pendamping", description: "Tugaskan guru atau asisten mentor aktif ke course yang sudah dibuat.", icon: "pen", columns: [["name", "Pendamping"], ["course", "Course"], ["class", "Kelas"], ["term", "Semester"], ["year", "Tahun ajaran"]], fields: [{ key: "teacherId", label: "Guru atau asisten mentor", source: "users" }, { key: "courseId", label: "Course", source: "courses" }] },
  audit: { title: "Audit log", action: "", description: "Riwayat login, pembuatan akun, dan perubahan akademik. Waktu ditampilkan sesuai zona sekolah.", icon: "shield", columns: [["createdAt", "Waktu"], ["actor", "Pelaku"], ["name", "Event"], ["resourceType", "Resource"], ["requestId", "Request ID"]], fields: [] },
};
// Every recorded event is "<category>.<action...>" (e.g. "gamification.badge.awarded").
// The admin audit log groups by that prefix — a lozenge plus icon per category — and
// offers it as a filter, so an administrator can scan for one kind of activity at a glance
// instead of reading raw event strings.
type AuditCategory = { id: string; label: string; icon: IconName; tone: string };
const auditCategories: AuditCategory[] = [
  { id: "auth", label: "Autentikasi", icon: "key", tone: "badge-discovery" },
  { id: "user", label: "Akun", icon: "users", tone: "badge" },
  { id: "academic", label: "Akademik", icon: "academic", tone: "badge-draft" },
  { id: "classroom", label: "Kelas & presensi", icon: "attendance", tone: "badge-success" },
  { id: "assessment", label: "Asesmen", icon: "quiz", tone: "badge-gold" },
  { id: "activity", label: "Aktivitas", icon: "assignment", tone: "badge-gold" },
  { id: "learning", label: "Pembelajaran", icon: "book", tone: "badge-success" },
  { id: "survey", label: "Survei", icon: "quiz", tone: "badge-draft" },
  { id: "calendar", label: "Kalender", icon: "calendar", tone: "badge" },
  { id: "club", label: "Klub", icon: "club", tone: "badge-discovery" },
  { id: "curriculum", label: "Kurikulum", icon: "route", tone: "badge-success" },
  { id: "project", label: "Proyek", icon: "board", tone: "badge" },
  { id: "portfolio", label: "Portofolio", icon: "briefcase", tone: "badge-draft" },
  { id: "gamification", label: "Gamifikasi", icon: "star", tone: "badge-gold" },
  { id: "notification", label: "Notifikasi", icon: "info", tone: "badge-draft" },
  { id: "report", label: "Laporan", icon: "chart", tone: "badge-draft" },
  { id: "demo_seed", label: "Demo seed", icon: "refresh", tone: "badge-draft" },
];
const auditCategoryMap = new Map(auditCategories.map(category => [category.id, category]));
const otherAuditCategory: AuditCategory = { id: "other", label: "Lainnya", icon: "info", tone: "badge-draft" };
function auditCategoryOf(event: string): AuditCategory {
  return auditCategoryMap.get(event.split(".")[0] ?? "") ?? otherAuditCategory;
}
function auditActionLabel(event: string) {
  const parts = event.split(".");
  return (parts.length > 1 ? parts.slice(1) : parts).join(" ").replaceAll("_", " ");
}
function optionLabel(row: RecordRow) {
  return [row.name, row.email, row.code, row.class, row.term, row.year].filter(Boolean).join(" · ");
}
// Resources whose name column is a person, shown with <PersonName> like every other roster.
const personResources = new Set<FoundationResource>(["users", "enrollments", "teaching-assignments"]);
const dateOnly = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });

// Administration sections with more than one screen (Pengguna, Akademik) share one header and
// switch screens with these tabs. Each tab keeps its own URL so reloads and search land on it.
type AdminTab = { id: string; label: string; icon: IconName; href: string };
function AdminTabs({ label, tabs, current, choose }: { label: string; tabs: AdminTab[]; current: string; choose: (id: string) => void }) {
  return <nav className="tabs admin-tabs" aria-label={label}>{tabs.map(tab => <button type="button" key={tab.id} className={tab.id === current ? "tab-active" : ""} aria-current={tab.id === current ? "page" : undefined}
    onClick={() => { history.replaceState(null, "", tab.href); choose(tab.id); }}><Icon name={tab.icon} />{tab.label}</button>)}</nav>;
}

export function Choice({ field, onExpired }: { field: Field; onExpired: () => void }) {
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
  const [editingUser, setEditingUser] = useState<RecordRow | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const recoveryPanel = useRef<HTMLDivElement>(null);
  const editPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (creating) panel.current?.querySelector<HTMLElement>("input, select")?.focus(); }, [creating]);
  useEffect(() => { if (recovery) recoveryPanel.current?.querySelector<HTMLElement>("input")?.focus(); }, [recovery]);
  useEffect(() => { if (editingUser) editPanel.current?.querySelector<HTMLElement>("input")?.focus(); }, [editingUser]);
  const [page, setPage] = useState<RecordPage | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [formRevision, setFormRevision] = useState(0);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const isAudit = resource === "audit";
  useEffect(() => {
    let active = true;
    setPage(null); setError("");
    const params = new URLSearchParams({ q: search, offset: String(offset) });
    if (isAudit && category) params.set("category", category);
    api<RecordPage>(`/api/admin/${resource}?${params}`).then(result => { if (active) setPage(result); }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else setError(cause instanceof Error ? cause.message : "Data tidak dapat dimuat.");
    });
    return () => { active = false; };
  }, [resource, search, category, isAudit, offset, revision, onExpired]);
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
  async function submitUserEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !editingUser) return;
    saving.current = true; setPending(true); setSaveError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/admin/users/${editingUser.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), identifier: form.get("identifier"), role: form.get("role"), isActive: form.get("isActive") === "on" }) });
      setSuccess("Akun diperbarui."); setEditingUser(null); setRevision(value => value + 1);
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setSaveError(cause instanceof Error ? cause.message : "Akun tidak dapat diperbarui."); }
    finally { saving.current = false; setPending(false); }
  }
  const archivable = ["years", "terms", "classes"].includes(resource);
  async function toggleArchive(row: RecordRow) {
    const archived = row.archived === true;
    if (!window.confirm(`${archived ? "Pulihkan" : "Arsipkan"} ${row.name ?? "data ini"}?`)) return;
    setSaveError(""); setSuccess("");
    try { await api(`/api/admin/academic/${resource}/${row.id}/archive`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !archived }) }); setSuccess(`${archived ? "Data dipulihkan" : "Data diarsipkan"}.`); setRevision(value => value + 1); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setSaveError(cause instanceof Error ? cause.message : "Status arsip tidak dapat diubah."); }
  }
  function display(row: RecordRow, key: string) {
    const value = row[key];
    if (key === "createdAt" && typeof value === "string") return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
    if ((key === "startsOn" || key === "endsOn") && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dateOnly.format(new Date(`${value}T00:00:00Z`));
    if (isAudit && key === "name" && typeof value === "string") {
      const category = auditCategoryOf(value);
      return <><span className={`badge ${category.tone}`} title={value}><Icon name={category.icon} size={12} />{category.label}</span>
        <div className="table-sub">{auditActionLabel(value)}</div></>;
    }
    if (key === "name" && personResources.has(resource) && typeof value === "string") {
      const role = resource === "users" ? String(row.roles ?? "") : resource === "teaching-assignments" ? "teacher" : "student";
      return <PersonName name={value} role={role} classroom={resource === "enrollments" ? String(row.class ?? "") : null} />;
    }
    if (isAudit && key === "actor") return value ?? <span className="learning-muted">Sistem</span>;
    // Resource type and id are one identity, the way the report's audit tab shows them.
    if (isAudit && key === "resourceType") return <>{value ?? "—"}{row.resourceId ? <span className="table-sub">{row.resourceId}</span> : null}</>;
    if (key === "roles" && typeof value === "string") return <span className="badge-group">{value.split(",").map(role => role.trim()).filter(Boolean).map(role => <span key={role} className={`badge ${roleTone(role)}`}>{roleName(role)}</span>)}</span>;
    if (key === "isActive") return <span className={`badge ${value === true ? "badge-success" : "badge-draft"}`}>{value === true ? "Aktif" : "Nonaktif"}</span>;
    if (key === "archived") return value === true ? <span className="badge badge-draft"><Icon name="archive" size={12} />Diarsipkan</span> : <span className="badge badge-success">Aktif</span>;
    return typeof value === "boolean" ? <span className={`badge ${value ? "badge-success" : "badge-draft"}`}>{value ? "Ya" : "Tidak"}</span> : value ?? "—";
  }
  const canCreate = definition.fields.length > 0;
  const recoverable = resource === "users";
  function toggleCreate(open: boolean) { setCreating(open); setRecovery(null); setEditingUser(null); setSuccess(""); setSaveError(""); }
  function openRecovery(row: RecordRow) { setCreating(false); setEditingUser(null); setSuccess(""); setSaveError(""); setRecovery(row); }
  function openEdit(row: RecordRow) { setCreating(false); setRecovery(null); setSuccess(""); setSaveError(""); setEditingUser(row); }
  const roleOptions = <><option value="student">Santri</option><option value="teacher">Guru</option><option value="admin">Admin</option></>;
  return <>
    <PageHeader breadcrumbs={[{ label: "Administrasi" }]} title={title ?? definition.title} description={definition.description}
      actions={canCreate && <Button aria-expanded={creating} aria-controls="create-panel" className={creating ? "button-secondary" : ""} onClick={() => toggleCreate(!creating)}><Icon name={creating ? "close" : "plus"} />{creating ? "Tutup formulir" : definition.action}</Button>} />
    {tabs}
    {canCreate && creating && <div id="create-panel" ref={panel}><Card className="admin-form-card">
      <PanelHeading title={definition.action} close={() => toggleCreate(false)} />
      <form key={formRevision} onSubmit={event => void submit(event)}><fieldset disabled={pending} className="admin-fields">
        {definition.fields.map(field => <div className="admin-field" key={field.key}><label htmlFor={field.key}>{field.label}</label>{field.source ? <Choice field={field} onExpired={onExpired} /> : field.type === "role" ? <select className="input" id={field.key} name={field.key} required defaultValue="student">{roleOptions}</select> : <input className="input" id={field.key} name={field.key} type={field.type ?? "text"} required maxLength={field.max} minLength={field.type === "password" ? 12 : undefined} autoComplete={field.type === "password" ? "new-password" : "off"} {...(field.type === "date" ? { min: "1900-01-01", max: "2200-12-31" } : {})} />}</div>)}
        <div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : definition.action}</Button></div>
      </fieldset></form>
      {saveError && <ErrorState message={saveError} />}
    </Card></div>}
    {recoverable && recovery && <div id="recovery-panel" ref={recoveryPanel}><Card className="admin-form-card">
      <PanelHeading title="Atur ulang kata sandi" close={() => setRecovery(null)}
        description={<>Akun <strong>{recovery.name ?? recovery.email}</strong> ({recovery.email}). Semua sesi aktif akun ini langsung diakhiri; sampaikan kata sandi baru secara pribadi.</>} />
      <form onSubmit={event => void submitRecovery(event)}><fieldset disabled={pending} className="admin-fields">
        <div className="admin-field"><label htmlFor="recovery-password">Kata sandi baru (12–128 karakter)</label><input className="input" id="recovery-password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></div>
        <div className="form-actions"><Button type="submit" disabled={pending}><Icon name="key" />{pending ? "Menyimpan…" : "Atur ulang kata sandi"}</Button><Button type="button" className="button-secondary" disabled={pending} onClick={() => setRecovery(null)}>Batal</Button></div>
      </fieldset></form>
      {saveError && <ErrorState message={saveError} />}
    </Card></div>}
    {recoverable && editingUser && <div id="edit-user-panel" ref={editPanel}><Card className="admin-form-card">
      <PanelHeading title="Edit akun" description="Mengganti role, email, atau status akun mengakhiri semua sesi aktif akun tersebut." close={() => setEditingUser(null)} />
      <form onSubmit={event => void submitUserEdit(event)}><fieldset disabled={pending} className="admin-fields">
        <div className="admin-field"><label htmlFor="edit-name">Nama</label><input className="input" id="edit-name" name="name" required maxLength={100} defaultValue={String(editingUser.name ?? "")} /></div>
        <div className="admin-field"><label htmlFor="edit-email">Email</label><input className="input" id="edit-email" name="email" type="email" required maxLength={254} defaultValue={String(editingUser.email ?? "")} /></div>
        <div className="admin-field"><label htmlFor="edit-identifier">NIS / nomor pegawai</label><input className="input" id="edit-identifier" name="identifier" required maxLength={50} defaultValue={String(editingUser.identifier ?? "").split(",")[0] ?? ""} /></div>
        <div className="admin-field"><label htmlFor="edit-role">Role</label><select className="input" id="edit-role" name="role" defaultValue={String(editingUser.roles ?? "student").split(",")[0]?.trim()}>{roleOptions}</select></div>
        <label className="admin-check field-wide"><input type="checkbox" name="isActive" defaultChecked={editingUser.isActive === true} />Akun aktif</label>
        <div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan akun"}</Button><Button type="button" className="button-secondary" disabled={pending} onClick={() => setEditingUser(null)}>Batal</Button></div>
      </fieldset></form>
      {saveError && <ErrorState message={saveError} />}
    </Card></div>}
    {success && <p className="success-state" role="status">{success}</p>}
    {!creating && !recovery && !editingUser && saveError && <ErrorState message={saveError} />}
    <Card>
      <div className="card-heading"><h2>Daftar {definition.title.toLowerCase()}</h2>
        <div className="card-tools">
          {isAudit && <select className="input filter-select" aria-label="Kategori event" value={category} onChange={event => { setCategory(event.target.value); setOffset(0); }}>
            <option value="">Semua kategori</option>
            {auditCategories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>}
          <form className="table-search" role="search" onSubmit={event => { event.preventDefault(); setSearch(q); setOffset(0); }}><input className="input" type="search" aria-label={`Cari ${definition.title.toLowerCase()}`} placeholder="Cari data…" maxLength={100} value={q} onChange={event => setQ(event.target.value)} /><Button className="button-secondary button-small" type="submit">Cari</Button></form>
        </div>
      </div>
      {error ? <ErrorState message={error} retry={() => setRevision(value => value + 1)} /> : !page ? <LoadingState /> : !page.items.length ? <EmptyState icon={definition.icon} title="Belum ada data" description={search || category ? "Tidak ada hasil yang sesuai. Coba pencarian lain." : "Data yang sudah tercatat akan muncul di sini."} action={canCreate && !search && !creating && <Button onClick={() => toggleCreate(true)}><Icon name="plus" />{definition.action}</Button>} />
        : <div className="table-scroll" tabIndex={0} role="region" aria-label={`Tabel ${definition.title}`}><table className="data-table"><thead><tr>{definition.columns.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}{(recoverable || archivable) && <th scope="col">Aksi</th>}</tr></thead>
          <tbody>{page.items.map(row => <tr key={row.id}>{definition.columns.map(([key]) => <td key={key}>{display(row, key)}</td>)}{(recoverable || archivable) && <td className="table-action"><div className="table-actions">
            {recoverable && <><Button className="button-secondary button-small" aria-expanded={editingUser?.id === row.id} aria-controls="edit-user-panel" onClick={() => openEdit(row)}><Icon name="edit" />Edit</Button><Button className="button-secondary button-small" aria-expanded={recovery?.id === row.id} aria-controls="recovery-panel" onClick={() => openRecovery(row)}><Icon name="key" />Atur ulang sandi</Button></>}
            {archivable && <Button className="button-secondary button-small" onClick={() => void toggleArchive(row)}><Icon name={row.archived ? "refresh" : "archive"} />{row.archived ? "Pulihkan" : "Arsipkan"}</Button>}
          </div></td>}</tr>)}</tbody></table></div>}
      <div className="table-pagination"><span>{page ? `${page.items.length ? offset + 1 : 0}–${offset + page.items.length} ditampilkan` : "Memuat…"}</span><div><Button className="button-secondary button-small" disabled={!page || offset === 0} onClick={() => setOffset(offset - 50)}>Sebelumnya</Button><Button className="button-secondary button-small" disabled={!page || page.nextOffset === null} onClick={() => setOffset(page!.nextOffset!)}>Berikutnya</Button></div></div>
    </Card>
  </>;
}

const userTabs: AdminTab[] = [
  { id: "accounts", label: "Akun", icon: "users", href: "/admin/users" },
  { id: "import", label: "Import santri", icon: "upload", href: "/admin/import" },
];
// Administrasi → Pengguna: the account list and the student CSV import.
export function UsersAdmin({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const [tab, setTab] = useState(() => location.pathname === "/admin/import" ? "import" : "accounts");
  const tabs = <AdminTabs label="Pengguna" tabs={userTabs} current={tab} choose={setTab} />;
  return tab === "import" ? <StudentImport tabs={tabs} onExpired={onExpired} /> : <Foundation resource="users" title="Pengguna" tabs={tabs} timezone={timezone} onExpired={onExpired} />;
}

const academicResources = ["years", "terms", "classes", "enrollments", "subjects", "courses", "teaching-assignments"] as const;
const academicTabs: AdminTab[] = academicResources.flatMap(key => {
  const tab: AdminTab = { id: key, label: definitions[key].title, icon: definitions[key].icon, href: `/admin/academic?tab=${key}` };
  return key === "enrollments" ? [tab, { id: "transfers", label: "Transfer kelas", icon: "transfer", href: "/admin/transfers" }] : [tab];
});
function initialAcademicTab() {
  if (location.pathname === "/admin/transfers") return "transfers";
  const tab = new URLSearchParams(location.search).get("tab");
  return academicResources.find(key => key === tab) ?? "years";
}
// Administrasi → Akademik: the academic reference data and class transfers.
export function AcademicFoundation({ timezone, onExpired }: { timezone: string; onExpired: () => void }) {
  const [tab, setTab] = useState<string>(initialAcademicTab);
  const tabs = <AdminTabs label="Administrasi akademik" tabs={academicTabs} current={tab} choose={setTab} />;
  return tab === "transfers" ? <ClassTransfer tabs={tabs} onExpired={onExpired} /> : <Foundation key={tab} resource={tab as FoundationResource} title="Akademik" tabs={tabs} timezone={timezone} onExpired={onExpired} />;
}

type ImportRow = { row: number; email: string; identifier: string; errors: string[]; action: string };
type ImportResult = { mode: "preview" | "commit"; rows: ImportRow[]; created?: number; enrolled?: number; skipped?: number };
const csvHeader = "nama,email,identifier,password";
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
  if (!lines.length || lines[0]!.map(header => header.toLowerCase()).join(",") !== csvHeader) throw new Error(`Header harus: ${csvHeader}`);
  return lines.slice(1).map(columns => ({ name: columns[0] ?? "", email: columns[1] ?? "", identifier: columns[2] ?? "", password: columns[3] ?? "" }));
}
function importOutcome(row: ImportRow) {
  return row.errors.length ? { label: "Perlu diperbaiki", tone: "badge-danger" } : row.action === "skip" ? { label: "Sudah terdaftar", tone: "badge-draft" }
    : row.action === "enroll" ? { label: "Tambahkan ke kelas", tone: "" } : { label: "Akun baru", tone: "badge-success" };
}
// The "Import santri" tab of Administrasi → Pengguna: preview first, then an atomic save of the
// previewed rows into the class that was chosen for the preview.
export function StudentImport({ tabs, onExpired }: { tabs?: ReactNode; onExpired: () => void }) {
  const [csv, setCsv] = useState(`${csvHeader}\n`);
  const [preview, setPreview] = useState<{ classId: string; rows: ImportRow[] } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const saving = useRef(false);
  async function send(mode: "preview" | "commit", classId: string) {
    if (saving.current) return;
    setError(""); setMessage("");
    let rows: ReturnType<typeof parseCsv>;
    try { rows = parseCsv(csv); } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV tidak dapat dibaca."); return; }
    saving.current = true; setPending(true);
    try {
      const result = await api<ImportResult>("/api/admin/imports/students", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, classId, rows }) });
      if (mode === "preview") setPreview({ classId, rows: result.rows });
      else { setMessage(`Import selesai: ${result.created ?? 0} akun dibuat, ${result.enrolled ?? 0} enrollment diproses, ${result.skipped ?? 0} baris sudah terdaftar.`); setPreview(null); setCsv(`${csvHeader}\n`); setFormKey(value => value + 1); }
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(cause instanceof Error ? cause.message : "Import tidak dapat diproses."); }
    finally { saving.current = false; setPending(false); }
  }
  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 256 * 1024) { setError("Ukuran berkas CSV maksimal 256 KB."); return; }
    void file.text().then(text => { setCsv(text); setPreview(null); setError(""); }, () => setError("Berkas CSV tidak dapat dibaca."));
  }
  const counts = (preview?.rows ?? []).reduce<Record<string, number>>((all, row) => { const { label } = importOutcome(row); all[label] = (all[label] ?? 0) + 1; return all; }, {});
  const hasErrors = preview?.rows.some(row => row.errors.length) ?? false;
  return <>
    <PageHeader breadcrumbs={[{ label: "Administrasi" }]} title="Pengguna" description="Validasi CSV terlebih dahulu, lalu simpan akun dan enrollment sekaligus." />
    {tabs}
    <Card className="admin-form-card">
      <PanelHeading title="Import santri dari CSV" description={<>Header wajib <code>{csvHeader}</code>. Maksimal 500 baris; kata sandi awal 12–128 karakter.</>} />
      <form key={formKey} onChange={event => { if ((event.target as HTMLElement).getAttribute("name") === "classId") setPreview(null); }} onSubmit={event => { event.preventDefault(); void send("preview", String(new FormData(event.currentTarget).get("classId") ?? "")); }}>
        <fieldset disabled={pending} className="admin-fields">
          <div className="admin-field"><label htmlFor="classId">Kelas tujuan</label><Choice field={classField} onExpired={onExpired} /></div>
          <div className="admin-field"><label htmlFor="student-csv-file">Berkas CSV (opsional)</label><input className="input" id="student-csv-file" type="file" accept=".csv,text/csv" onChange={readFile} /></div>
          <div className="admin-field field-wide"><label htmlFor="student-csv">Isi CSV</label><textarea className="input admin-code" id="student-csv" rows={10} value={csv} onChange={event => { setCsv(event.target.value); setPreview(null); }} spellCheck={false} /></div>
          <div className="form-actions"><Button type="submit" disabled={pending}><Icon name="check" />{pending && !preview ? "Memeriksa…" : "Periksa CSV"}</Button></div>
        </fieldset>
      </form>
      {error && <ErrorState message={error} />}
    </Card>
    {message && <p className="success-state" role="status">{message}</p>}
    {preview && <Card>
      <div className="card-heading"><h2>Hasil validasi</h2><span className="badge-group">{Object.entries(counts).map(([label, count]) => <span key={label} className={`badge ${importOutcome(preview.rows.find(row => importOutcome(row).label === label)!).tone}`}>{count} {label.toLowerCase()}</span>)}</span></div>
      {!preview.rows.length ? <EmptyState icon="upload" title="CSV belum berisi baris" description="Tambahkan minimal satu baris santri di bawah header." /> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Hasil validasi import"><table className="data-table"><thead><tr><th scope="col">Baris</th><th scope="col">Email</th><th scope="col">Identifier</th><th scope="col">Hasil</th></tr></thead>
        <tbody>{preview.rows.map(row => { const outcome = importOutcome(row); return <tr key={row.row}><td>{row.row}</td><td>{row.email || "—"}</td><td>{row.identifier || "—"}</td><td><span className={`badge ${outcome.tone}`}>{outcome.label}</span>{row.errors.length > 0 && <span className="table-sub">{row.errors.join(" ")}</span>}</td></tr>; })}</tbody></table></div>}
      <div className="admin-result-footer">{hasErrors || !preview.rows.length ? <p className="info-state">Perbaiki CSV, lalu periksa ulang sebelum menyimpan.</p>
        : <><Button disabled={pending} onClick={() => void send("commit", preview.classId)}>{pending ? "Menyimpan…" : `Simpan ${preview.rows.length} baris`}</Button><Button className="button-secondary" disabled={pending} onClick={() => setPreview(null)}>Batal</Button></>}</div>
    </Card>}
  </>;
}
