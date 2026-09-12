import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, notFound } from "../learning/access";
import { assessmentAccommodationInput } from "../learning/input";

export async function grantAssessmentAccommodation(db: SQL, actor: Actor, courseId: string, activityId: string, studentId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const { extraMinutes, reason } = assessmentAccommodationInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    const assessment = (await tx<{ id: string; timeLimitMinutes: number | null; closesAt: Date | null }[]>`SELECT a.id, s.time_limit_minutes AS "timeLimitMinutes", s.closes_at AS "closesAt"
      FROM activities a JOIN assessment_settings s ON s.activity_id = a.id
      WHERE a.id = ${activityId} AND a.course_id = ${courseId} AND a.kind IN ('quiz', 'exam') FOR UPDATE OF a`)[0];
    if (!assessment) notFound();
    if (assessment.timeLimitMinutes === null) throw new HttpError(409, "NOT_TIMED", "Akomodasi waktu hanya berlaku untuk penilaian bertimer.");
    if (!(await tx`SELECT 1 FROM class_members m JOIN courses c ON c.class_id = m.class_id AND c.academic_year_id = m.academic_year_id JOIN users u ON u.id = m.student_id
      WHERE c.id = ${courseId} AND m.student_id = ${studentId} AND u.is_active FOR SHARE`).length) notFound();
    const current = (await tx<{ id: string; extraMinutes: number; reason: string }[]>`SELECT id, extra_minutes AS "extraMinutes", reason FROM assessment_accommodations
      WHERE activity_id = ${activityId} AND student_id = ${studentId} FOR UPDATE`)[0];
    if (current) {
      if (current.extraMinutes !== extraMinutes || current.reason !== reason) throw new HttpError(409, "ACCOMMODATION_CHANGED", "Akomodasi sudah berubah. Muat ulang sebelum menyimpan kembali.");
      return { id: current.id };
    }
    const row = (await tx<{ id: string }[]>`INSERT INTO assessment_accommodations (activity_id, course_id, student_id, extra_minutes, reason, granted_by)
      VALUES (${activityId}, ${courseId}, ${studentId}, ${extraMinutes}, ${reason}, ${actor.id}) RETURNING id`)[0]!;
    // Recalculate from the immutable start time so a grant or retry never adds
    // the same minutes twice. Submitted attempts are intentionally unchanged.
    await tx`UPDATE attempts t SET deadline_at = LEAST(t.started_at + (${assessment.timeLimitMinutes} + ${extraMinutes}) * interval '1 minute',
        COALESCE(${assessment.closesAt}::timestamptz + ${extraMinutes} * interval '1 minute', t.started_at + (${assessment.timeLimitMinutes} + ${extraMinutes}) * interval '1 minute'))
      WHERE t.activity_id = ${activityId} AND t.student_id = ${studentId} AND t.submitted_at IS NULL`;
    await recordAudit(tx, actor.id, "assessment.accommodation.granted", "activities", activityId, requestId);
    return row;
  });
}

export function accommodationStudentId(body: Record<string, unknown>) { return idField(body, "studentId"); }
