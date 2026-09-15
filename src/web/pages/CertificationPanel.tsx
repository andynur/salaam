import { useEffect, useRef, useState } from "react";
import type { Certification, CertificationProgress } from "../../shared/certification";
import type { Page } from "../../shared/learning";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { Pager, Search, errorMessage, learningApi, useData } from "../components/learning";
import { api, ApiError } from "../lib/api";
import { certificateImage, downloadCertificate } from "../lib/certification";

export function CertificationPanel({ courseId, staff, onExpired }: { courseId: string; staff: boolean; onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const { data, error, retry } = useData<Page<CertificationProgress>>(`${learningApi}/${courseId}/certifications?${new URLSearchParams({ q, offset: String(offset) })}`, onExpired);
  const studentId = data?.items.find(row => row.studentId === selected)?.studentId ?? data?.items[0]?.studentId;
  return <div className="lesson-workspace">
    {staff && <Card><div className="card-heading"><h2>Sertifikasi santri</h2><Search change={value => { setQ(value); setOffset(0); }} /></div>
      {data && data.items.length > 0 && <div className="card-body"><label className="learning-field"><span>Santri</span><select className="input" value={studentId} onChange={event => setSelected(event.target.value)}>{data.items.map(row => <option key={row.studentId} value={row.studentId}>{row.studentName} — {row.percent}%</option>)}</select></label></div>}
      {data && <Pager offset={offset} next={data.nextOffset} change={setOffset} />}
    </Card>}
    {error ? <ErrorState message={error} retry={retry} /> : !data ? <LoadingState /> : !studentId ? <EmptyState title="Belum ada santri" description="Sertifikasi tersedia untuk santri yang terdaftar di kelas course ini." /> : <CertificateDetail key={studentId} courseId={courseId} studentId={studentId} onExpired={onExpired} />}
  </div>;
}
function CertificateDetail({ courseId, studentId, onExpired }: { courseId: string; studentId: string; onExpired: () => void }) {
  const path = `${learningApi}/${courseId}/certifications/${studentId}`;
  const { data, error, retry } = useData<Certification>(path, onExpired);
  const [preview, setPreview] = useState("");
  const [renderError, setRenderError] = useState("");
  const [renderRevision, setRenderRevision] = useState(0);
  const [downloadError, setDownloadError] = useState("");
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<Certification | null>(null);
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const display = issued ?? data;
  useEffect(() => {
    let active = true;
    setPreview(""); setRenderError("");
    if (display) void certificateImage(display).then(canvas => { if (active) setPreview(canvas.toDataURL("image/png")); }).catch(cause => { if (active) setRenderError(errorMessage(cause)); });
    return () => { active = false; };
  }, [display, renderRevision]);
  async function download() {
    if (busy.current) return;
    busy.current = true; setPending(true); setDownloadError("");
    try {
      const fresh = await api<Certification>(`${path}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setIssued(fresh);
      await downloadCertificate(fresh);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else { setDownloadError(errorMessage(cause)); retry(); }
    } finally { busy.current = false; setPending(false); }
  }
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!display) return <LoadingState />;
  const publicUrl = display.verificationPath ? new URL(display.verificationPath, location.origin).href : "";
  return <>
    <div className="learning-progress"><div><strong>Progres sertifikasi · {display.percent}%</strong><progress aria-label="Progres sertifikasi" max={100} value={display.percent} /></div><span>{display.completed} / {display.lessons} materi selesai</span><span>{display.submitted} / {display.activities} aktivitas selesai</span></div>
    <Card className="certification-card"><div className="card-heading"><h2>Sertifikat penyelesaian</h2><span className={`badge ${display.eligible ? "badge-success" : ""}`}>{display.eligible ? "Terbuka" : "Terkunci"}</span></div>
      <div className="certification-body"><p className="learning-muted">{display.eligible ? publicUrl ? "Sertifikat telah diterbitkan. QR dan tautan publik dapat digunakan untuk verifikasi." : "Seluruh pembelajaran selesai. Terbitkan sertifikat untuk membuat QR dan tautan verifikasi publik." : "Data sertifikat ditampilkan lengkap sebagai gambaran. Pratinjau tetap abu-abu dan unduhan terkunci sampai progres mencapai 100% pada course aktif. Tugas atau proyek yang perlu revisi belum dihitung selesai."}</p>
        {renderError ? <ErrorState message={renderError} retry={() => setRenderRevision(value => value + 1)} /> : !preview ? <LoadingState /> : <img className={`certification-preview${display.eligible ? "" : " is-locked"}`} src={preview} alt={`Sertifikat ${display.studentName} untuk ${display.courseName}, guru ${display.teachers.join(", ") || "belum ditetapkan"}${display.eligible ? "" : ", pratinjau abu-abu dan unduhan terkunci"}`} />}
        {publicUrl && <div className="doc-share-link"><label className="visually-hidden" htmlFor={`certificate-${studentId}`}>Tautan verifikasi publik</label><input id={`certificate-${studentId}`} className="input" readOnly value={publicUrl} onFocus={event => event.target.select()} /><a className="button button-secondary button-small" href={publicUrl} target="_blank" rel="noopener noreferrer">Buka</a><Button className="button-secondary button-small" onClick={() => { void navigator.clipboard?.writeText(publicUrl).then(() => setCopied(true)).catch(() => setCopied(false)); }}>Salin</Button>{copied && <span className="success-state" role="status">Tautan disalin.</span>}</div>}
        {downloadError && <ErrorState message={downloadError} />}
        <Button disabled={!display.eligible || pending || !preview} onClick={() => void download()}>{pending ? "Membuat PDF…" : publicUrl ? "Unduh sertifikat PDF" : "Terbitkan & unduh PDF"}</Button>
      </div>
    </Card>
  </>;
}
