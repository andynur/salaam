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
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    setPreview(""); setRenderError("");
    if (data) void certificateImage(data).then(canvas => { if (active) setPreview(canvas.toDataURL("image/png")); }).catch(cause => { if (active) setRenderError(errorMessage(cause)); });
    return () => { active = false; };
  }, [data, renderRevision]);
  async function download() {
    if (busy.current) return;
    busy.current = true; setPending(true); setDownloadError("");
    try {
      const fresh = await api<Certification>(`${path}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await downloadCertificate(fresh);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      else { setDownloadError(errorMessage(cause)); retry(); }
    } finally { busy.current = false; setPending(false); }
  }
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!data) return <LoadingState />;
  return <>
    <div className="learning-progress"><div><strong>Progres sertifikasi · {data.percent}%</strong><progress aria-label="Progres sertifikasi" max={100} value={data.percent} /></div><span>{data.completed} / {data.lessons} materi selesai</span><span>{data.submitted} / {data.activities} aktivitas selesai</span></div>
    <Card className="certification-card"><div className="card-heading"><h2>Sertifikat penyelesaian</h2><span className={`badge ${data.eligible ? "badge-success" : ""}`}>{data.eligible ? "Terbuka" : "Terkunci"}</span></div>
      <div className="certification-body"><p className="learning-muted">{data.eligible ? "Seluruh pembelajaran selesai. Sertifikat siap diunduh dalam PDF." : "Pratinjau dan unduhan terbuka setelah progres mencapai 100% pada course aktif. Tugas atau proyek yang perlu revisi belum dihitung selesai."}</p>
        {renderError ? <ErrorState message={renderError} retry={() => setRenderRevision(value => value + 1)} /> : !preview ? <LoadingState /> : <img className={`certification-preview${data.eligible ? "" : " is-locked"}`} src={preview} alt={data.eligible ? `Sertifikat ${data.studentName} untuk ${data.courseName}, guru ${data.teachers.join(", ")}` : "Pratinjau sertifikat terkunci sampai pembelajaran selesai"} />}
        {downloadError && <ErrorState message={downloadError} />}
        <Button disabled={!data.eligible || pending || !preview} onClick={() => void download()}>{pending ? "Membuat PDF…" : "Unduh sertifikat PDF"}</Button>
      </div>
    </Card>
  </>;
}
