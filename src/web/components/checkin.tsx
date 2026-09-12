import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckinCode, CheckinState, Meeting } from "../../shared/attendance";
import { attendanceLabels } from "../../shared/attendance";
import { api, ApiError } from "../lib/api";
import { encodeQr, qrPath } from "../lib/qr";
import { Button, Card, ErrorState } from "./ui";
import { errorMessage, Field, formatDateTime, fromLocalInput, MutationForm, toLocalInput } from "./learning";
const scanIntervalMs = 400;
// The scanned value is a presence code, never a credential: the browser still sends the
// santri's own session cookie, and the server re-checks roster, session and window.
function QrCode({ value }: { value: string }) {
  return <svg className="checkin-qr" viewBox="0 0 25 25" role="img" aria-label={`Kode absensi ${[...value].join(" ")}`} shapeRendering="crispEdges">
    <rect width="25" height="25" className="checkin-qr-paper" /><path d={qrPath(encodeQr(value))} className="checkin-qr-ink" />
  </svg>;
}
function CodeDisplay({ path, onExpired }: { path: string; onExpired: () => void }) {
  const [code, setCode] = useState<CheckinCode | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function rotate() {
      try {
        const next = await api<CheckinCode>(`${path}/checkin/codes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (stopped) return;
        setCode(next); setError("");
        timer = setTimeout(() => void rotate(), next.rotateSeconds * 1000);
      } catch (cause) {
        if (stopped) return;
        if (cause instanceof ApiError && cause.status === 401) { onExpired(); return; }
        setError(errorMessage(cause));
        timer = setTimeout(() => void rotate(), 5000);
      }
    }
    void rotate();
    return () => { stopped = true; clearTimeout(timer); };
  }, [path, onExpired]);
  if (error) return <ErrorState message={error} />;
  if (!code) return <p className="card-hint">Menyiapkan kode…</p>;
  return <div className="checkin-display"><QrCode value={code.code} /><div><p className="checkin-code">{code.code}</p>
    <p className="card-hint">Kode berganti tiap {code.rotateSeconds} detik. Santri memindai QR atau mengetik kode ini.</p></div></div>;
}
export function CheckinManager({ path, session, checkin, timezone, onExpired, saved }: { path: string; session: Meeting; checkin: CheckinState; timezone: string; onExpired: () => void; saved: () => void }) {
  const open = checkin.window?.status === "open";
  const rotateSeconds = checkin.window?.rotateSeconds ?? 30;
  return <Card className="lesson-card"><div className="card-heading"><h2>Absensi QR</h2><span className="badge">{open ? `${checkin.window?.checkedIn ?? 0} santri memindai` : "Nonaktif"}</span></div>
    {session.status !== "open" ? <p className="card-hint">Buka sesi kelas untuk menggunakan absensi QR.</p> : open ? <>
      <CodeDisplay path={path} onExpired={onExpired} />
      {checkin.window?.lateAfter && <p className="card-hint">Pemindaian setelah {formatDateTime(checkin.window.lateAfter, timezone)} tercatat terlambat.</p>}
      <MutationForm path={`${path}/checkin`} method="PATCH" label="Hentikan absensi QR" onExpired={onExpired} saved={saved} body={() => ({ action: "stop", rotateSeconds })} />
    </> : <>
      <p className="card-hint">Kode tampil di layar kelas dan berganti otomatis. Kode yang sudah lewat tidak dapat dipakai lagi.</p>
      <MutationForm path={`${path}/checkin`} method="PATCH" label="Mulai absensi QR" onExpired={onExpired} saved={saved}
        body={form => ({ action: "start", rotateSeconds: Number(form.get("rotateSeconds")), lateAfter: fromLocalInput(form.get("lateAfter")) })}>
        <Field label="Rotasi kode (detik)" name="rotateSeconds" type="number" value={rotateSeconds} min={15} max={300} step="5" />
        <Field label="Batas terlambat (opsional)" name="lateAfter" type="datetime-local" value={toLocalInput(checkin.window?.lateAfter)} required={false} />
      </MutationForm>
    </>}
  </Card>;
}
function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const detector = "BarcodeDetector" in window ? new (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ["qr_code"] }) : null;
    if (!detector) { setError("Peramban ini tidak mendukung pemindai kamera. Masukkan kode secara manual."); return; }
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const look = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector!.detect(video.current);
            const value = found[0]?.rawValue?.trim().toUpperCase();
            if (value) { onCode(value); return; }
          } catch { /* a dropped frame is not an error; keep looking */ }
          timer = setTimeout(() => void look(), scanIntervalMs);
        };
        void look();
      } catch { if (!stopped) setError("Kamera tidak dapat diakses. Izinkan kamera atau masukkan kode manual."); }
    }
    void start();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track => track.stop()); };
  }, [onCode]);
  return <div className="checkin-scanner">{error ? <ErrorState message={error} /> : <video ref={video} className="checkin-video" muted playsInline aria-label="Pratinjau kamera pemindai" />}
    <Button className="button-secondary button-small" onClick={onClose}>Tutup pemindai</Button></div>;
}
export function CheckinStudent({ path, session, checkin, timezone, onExpired, saved }: { path: string; session: Meeting; checkin: CheckinState; timezone: string; onExpired: () => void; saved: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const submit = useCallback(async (code: string) => {
    if (sending.current) return;
    sending.current = true; setPending(true); setError("");
    try {
      await api(`${path}/checkin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      setScanning(false);
      saved();
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onExpired(); else setError(errorMessage(cause)); }
    finally { sending.current = false; setPending(false); }
  }, [path, onExpired, saved]);
  if (checkin.me) return <Card className="lesson-card"><div className="card-heading"><h2>Absensi QR</h2><span className="badge badge-success">{attendanceLabels[checkin.me.status]}</span></div>
    <p className="card-hint">Kehadiran Anda tercatat pada {formatDateTime(checkin.me.createdAt, timezone)}. Perbaikan hanya dapat dilakukan guru.</p></Card>;
  if (session.status !== "open" || checkin.window?.status !== "open") return null;
  return <Card className="lesson-card"><div className="card-heading"><h2>Absensi QR</h2></div>
    <p className="card-hint">Pindai kode di layar kelas, atau ketik kodenya. Kode berganti tiap {checkin.window.rotateSeconds} detik.</p>
    <div className="filter-bar"><Button aria-expanded={scanning} aria-controls="checkin-scanner" disabled={pending} onClick={() => { setScanning(!scanning); setError(""); }}>{scanning ? "Batal memindai" : "Pindai kode QR"}</Button></div>
    {scanning && <div id="checkin-scanner"><Scanner onCode={code => void submit(code)} onClose={() => setScanning(false)} /></div>}
    <form className="learning-form" onSubmit={event => { event.preventDefault(); void submit(String(new FormData(event.currentTarget).get("code") ?? "").trim().toUpperCase()); }}>
      <fieldset className="admin-fields" disabled={pending}><Field label="Kode absensi" name="code" max={10} /><div className="form-actions"><Button type="submit" disabled={pending}>{pending ? "Mengirim…" : "Kirim kode"}</Button></div></fieldset>
    </form>
    {error && <ErrorState message={error} />}
  </Card>;
}
