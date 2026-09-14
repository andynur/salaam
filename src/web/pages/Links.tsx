import { useRef, useState } from "react";
import type { LinkCollection, LinkCollectionsData, LinkItem } from "../../shared/links";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "../components/ui";
import { Field, MutationForm, Search, useData } from "../components/learning";
import { Icon, type IconName } from "../components/icons";
import { Markdown } from "../components/editor";
import { htmlToMarkdown } from "../../shared/html-markdown";
import { renderMarkdown } from "../../shared/markdown";
const apiPath = "/api/links";
// A small, recognisable glyph per source so the grid reads at a glance, like Notion's link
// previews — matched by hostname, not by guessing page content.
const DOMAIN_GLYPHS: { match: (host: string) => boolean; icon: IconName; tone: "blue" | "gold" | "discovery" | "success" }[] = [
  { match: host => host.includes("youtube.com"), icon: "play", tone: "gold" },
  { match: host => host.includes("instagram.com"), icon: "camera", tone: "discovery" },
  { match: host => host.includes("facebook.com"), icon: "users", tone: "blue" },
  { match: host => host.includes("docs.google.com") || host.includes("sheets.google.com"), icon: "board", tone: "success" },
  { match: host => host.includes("notebook.google.com"), icon: "book", tone: "discovery" },
  { match: host => host.includes("hsiboardingschool") || host.includes("hsibs."), icon: "globe", tone: "blue" },
];
function linkGlyph(url: string) {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw text if the URL cannot be parsed */ }
  const match = DOMAIN_GLYPHS.find(entry => entry.match(host));
  return { host, icon: match?.icon ?? "link", tone: match?.tone ?? "blue" } as const;
}
function RichTextField({ value = "" }: { value?: string | undefined }) {
  const hidden = useRef<HTMLTextAreaElement>(null); const surface = useRef<HTMLDivElement>(null);
  const sync = () => { if (hidden.current) hidden.current.value = htmlToMarkdown(surface.current?.innerHTML ?? ""); };
  const command = (name: string, arg?: string) => { document.execCommand(name, false, arg); surface.current?.focus(); sync(); };
  return <label className="learning-field field-wide"><span>Deskripsi <small>(opsional)</small></span><div className="link-editor"><div className="link-editor-toolbar" role="toolbar" aria-label="Format deskripsi"><button type="button" className="button button-secondary button-small" onMouseDown={event => event.preventDefault()} onClick={() => command("bold")}><strong>B</strong></button><button type="button" className="button button-secondary button-small" onMouseDown={event => event.preventDefault()} onClick={() => command("italic")}><em>I</em></button><button type="button" className="button button-secondary button-small" onMouseDown={event => event.preventDefault()} onClick={() => command("insertUnorderedList")}>Daftar</button><button type="button" className="button button-secondary button-small" onMouseDown={event => event.preventDefault()} onClick={() => { const url = prompt("Alamat tautan (http atau https)"); if (url && /^https?:\/\//i.test(url)) command("createLink", url); }}>Tautan</button></div><div ref={surface} className="link-editor-surface" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} /><textarea ref={hidden} className="visually-hidden" name="description" defaultValue={value} aria-hidden="true" tabIndex={-1} /></div><small className="field-hint">Deskripsi singkat untuk membantu memahami isi tautan.</small></label>;
}
function ItemForm({ collectionId, item, onExpired, saved, cancel }: { collectionId: string; item?: LinkItem; onExpired: () => void; saved: () => void; cancel: () => void }) {
  return <div className="link-item-form"><MutationForm path={item ? `${apiPath}/items/${item.id}` : `${apiPath}/items`} method={item ? "PATCH" : "POST"} label={item ? "Simpan perubahan" : "Tambah tautan"} onExpired={onExpired} saved={saved} cancel={cancel} body={form => ({ collectionId, title: form.get("title"), url: form.get("url"), description: form.get("description"), ...(item ? { version: item.version } : {}) })}><Field name="title" label="Nama tautan" max={150} value={item?.title} /><Field name="url" label="Alamat URL" max={2000} value={item?.url} /><RichTextField value={item?.description} /></MutationForm></div>;
}
function LinkTile({ item, canManage, onExpired, onEdit, changed }: { item: LinkItem; canManage: boolean; onExpired: () => void; onEdit: () => void; changed: () => void }) {
  const glyph = linkGlyph(item.url);
  // The whole card opens the link — only the manage actions and any in-description links opt
  // out by stopping propagation, so they keep their own click behaviour.
  const open = () => window.open(item.url, "_blank", "noopener,noreferrer");
  return <article className="link-tile" role="link" tabIndex={0} aria-label={`Buka ${item.title}`} onClick={open} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }}>
    <div className="link-tile-head">
      <span className={`link-tile-icon${glyph.tone !== "blue" ? ` link-tile-icon-${glyph.tone}` : ""}`} aria-hidden="true"><Icon name={glyph.icon} size={15} /></span>
      <h3>{item.title}</h3>
      {canManage && <div className="link-tile-actions" onClick={event => event.stopPropagation()}>
        <button type="button" className="icon-button" aria-label={`Ubah ${item.title}`} onClick={onEdit}><Icon name="edit" size={14} /></button>
        <MutationForm path={`${apiPath}/items/${item.id}/archive`} label="Arsipkan" onExpired={onExpired} saved={changed} body={() => ({})} />
      </div>}
    </div>
    <a className="link-tile-url" href={item.url} target="_blank" rel="noopener noreferrer" title={item.url} onClick={event => event.stopPropagation()}><span>{glyph.host}</span><Icon name="arrowRight" size={12} /></a>
    {item.description && <div onClick={event => event.stopPropagation()}><Markdown source={item.description} className="link-tile-description" /></div>}
  </article>;
}
function CollectionCard({ collection, onExpired, changed }: { collection: LinkCollection; onExpired: () => void; changed: () => void }) {
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<string | null>(null); const [expanded, setExpanded] = useState(true);
  const personal = collection.ownerId !== null;
  const toggle = () => setExpanded(value => !value);
  return <Card className="link-collection-card">
    <div className={`link-collection-heading${expanded ? " is-expanded" : ""}`} role="button" tabIndex={0} aria-expanded={expanded}
      onClick={toggle} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
      <div className="link-collection-title">
        <span className={`link-collection-icon${personal ? " link-collection-icon-personal" : ""}`} aria-hidden="true"><Icon name={personal ? "user" : "layers"} /></span>
        <div><h2>{collection.title} <span className="badge link-collection-tag">{personal ? "Pribadi" : "Sekolah"}</span></h2>{collection.description && <p>{collection.description}</p>}</div>
      </div>
      <div className="link-collection-meta">
        <span className="badge">{collection.items.length} tautan</span>
        {collection.canManage && <Button className="button-secondary button-small" aria-expanded={adding} onClick={event => { event.stopPropagation(); setExpanded(true); setAdding(!adding); }}><Icon name="plus" />Tambah tautan</Button>}
        <Icon name={expanded ? "chevronUp" : "chevronDown"} className="link-collection-chevron" />
      </div>
    </div>
    {expanded && (adding || collection.items.length > 0
      ? <div className="link-tile-grid">
          {adding && <ItemForm collectionId={collection.id} onExpired={onExpired} saved={() => { setAdding(false); changed(); }} cancel={() => setAdding(false)} />}
          {collection.items.map(item => editing === item.id
            ? <ItemForm key={item.id} collectionId={collection.id} item={item} onExpired={onExpired} saved={() => { setEditing(null); changed(); }} cancel={() => setEditing(null)} />
            : <LinkTile key={item.id} item={item} canManage={collection.canManage} onExpired={onExpired} onEdit={() => setEditing(item.id)} changed={changed} />)}
        </div>
      : <EmptyState icon="link" title="Belum ada tautan" description={collection.canManage ? "Simpan alamat penting agar mudah ditemukan kembali." : "Koleksi ini belum memiliki tautan."} />)}
  </Card>;
}
export function Links({ onExpired }: { onExpired: () => void }) {
  const [revision, setRevision] = useState(0); const [addingCollection, setAddingCollection] = useState(false); const [query, setQuery] = useState("");
  const { data, error, retry } = useData<LinkCollectionsData>(apiPath, onExpired, revision); const changed = () => setRevision(value => value + 1);
  // Personal collections surface first — they're what an individual teacher opens most.
  const collections = data?.collections
    .filter(collection => !query.trim() || collection.title.toLowerCase().includes(query.toLowerCase()) || collection.items.some(item => `${item.title} ${item.url}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => Number(b.ownerId !== null) - Number(a.ownerId !== null));
  return <><PageHeader title="Tautan" description="Simpan akses penting sekolah dan koleksi pribadi Anda dalam satu ruang." actions={data && <Button aria-expanded={addingCollection} onClick={() => setAddingCollection(!addingCollection)}><Icon name="plus" />Buat koleksi</Button>} />{addingCollection && <Card className="admin-form-card"><h2>Koleksi baru</h2><MutationForm path={`${apiPath}/collections`} label="Buat koleksi" onExpired={onExpired} saved={() => { setAddingCollection(false); changed(); }} body={form => ({ title: form.get("title"), description: form.get("description"), scope: form.get("scope") })}><Field name="title" label="Nama koleksi" max={120} /><label className="learning-field"><span>Lingkup</span><select className="input" name="scope" defaultValue={data?.canManageSchool ? "school" : "personal"}>{data?.canManageSchool && <option value="school">Sekolah — terlihat semua pengguna</option>}<option value="personal">Pribadi — hanya saya</option></select></label><Field name="description" label="Keterangan" area required={false} max={1000} /></MutationForm></Card>}<Card className="link-filter"><Search change={setQuery} /></Card>{error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !collections?.length ? <Card><EmptyState icon="link" title="Belum ada koleksi" description="Buat koleksi untuk mulai menyimpan tautan penting." action={<Button onClick={() => setAddingCollection(true)}>Buat koleksi</Button>} /></Card> : <div className="link-collections">{collections.map(collection => <CollectionCard key={collection.id} collection={collection} onExpired={onExpired} changed={changed} />)}</div>}</>;
}
