import type { SQL } from "bun";
import type { AcademicResource, RecordRow } from "../../shared/foundation";
import { dates, idField, invalid, textField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { HttpError } from "../../core/errors";

export async function listAcademic(db: SQL, resource: AcademicResource, pattern: string, offset: number) {
  switch (resource) {
    case "years": return db<RecordRow[]>`SELECT id, name, starts_on::text AS "startsOn", ends_on::text AS "endsOn", archived_at IS NOT NULL AS archived
      FROM academic_years WHERE name ILIKE ${pattern} ORDER BY starts_on DESC, id LIMIT 51 OFFSET ${offset}`;
    case "terms": return db<RecordRow[]>`SELECT t.id, t.name, y.name AS year, t.starts_on::text AS "startsOn", t.ends_on::text AS "endsOn", t.archived_at IS NOT NULL AS archived
      FROM terms t JOIN academic_years y ON y.id = t.academic_year_id WHERE t.name ILIKE ${pattern} OR y.name ILIKE ${pattern}
      ORDER BY t.starts_on DESC, t.id LIMIT 51 OFFSET ${offset}`;
    case "classes": return db<RecordRow[]>`SELECT c.id, c.name, y.name AS year, c.archived_at IS NOT NULL AS archived FROM classes c JOIN academic_years y ON y.id = c.academic_year_id
      WHERE c.name ILIKE ${pattern} OR y.name ILIKE ${pattern} ORDER BY y.starts_on DESC, c.name, c.id LIMIT 51 OFFSET ${offset}`;
    case "enrollments": return db<RecordRow[]>`SELECT m.id, u.display_name AS name, u.email, c.name AS class, y.name AS year
      FROM class_members m JOIN users u ON u.id = m.student_id JOIN classes c ON c.id = m.class_id JOIN academic_years y ON y.id = m.academic_year_id
      WHERE u.display_name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR c.name ILIKE ${pattern}
      ORDER BY m.created_at DESC, m.id LIMIT 51 OFFSET ${offset}`;
    case "subjects": return db<RecordRow[]>`SELECT id, name, code FROM subjects WHERE name ILIKE ${pattern} OR code ILIKE ${pattern}
      ORDER BY name, id LIMIT 51 OFFSET ${offset}`;
    case "courses": return db<RecordRow[]>`SELECT c.id, c.name, s.name AS subject, cl.name AS class, t.name AS term, y.name AS year
      FROM courses c JOIN subjects s ON s.id = c.subject_id JOIN classes cl ON cl.id = c.class_id
      JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
      WHERE c.name ILIKE ${pattern} OR cl.name ILIKE ${pattern} OR y.name ILIKE ${pattern}
      ORDER BY c.created_at DESC, c.id LIMIT 51 OFFSET ${offset}`;
    case "teaching-assignments": return db<RecordRow[]>`SELECT a.id, u.display_name AS name, u.email, c.name AS course, cl.name AS class, t.name AS term, y.name AS year
      FROM teaching_assignments a JOIN users u ON u.id = a.teacher_id JOIN courses c ON c.id = a.course_id
      JOIN classes cl ON cl.id = c.class_id JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
      WHERE u.display_name ILIKE ${pattern} OR c.name ILIKE ${pattern}
      ORDER BY a.created_at DESC, a.id LIMIT 51 OFFSET ${offset}`;
  }
}
async function requireRole(db: SQL, userId: string, role: string) {
  const rows = await db`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
    WHERE u.id = ${userId} AND u.is_active = true AND r.key = ${role} FOR SHARE OF u, ur`;
  if (!rows.length) invalid(role === "student" ? "Pilih akun santri aktif." : "Pilih akun guru aktif.");
}
export async function createAcademic(db: SQL, resource: AcademicResource, body: Record<string, unknown>, actorId: string, requestId: string) {
  return db.begin(async tx => {
    let rows: { id: string }[];
    switch (resource) {
      case "years": {
        const name = textField(body, "name");
        const { startsOn, endsOn } = dates(body);
        rows = await tx`INSERT INTO academic_years (name, starts_on, ends_on) VALUES (${name}, ${startsOn}, ${endsOn}) RETURNING id`;
        break;
      }
      case "terms": {
        const name = textField(body, "name");
        const yearId = idField(body, "yearId");
        const { startsOn, endsOn } = dates(body);
        rows = await tx`INSERT INTO terms (academic_year_id, name, starts_on, ends_on)
          SELECT id, ${name}, ${startsOn}::date, ${endsOn}::date FROM academic_years
          WHERE id = ${yearId} AND archived_at IS NULL AND starts_on <= ${startsOn}::date AND ends_on >= ${endsOn}::date RETURNING id`;
        if (!rows.length) invalid("Rentang semester harus berada di dalam tahun ajaran yang dipilih.");
        break;
      }
      case "classes": {
        const name = textField(body, "name");
        const yearId = idField(body, "yearId");
        rows = await tx`INSERT INTO classes (academic_year_id, name) SELECT id, ${name} FROM academic_years WHERE id = ${yearId} AND archived_at IS NULL RETURNING id`;
        if (!rows.length) invalid("Tahun ajaran tidak ditemukan atau sudah diarsipkan.");
        break;
      }
      case "enrollments": {
        const classId = idField(body, "classId");
        const studentId = idField(body, "studentId");
        await requireRole(tx, studentId, "student");
        rows = await tx`INSERT INTO class_members (class_id, academic_year_id, student_id)
          SELECT id, academic_year_id, ${studentId} FROM classes WHERE id = ${classId} AND archived_at IS NULL RETURNING id`;
        if (!rows.length) invalid("Kelas tidak ditemukan.");
        break;
      }
      case "subjects": {
        const name = textField(body, "name");
        const code = textField(body, "code", 30).toUpperCase();
        rows = await tx`INSERT INTO subjects (code, name) VALUES (${code}, ${name}) RETURNING id`;
        break;
      }
      case "courses": {
        const name = textField(body, "name");
        const termId = idField(body, "termId");
        const classId = idField(body, "classId");
        const subjectId = idField(body, "subjectId");
        rows = await tx`INSERT INTO courses (name, academic_year_id, term_id, class_id, subject_id)
          SELECT ${name}, t.academic_year_id, t.id, c.id, ${subjectId} FROM terms t JOIN classes c ON c.academic_year_id = t.academic_year_id
          WHERE t.id = ${termId} AND c.id = ${classId} AND t.archived_at IS NULL AND c.archived_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM academic_years y WHERE y.id = t.academic_year_id AND y.archived_at IS NOT NULL) RETURNING id`;
        if (!rows.length) invalid("Kelas dan semester harus berasal dari tahun ajaran yang sama.");
        break;
      }
      case "teaching-assignments": {
        const courseId = idField(body, "courseId");
        const teacherId = idField(body, "teacherId");
        await requireRole(tx, teacherId, "teacher");
        rows = await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${courseId}, ${teacherId}) RETURNING id`;
        break;
      }
    }
    const id = rows[0]!.id;
    await recordAudit(tx, actorId, `academic.${resource}.created`, resource, id, requestId);
    return { id };
  });
}

export async function archiveAcademic(db: SQL, resource: "years" | "terms" | "classes", id: string, archived: boolean, actorId: string, requestId: string) {
  return db.begin(async tx => {
    const [row] = resource === "years" ? await tx`SELECT id, archived_at FROM academic_years WHERE id = ${id} FOR UPDATE` : resource === "terms" ? await tx`SELECT id, archived_at FROM terms WHERE id = ${id} FOR UPDATE` : await tx`SELECT id, archived_at FROM classes WHERE id = ${id} FOR UPDATE`;
    if (!row) throw new HttpError(404, "NOT_FOUND", "Data akademik tidak ditemukan.");
    if (archived) {
      const dependencies = resource === "years" ? await tx`SELECT 1 FROM terms WHERE academic_year_id = ${id} AND archived_at IS NULL UNION ALL SELECT 1 FROM classes WHERE academic_year_id = ${id} AND archived_at IS NULL LIMIT 1` : resource === "terms" ? await tx`SELECT 1 FROM courses WHERE term_id = ${id} LIMIT 1` : await tx`SELECT 1 FROM courses WHERE class_id = ${id} LIMIT 1`;
      if (dependencies.length) throw new HttpError(409, "ACTIVE_DEPENDENCIES", "Arsipkan data turunan atau course terkait terlebih dahulu.");
    } else if (resource !== "years") {
      const parent = resource === "terms" ? await tx`SELECT 1 FROM academic_years y JOIN terms t ON t.academic_year_id = y.id WHERE t.id = ${id} AND y.archived_at IS NOT NULL` : await tx`SELECT 1 FROM academic_years y JOIN classes c ON c.academic_year_id = y.id WHERE c.id = ${id} AND y.archived_at IS NOT NULL`;
      if (parent.length) throw new HttpError(409, "PARENT_ARCHIVED", "Pulihkan tahun ajaran terlebih dahulu.");
    }
    if (resource === "years") await tx`UPDATE academic_years SET archived_at = CASE WHEN ${archived} THEN clock_timestamp() ELSE NULL END WHERE id = ${id}`;
    else if (resource === "terms") await tx`UPDATE terms SET archived_at = CASE WHEN ${archived} THEN clock_timestamp() ELSE NULL END WHERE id = ${id}`;
    else await tx`UPDATE classes SET archived_at = CASE WHEN ${archived} THEN clock_timestamp() ELSE NULL END WHERE id = ${id}`;
    await recordAudit(tx, actorId, `academic.${resource}.${archived ? "archived" : "restored"}`, resource, id, requestId);
    return { id, archived };
  });
}

export async function transferStudent(db: SQL, studentId: string, toClassId: string, reason: string, actorId: string, requestId: string) {
  return db.begin(async tx => {
    const [target] = await tx<{ id: string; academicYearId: string }[]>`SELECT c.id, c.academic_year_id AS "academicYearId" FROM classes c
      JOIN academic_years y ON y.id = c.academic_year_id
      WHERE c.id = ${toClassId} AND c.archived_at IS NULL AND y.archived_at IS NULL FOR UPDATE OF c, y`;
    if (!target) throw new HttpError(404, "NOT_FOUND", "Kelas tujuan tidak ditemukan atau sudah diarsipkan.");
    const [membership] = await tx<{ id: string; classId: string; academicYearId: string }[]>`SELECT m.id, m.class_id AS "classId", m.academic_year_id AS "academicYearId" FROM class_members m
      JOIN users u ON u.id = m.student_id JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE m.student_id = ${studentId} AND m.academic_year_id = ${target.academicYearId} AND u.is_active AND r.key = 'student' FOR UPDATE OF m, u`;
    if (!membership) throw new HttpError(400, "NO_ENROLLMENT", "Santri belum terdaftar pada tahun ajaran kelas tujuan.");
    if (membership.classId === target.id) throw new HttpError(409, "SAME_CLASS", "Santri sudah berada di kelas tujuan.");
    await tx`UPDATE class_members SET class_id = ${target.id} WHERE id = ${membership.id}`;
    const [transfer] = await tx`INSERT INTO class_transfers (student_id, academic_year_id, from_class_id, to_class_id, reason, changed_by) VALUES (${studentId}, ${target.academicYearId}, ${membership.classId}, ${target.id}, ${reason.trim()}, ${actorId}) RETURNING id`;
    await recordAudit(tx, actorId, "academic.class_transfer.created", "class_transfers", transfer!.id, requestId);
    return { id: transfer!.id, studentId, fromClassId: membership.classId, toClassId: target.id };
  });
}
