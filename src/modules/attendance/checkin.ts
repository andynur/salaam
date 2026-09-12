import { enqueueCheckin } from "../calendar/notifications";
import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { checkinCodeInput, checkinWindowInput } from "./input";
import { sessionRow } from "./service";
import { checkinAlphabet, checkinCodeLength, type CheckinCode, type CheckinState, type CheckinWindow } from "../../shared/attendance";
// A window may issue many codes; the cap bounds an abandoned display that keeps rotating.
const codeLimit = 2000;
// Grace kept on the previous code so a scan started just before a rotation still lands.
const graceSeconds = 10;
function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(checkinCodeLength));
  return Array.from(bytes, byte => checkinAlphabet[byte & 31]).join("");
}
function hashCode(code: string) { return new Bun.CryptoHasher("sha256").update(code).digest("hex"); }
export async function checkinState(tx: SQL, actor: Actor, sessionId: string, canManage: boolean): Promise<CheckinState> {
  const [window] = await tx<CheckinWindow[]>`SELECT w.status, w.rotate_seconds AS "rotateSeconds", w.late_after::text AS "lateAfter",
    (SELECT count(*)::int FROM attendance_checkins c WHERE c.session_id = w.session_id) AS "checkedIn"
    FROM attendance_checkin_windows w WHERE w.session_id = ${sessionId}`;
  const [me] = await tx<{ status: "present" | "late"; createdAt: string }[]>`SELECT status, created_at::text AS "createdAt"
    FROM attendance_checkins WHERE session_id = ${sessionId} AND student_id = ${actor.id}`;
  // Santri see whether check-in is open and their own result, never the class tally.
  return { window: window ? (canManage ? window : { ...window, checkedIn: 0 }) : null, me: me ?? null };
}
async function openWindow(tx: SQL, courseId: string, sessionId: string) {
  const session = await sessionRow(tx, courseId, sessionId, "share");
  if (session.status !== "open") throw new HttpError(409, "SESSION_NOT_OPEN", "Buka sesi kelas sebelum menggunakan absensi QR.");
  const [window] = await tx<{ rotateSeconds: number; lateAfter: string | null }[]>`SELECT rotate_seconds AS "rotateSeconds", late_after::text AS "lateAfter"
    FROM attendance_checkin_windows WHERE session_id = ${sessionId} AND status = 'open'`;
  if (!window) throw new HttpError(409, "CHECKIN_CLOSED", "Absensi QR sedang tidak dibuka.");
  return window;
}
export async function changeCheckinWindow(db: SQL, actor: Actor, courseId: string, sessionId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const input = checkinWindowInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const session = await sessionRow(tx, courseId, sessionId, true);
    const operation = JSON.stringify(input);
    const [existing] = await tx<{ status: string; same: boolean }[]>`SELECT status, last_operation = ${operation}::text::jsonb AS same
      FROM attendance_checkin_windows WHERE session_id = ${sessionId} FOR UPDATE`;
    if (existing?.same) return { sessionId, status: existing.status };
    if (input.action === "start" && session.status !== "open") throw new HttpError(409, "SESSION_NOT_OPEN", "Buka sesi kelas sebelum menggunakan absensi QR.");
    if (input.action === "stop" && !existing) notFound();
    const status = input.action === "start" ? "open" : "stopped";
    if (existing) await tx`UPDATE attendance_checkin_windows SET status = ${status}, rotate_seconds = ${input.rotateSeconds}, late_after = ${input.lateAfter},
      last_operation = ${operation}::text::jsonb, updated_at = clock_timestamp() WHERE session_id = ${sessionId}`;
    else await tx`INSERT INTO attendance_checkin_windows (session_id, status, rotate_seconds, late_after, opened_by, last_operation)
      VALUES (${sessionId}, ${status}, ${input.rotateSeconds}, ${input.lateAfter}, ${actor.id}, ${operation}::text::jsonb)`;
    if (input.action === "start") await enqueueCheckin(tx, sessionId);
    // Stopping retires every live code so a photographed display cannot be used afterwards.
    if (input.action === "stop") await tx`UPDATE attendance_checkin_codes SET expires_at = clock_timestamp() WHERE session_id = ${sessionId} AND expires_at > clock_timestamp()`;
    await recordAudit(tx, actor.id, `classroom.checkin.${input.action === "start" ? "started" : "stopped"}`, "attendance_checkin_windows", sessionId, requestId);
    return { sessionId, status };
  });
}
export async function issueCheckinCode(db: SQL, actor: Actor, courseId: string, sessionId: string): Promise<CheckinCode> {
  requirePermission(actor, "learning.manage");
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", "share");
    const window = await openWindow(tx, courseId, sessionId);
    const [issued] = await tx<{ count: number }[]>`SELECT count(*)::int AS count FROM attendance_checkin_codes WHERE session_id = ${sessionId}`;
    if (issued!.count >= codeLimit) throw new HttpError(409, "CODE_LIMIT", "Batas kode absensi tercapai. Hentikan dan mulai absensi QR lagi.");
    await tx`UPDATE attendance_checkin_codes SET expires_at = least(expires_at, clock_timestamp() + make_interval(secs => ${graceSeconds}))
      WHERE session_id = ${sessionId} AND expires_at > clock_timestamp()`;
    const code = generateCode();
    const [row] = await tx<{ expiresAt: string }[]>`INSERT INTO attendance_checkin_codes (session_id, code_hash, issued_by, expires_at)
      VALUES (${sessionId}, ${hashCode(code)}, ${actor.id}, clock_timestamp() + make_interval(secs => ${window.rotateSeconds + graceSeconds}))
      RETURNING expires_at::text AS "expiresAt"`;
    // The plaintext is returned once, here. Only its digest is stored.
    return { code, expiresAt: row!.expiresAt, rotateSeconds: window.rotateSeconds };
  });
}
export async function submitCheckin(db: SQL, actor: Actor, courseId: string, sessionId: string, body: Record<string, unknown>, requestId: string) {
  const code = checkinCodeInput(body);
  return db.begin(async tx => {
    // A shared course and session lock lets a whole class check in without serializing,
    // while closing or cancelling the session still waits for in-flight check-ins.
    await courseAccess(tx, actor, courseId, "participate", "share");
    if (!(await tx`SELECT 1 FROM classroom_roster WHERE session_id = ${sessionId} AND student_id = ${actor.id}`).length) {
      await sessionRow(tx, courseId, sessionId);
      notFound();
    }
    const [done] = await tx<{ status: "present" | "late"; createdAt: string }[]>`SELECT status, created_at::text AS "createdAt"
      FROM attendance_checkins WHERE session_id = ${sessionId} AND student_id = ${actor.id}`;
    if (done) return done;
    const window = await openWindow(tx, courseId, sessionId);
    const [valid] = await tx<{ id: string }[]>`SELECT id FROM attendance_checkin_codes
      WHERE session_id = ${sessionId} AND code_hash = ${hashCode(code)} AND expires_at > clock_timestamp()`;
    if (!valid) throw new HttpError(409, "INVALID_CODE", "Kode absensi sudah berganti atau salah. Pindai kode terbaru di kelas.");
    if ((await tx`SELECT 1 FROM attendance_records WHERE session_id = ${sessionId} AND student_id = ${actor.id} LIMIT 1`).length) {
      throw new HttpError(409, "ATTENDANCE_RECORDED", "Kehadiran Anda sudah dicatat guru.");
    }
    // The database clock decides present versus late, and the chain starts here.
    const [record] = await tx<{ id: string; status: "present" | "late" }[]>`INSERT INTO attendance_records (session_id, student_id, status, recorded_by, previous_id)
      VALUES (${sessionId}, ${actor.id}, CASE WHEN ${window.lateAfter}::timestamptz IS NOT NULL AND clock_timestamp() > ${window.lateAfter}::timestamptz THEN 'late' ELSE 'present' END, ${actor.id}, NULL)
      RETURNING id, status`;
    // The check-in row carries the timestamp reported to the santri, so a retry answers
    // with exactly the same values as the first request.
    const [entry] = await tx<{ createdAt: string }[]>`INSERT INTO attendance_checkins (session_id, student_id, code_id, record_id, status)
      VALUES (${sessionId}, ${actor.id}, ${valid.id}, ${record!.id}, ${record!.status}) RETURNING created_at::text AS "createdAt"`;
    await recordAudit(tx, actor.id, "classroom.attendance.checked_in", "attendance_records", record!.id, requestId);
    return { status: record!.status, createdAt: entry!.createdAt };
  });
}
