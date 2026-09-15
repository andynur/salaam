import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { certificationProgress, type Certification } from "../../shared/certification";
import { courseAccess, notFound } from "./access";
import { progressRows } from "./service";

export async function listCertifications(db: SQL, actor: Actor, courseId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { course, canParticipate } = await courseAccess(tx, actor, courseId, "view");
    if (!course.canManage && !course.canAssist && !canParticipate) notFound();
    return (await progressRows(tx, courseId, course.canManage || course.canAssist ? null : actor.id, pattern, offset, true)).map(certificationProgress);
  });
}

export async function courseCertification(db: SQL, actor: Actor, courseId: string, studentId: string, requestId?: string): Promise<Certification> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ", async tx => {
    const { course, canParticipate } = await courseAccess(tx, actor, courseId, "view", requestId ? "share" : false);
    if (!(course.canManage || course.canAssist || (canParticipate && studentId === actor.id))) notFound();
    const progress = (await progressRows(tx, courseId, studentId, "%", 0, true))[0];
    if (!progress) notFound();
    const active = await tx`SELECT 1 FROM courses c JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id
      JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = ${courseId} AND c.published
      AND cl.archived_at IS NULL AND t.archived_at IS NULL AND y.archived_at IS NULL`;
    const summary = certificationProgress(progress);
    summary.eligible = summary.eligible && active.length > 0;
    if (requestId && !summary.eligible) throw new HttpError(409, "CERTIFICATION_LOCKED", "Selesaikan seluruh materi dan aktivitas pada course aktif untuk mengunduh sertifikat.");
    const teachers = await tx<{ name: string }[]>`SELECT DISTINCT u.display_name AS name FROM teaching_assignments a JOIN users u ON u.id = a.teacher_id
      WHERE a.course_id = ${courseId} AND EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = u.id AND p.key = 'learning.manage') ORDER BY name`;
    const [clock] = await tx<{ now: string }[]>`SELECT CURRENT_TIMESTAMP::text AS now`;
    if (requestId) await recordAudit(tx, actor.id, "learning.certification.generated", "users", studentId, requestId);
    return { ...summary, courseName: course.name, className: course.className, term: course.term, year: course.year,
      teachers: teachers.map(row => row.name), generatedAt: clock!.now };
  });
}
