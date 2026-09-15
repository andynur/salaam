import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { certificationProgress, type Certification, type PublicCertification } from "../../shared/certification";
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
  const load = async (tx: SQL) => {
    const { course, canParticipate } = await courseAccess(tx, actor, courseId, "view", requestId ? "share" : false);
    if (!(course.canManage || course.canAssist || (canParticipate && studentId === actor.id))) notFound();
    if (requestId) await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`certificate:${courseId}:${studentId}`}, 0))`;
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
    type Issued = { id: string; studentName: string; courseName: string; className: string; term: string; year: string; teachers: string[]; issuedAt: string; publicSlug: string };
    const findIssued = () => tx<Issued[]>`SELECT id, student_name AS "studentName", course_name AS "courseName", class_name AS "className",
      term_name AS term, academic_year AS year, teacher_names AS teachers, issued_at AS "issuedAt", public_slug AS "publicSlug"
      FROM course_certificates WHERE course_id = ${courseId} AND student_id = ${studentId}`;
    let issued = (await findIssued())[0];
    if (requestId && !issued) {
      const slug = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
      const inserted = await tx<Issued[]>`INSERT INTO course_certificates (course_id, student_id, issued_by, public_slug, student_name,
        course_name, class_name, term_name, academic_year, teacher_names)
        VALUES (${courseId}, ${studentId}, ${actor.id}, ${slug}, ${progress.studentName}, ${course.name}, ${course.className},
          ${course.term}, ${course.year}, ${JSON.stringify(teachers.map(row => row.name))}::text::jsonb) ON CONFLICT (course_id, student_id) DO NOTHING
        RETURNING id, student_name AS "studentName", course_name AS "courseName", class_name AS "className", term_name AS term,
          academic_year AS year, teacher_names AS teachers, issued_at AS "issuedAt", public_slug AS "publicSlug"`;
      issued = inserted[0] ?? (await findIssued())[0];
      if (inserted.length) await recordAudit(tx, actor.id, "learning.certification.issued", "course_certificates", issued!.id, requestId);
    }
    if (requestId) await recordAudit(tx, actor.id, "learning.certification.generated", "users", studentId, requestId);
    const names = teachers.map(row => row.name);
    return { ...summary, studentName: issued?.studentName ?? progress.studentName, courseName: issued?.courseName ?? course.name,
      className: issued?.className ?? course.className, term: issued?.term ?? course.term, year: issued?.year ?? course.year,
      teachers: issued?.teachers ?? names, generatedAt: issued?.issuedAt ?? clock!.now, issuedAt: issued?.issuedAt ?? null,
      verificationPath: issued ? `/share/certificates/${issued.publicSlug}` : null };
  };
  return requestId ? db.begin(load) : db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", load);
}

const publicMissing = (): never => { throw new HttpError(404, "NOT_FOUND", "Sertifikat publik tidak ditemukan."); };
export async function publicCertification(db: SQL, slug: string): Promise<PublicCertification> {
  const rows = await db<PublicCertification[]>`SELECT student_name AS "studentName", course_name AS "courseName", class_name AS "className",
    term_name AS term, academic_year AS year, teacher_names AS teachers, issued_at AS "issuedAt"
    FROM course_certificates WHERE public_slug = ${slug}`;
  return rows[0] ?? publicMissing();
}
