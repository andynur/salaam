import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { coverAccept, maxLessonContent, maxUploadBytes, type Lesson, type LessonDocument } from "../../shared/learning";
import { htmlToMarkdown } from "../../shared/html-markdown";
import { renderMarkdown } from "../../shared/markdown";
import { api, ApiError } from "../lib/api";
import { Button, ErrorState } from "./ui";
import { Icon } from "./icons";
import { errorMessage, learningApi as base } from "./learning";

/** Renders stored Markdown. The renderer escapes its input, so the HTML is safe. */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return <div className={`doc-prose ${className}`.trim()} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}

const clock = (value: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
// Editing commands the browser already implements. Markdown is produced by reading the
// surface back, so the editor never has to maintain its own selection model.
const commands: { label: string; hint: string; run: () => void }[] = [
  { label: "B", hint: "Tebal", run: () => document.execCommand("bold") },
  { label: "I", hint: "Miring", run: () => document.execCommand("italic") },
  { label: "S", hint: "Coret", run: () => document.execCommand("strikeThrough") },
  { label: "H2", hint: "Judul bagian", run: () => document.execCommand("formatBlock", false, "h2") },
  { label: "H3", hint: "Sub judul", run: () => document.execCommand("formatBlock", false, "h3") },
  { label: "¶", hint: "Paragraf", run: () => document.execCommand("formatBlock", false, "p") },
  { label: "•", hint: "Daftar poin", run: () => document.execCommand("insertUnorderedList") },
  { label: "1.", hint: "Daftar bernomor", run: () => document.execCommand("insertOrderedList") },
  { label: "❝", hint: "Kutipan", run: () => document.execCommand("formatBlock", false, "blockquote") },
  { label: "</>", hint: "Blok kode", run: () => document.execCommand("formatBlock", false, "pre") },
];

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
const saveDelay = 1200;

/**
 * A lesson document edited in place. Typing, pasting, and formatting happen on the page
 * itself; the Markdown body is read back from the surface and autosaved a moment after the
 * last keystroke. Every save carries the version it started from, so a document edited
 * elsewhere stops this editor instead of overwriting the other person's work.
 */
export function DocumentEditor({ courseId, lesson, onExpired, renamed }: { courseId: string; lesson: Lesson; onExpired: () => void; renamed: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  // The initial HTML is rendered once: React must never re-set the surface's children
  // while somebody is typing in it.
  const initial = useRef(renderMarkdown(lesson.content));
  const version = useRef(lesson.version);
  const storedContent = useRef(lesson.content);
  const storedTitle = useRef(lesson.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState(lesson.updatedAt);
  const [error, setError] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [title, setTitle] = useState(lesson.title);

  const save = useCallback(async (body: string, heading: string) => {
    if (saving.current) return;
    const content = body.trim();
    if (!content) { setError("Isi dokumen tidak boleh kosong."); setState("error"); return; }
    if (content.length > maxLessonContent) { setError(`Isi dokumen maksimal ${maxLessonContent} karakter.`); setState("error"); return; }
    if (content === storedContent.current && heading.trim() === storedTitle.current) { setState("saved"); return; }
    saving.current = true; setState("saving"); setError("");
    try {
      const result = await api<LessonDocument>(`${base}/${courseId}/lessons/${lesson.id}/document`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title: heading.trim() || storedTitle.current, version: version.current }),
      });
      const wasRenamed = heading.trim() !== storedTitle.current;
      version.current = result.version;
      storedContent.current = content;
      storedTitle.current = heading.trim() || storedTitle.current;
      setSavedAt(result.updatedAt);
      setState("saved");
      if (wasRenamed) renamed();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else if (cause instanceof ApiError && cause.status === 409) { setState("conflict"); setError(cause.message); }
      else { setState("error"); setError(errorMessage(cause)); }
    } finally { saving.current = false; }
  }, [courseId, lesson.id, onExpired, renamed]);

  const read = useCallback(() => source ?? htmlToMarkdown(surface.current?.innerHTML ?? ""), [source]);
  const queue = useCallback((heading = title) => {
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(read(), heading), saveDelay);
  }, [read, save, title]);
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    void save(read(), title);
  }, [read, save, title]);

  // A pending autosave must not be lost when the tab closes or the lesson changes.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (state === "dirty" || state === "saving") event.preventDefault(); };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [state]);

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (!html && !text) return;
    // Clipboard HTML becomes this document's own Markdown first, so a paste from Word, a
    // web page, or another editor arrives formatted but carries none of its markup.
    event.preventDefault();
    const markdown = html ? htmlToMarkdown(html) : text;
    document.execCommand("insertHTML", false, renderMarkdown(markdown) || "");
    queue();
  }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); flush(); }
  }
  function toggleSource() {
    if (source === null) { flush(); setSource(htmlToMarkdown(surface.current?.innerHTML ?? "")); }
    else { initial.current = renderMarkdown(source); setSource(null); }
  }

  const status = state === "saving" ? "Menyimpan…" : state === "dirty" ? "Perubahan belum tersimpan"
    : state === "conflict" ? "Penyimpanan dihentikan" : state === "error" ? "Gagal menyimpan"
    : `Tersimpan ${clock(savedAt)}`;
  return <div className="doc-editor">
    <div className="doc-bar">
      <label className="doc-title-field"><span className="visually-hidden">Judul dokumen</span>
        <input className="doc-title" value={title} maxLength={150} disabled={state === "conflict"}
          onChange={event => { setTitle(event.target.value); queue(event.target.value); }} onBlur={flush} />
      </label>
      <p className={`doc-status ${state === "conflict" || state === "error" ? "doc-status-error" : ""}`} role="status">{status}</p>
    </div>
    <div className="doc-toolbar" role="toolbar" aria-label="Format teks">
      {commands.map(command => <Button key={command.label} className="button-secondary button-small doc-tool" aria-label={command.hint} title={command.hint}
        disabled={state === "conflict" || source !== null} onMouseDown={event => event.preventDefault()}
        onClick={() => { command.run(); surface.current?.focus(); queue(); }}>{command.label}</Button>)}
      <Button className="button-secondary button-small doc-tool" aria-label="Sisipkan tautan" title="Tautan" disabled={state === "conflict" || source !== null}
        onMouseDown={event => event.preventDefault()} onClick={() => {
          const url = prompt("Alamat tautan (http atau https)");
          if (url && /^https?:\/\//i.test(url)) { document.execCommand("createLink", false, url); queue(); }
        }}><Icon name="link" /></Button>
      <Button className="button-secondary button-small doc-tool" aria-pressed={source !== null} disabled={state === "conflict"} onClick={toggleSource}>
        {source === null ? "Sumber Markdown" : "Tampilan dokumen"}
      </Button>
    </div>
    {source === null
      ? <div ref={surface} className="doc-prose doc-surface" contentEditable={state !== "conflict"} suppressContentEditableWarning
          role="textbox" aria-multiline="true" aria-label="Isi dokumen" spellCheck
          onInput={() => queue()} onBlur={flush} onPaste={paste} onKeyDown={keys}
          dangerouslySetInnerHTML={{ __html: initial.current }} />
      : <textarea className="input doc-source" value={source} maxLength={maxLessonContent} aria-label="Sumber Markdown"
          onChange={event => { setSource(event.target.value); queue(); }} onBlur={flush} />}
    <p className="doc-hint">Tempel dari dokumen lain untuk mempertahankan format. Markdown seperti <code>##</code>, <code>-</code>, dan <code>**tebal**</code> juga dikenali. Perubahan tersimpan otomatis.</p>
    {state === "conflict" && <ErrorState message={`${error} `} retry={() => location.reload()} />}
    {state === "error" && <ErrorState message={error} retry={flush} />}
  </div>;
}

/** The cover image at the top of a lesson document. */
export function LessonCover({ courseId, lesson, canManage, onExpired, changed }: { courseId: string; lesson: Lesson; canManage: boolean; onExpired: () => void; changed: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function send(body: FormData) {
    if (pending) return;
    setPending(true); setError("");
    try { await api(`${base}/${courseId}/lessons/${lesson.id}/cover`, { method: "POST", body }); changed(); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { setPending(false); if (picker.current) picker.current.value = ""; }
  }
  function chosen(file: File | undefined) {
    if (!file) return;
    if (file.size > maxUploadBytes) { setError("Ukuran sampul maksimal 10 MB."); return; }
    const body = new FormData();
    body.set("file", file);
    void send(body);
  }
  if (!lesson.cover && !canManage) return null;
  return <div className="doc-cover">
    {lesson.cover && <img className="doc-cover-image" alt={`Sampul ${lesson.title}`} src={`${base}/${courseId}/lessons/${lesson.id}/cover?v=${encodeURIComponent(lesson.updatedAt)}`} />}
    {canManage && <div className="doc-cover-actions">
      <input ref={picker} className="visually-hidden" type="file" accept={coverAccept} id={`cover-${lesson.id}`}
        onChange={event => chosen(event.target.files?.[0])} />
      <Button className="button-secondary button-small" disabled={pending} onClick={() => picker.current?.click()}>
        {pending ? "Mengunggah…" : lesson.cover ? "Ganti sampul" : "Tambah sampul"}
      </Button>
      {lesson.cover && <Button className="button-secondary button-small" disabled={pending} onClick={() => {
        const body = new FormData();
        body.set("remove", "1");
        void send(body);
      }}>Hapus sampul</Button>}
    </div>}
    {error && <ErrorState message={error} />}
  </div>;
}

/** Public sharing: one opaque link that renders the document as a standalone page. */
export function LessonShare({ courseId, lesson, onExpired, changed }: { courseId: string; lesson: Lesson; onExpired: () => void; changed: () => void }) {
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const url = lesson.shareSlug ? `${location.origin}/share/lessons/${lesson.shareSlug}` : "";
  async function toggle(shared: boolean) {
    if (pending) return;
    if (!shared && !confirm("Hentikan berbagi? Tautan publik yang sudah dibagikan berhenti bekerja.")) return;
    setPending(true); setError(""); setCopied(false);
    try {
      await api(`${base}/${courseId}/lessons/${lesson.id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shared }) });
      changed();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { setPending(false); }
  }
  return <div className="doc-share">
    <div className="doc-share-row">
      <Button className="button-secondary button-small" disabled={pending} aria-pressed={Boolean(lesson.shareSlug)} onClick={() => void toggle(!lesson.shareSlug)}>
        {pending ? "Menyimpan…" : lesson.shareSlug ? "Hentikan berbagi" : "Bagikan ke publik"}
      </Button>
      {lesson.shareSlug && <span className="badge badge-gold">Publik</span>}
    </div>
    {lesson.shareSlug && <div className="doc-share-link">
      <label className="visually-hidden" htmlFor={`share-${lesson.id}`}>Tautan publik</label>
      <input id={`share-${lesson.id}`} className="input" readOnly value={url} onFocus={event => event.target.select()} />
      <Button className="button-secondary button-small" onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false)); }}>Salin</Button>
      <a className="button button-secondary button-small" href={url} target="_blank" rel="noopener noreferrer">Buka</a>
    </div>}
    {copied && <p className="success-state" role="status">Tautan disalin.</p>}
    {lesson.shareSlug && <p className="learning-muted">Siapa pun yang memiliki tautan dapat membaca dokumen ini tanpa masuk. Materi pendukung, tugas, dan data santri tidak ikut dibagikan.</p>}
    {error && <ErrorState message={error} />}
  </div>;
}
