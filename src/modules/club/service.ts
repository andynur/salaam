import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess } from "../learning/access";
import { listChallenges } from "../projects/challenges";
import { publishedInput } from "../learning/input";
import { levelFor } from "../../shared/gamification";
import type { ClubChallengeRow, ClubDetail, ClubGoal, ClubMeetingRow, ClubPerson, ClubProgressRow, ClubSummary } from "../../shared/club";
import { clubAccess, clubCourseRows, notFound, requireClubAdmin } from "./access";
import { clubArchivedInput, clubCourseInput, clubCreateInput, clubGoalsInput, clubMemberInput, clubProfileInput } from "./input";

const can = (actor: Actor, permission: string) => actor.permissions.includes(permission);
// Cross-course club tabs read the linked courses the actor may already see. Clubs link a
// handful of courses, so the challenge tab reuses the per-course challenge query instead of
// a second challenge engine; it covers the first page of linked courses.
const challengeCourseLimit = 25;

export async function listClubs(db: SQL, actor: Actor, pattern: string, offset: number, includeArchived = false) {
  requirePermission(actor, "club.view");
  const manage = can(actor, "club.manage");
  const all = manage && can(actor, "learning.manage.all");
  return db<ClubSummary[]>`SELECT c.id, c.slug, c.name, c.tagline, c.published, c.archived_at IS NOT NULL AS archived, ${all}::boolean AS "canAdmin",
      (SELECT m.role FROM club_members m WHERE m.club_id = c.id AND m.user_id = ${actor.id} AND m.removed_at IS NULL) AS membership,
      (${manage} AND (${all} OR EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.user_id = ${actor.id}
        AND m.removed_at IS NULL AND m.role = 'mentor'))) AS "canManage",
      (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id AND m.removed_at IS NULL AND m.role = 'mentor') AS mentors,
      (SELECT count(*)::int FROM club_members m WHERE m.club_id = c.id AND m.removed_at IS NULL AND m.role = 'member') AS members,
      (SELECT count(*)::int FROM club_courses cc WHERE cc.club_id = c.id) AS courses
    FROM clubs c WHERE (c.name ILIKE ${pattern} OR c.tagline ILIKE ${pattern}) AND (${includeArchived} OR c.archived_at IS NULL) AND (
      ${all} OR (${manage} AND EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.user_id = ${actor.id}
        AND m.removed_at IS NULL AND m.role = 'mentor'))
      OR (c.published AND c.archived_at IS NULL AND EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = c.id
        AND m.user_id = ${actor.id} AND m.removed_at IS NULL)))
    ORDER BY c.name, c.id LIMIT 51 OFFSET ${offset}`;
}

export async function clubDetail(db: SQL, actor: Actor, clubId: string): Promise<ClubDetail> {
  // One snapshot so counts, goals, and mentors describe the same club state.
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const { club, canManage, membership } = await clubAccess(tx, actor, clubId);
    const goals = await tx<ClubGoal[]>`SELECT position, title, description FROM club_goals WHERE club_id = ${clubId} ORDER BY position`;
    const mentorList = await tx<ClubPerson[]>`SELECT m.user_id AS "userId", u.display_name AS name, m.role, m.joined_at::text AS "joinedAt"
      FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${clubId} AND m.removed_at IS NULL AND m.role = 'mentor' AND u.is_active
      ORDER BY u.display_name, u.id LIMIT 20`;
    const stats = (await tx<ClubDetail["stats"][]>`WITH visible AS (${visibleCourses(tx, actor, clubId)})
      SELECT (SELECT count(*)::int FROM lessons l JOIN course_modules m ON m.id = l.module_id JOIN visible v ON v.course_id = l.course_id
          WHERE l.archived_at IS NULL AND m.archived_at IS NULL) AS lessons,
        (SELECT count(*)::int FROM activities a JOIN visible v ON v.course_id = a.course_id WHERE a.kind = 'challenge' AND a.archived_at IS NULL) AS challenges,
        (SELECT count(*)::int FROM projects p JOIN visible v ON v.course_id = p.course_id) AS projects,
        (SELECT count(*)::int FROM projects p JOIN visible v ON v.course_id = p.course_id WHERE p.status = 'approved') AS "approvedProjects",
        (SELECT count(*)::int FROM classroom_sessions s JOIN visible v ON v.course_id = s.course_id) AS sessions,
        (SELECT COALESCE(sum(x.points), 0)::int FROM xp_entries x JOIN visible v ON v.course_id = x.course_id
          JOIN club_members m ON m.user_id = x.student_id AND m.club_id = ${clubId} AND m.removed_at IS NULL) AS xp`)[0]!;
    return { ...club, canManage, membership, goals, mentorList, stats };
  });
}

// The course ids of the club that this actor may already reach, as a subquery for the
// cross-course tabs. It mirrors the scope rule in clubCourseRows.
function visibleCourses(db: SQL, actor: Actor, clubId: string) {
  const manage = can(actor, "learning.manage");
  const all = can(actor, "learning.manage.all");
  return db`SELECT cc.course_id FROM club_courses cc JOIN courses c ON c.id = cc.course_id JOIN classes cl ON cl.id = c.class_id
    JOIN terms t ON t.id = c.term_id JOIN academic_years y ON y.id = c.academic_year_id
    WHERE cc.club_id = ${clubId} AND (
      (${manage} AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))) OR
      (c.published AND cl.archived_at IS NULL AND t.archived_at IS NULL AND y.archived_at IS NULL
        AND EXISTS (SELECT 1 FROM class_members m WHERE m.class_id = c.class_id AND m.student_id = ${actor.id})))`;
}

export async function clubCourses(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    return clubCourseRows(tx, actor, clubId, pattern, offset);
  });
}

export async function clubChallenges(db: SQL, actor: Actor, clubId: string): Promise<ClubChallengeRow[]> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    const courses = (await clubCourseRows(tx, actor, clubId, "%", 0)).slice(0, challengeCourseLimit);
    const rows: ClubChallengeRow[] = [];
    for (const course of courses) {
      for (const challenge of await listChallenges(tx, actor, course.id, course.canManage)) {
        if (challenge.archived) continue;
        rows.push({ id: challenge.id, courseId: course.id, courseName: course.name, lessonId: challenge.lessonId, title: challenge.title,
          dueAt: challenge.dueAt, teamMode: challenge.settings.teamMode, maxTeamSize: challenge.settings.maxTeamSize,
          projectCount: challenge.projectCount, myProjectId: challenge.project?.id ?? null });
      }
    }
    return rows.sort((left, right) => (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999") || left.title.localeCompare(right.title));
  });
}

export async function clubMeetings(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    const manage = can(actor, "learning.manage");
    const all = can(actor, "learning.manage.all");
    return tx<ClubMeetingRow[]>`WITH visible AS (${visibleCourses(tx, actor, clubId)})
      SELECT s.id, s.course_id AS "courseId", c.name AS "courseName", s.title, s.starts_at::text AS "startsAt", s.ends_at::text AS "endsAt",
        s.status, s.version,
        CASE WHEN ${manage} AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))
          THEN s.note END AS note,
        CASE WHEN ${manage} AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id}))
          THEN s.reason END AS reason
      FROM classroom_sessions s JOIN visible v ON v.course_id = s.course_id JOIN courses c ON c.id = s.course_id
      WHERE (s.title ILIKE ${pattern} OR c.name ILIKE ${pattern}) AND (
        (${manage} AND (${all} OR EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.course_id = c.id AND a.teacher_id = ${actor.id})))
        OR EXISTS (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = ${actor.id} AND r.removed_at IS NULL))
      ORDER BY s.starts_at DESC, s.id LIMIT 51 OFFSET ${offset}`;
  });
}

export async function clubMembers(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    return tx<ClubPerson[]>`SELECT m.user_id AS "userId", u.display_name AS name, m.role, m.joined_at::text AS "joinedAt"
      FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${clubId} AND m.removed_at IS NULL AND u.is_active AND u.display_name ILIKE ${pattern}
      ORDER BY (m.role = 'mentor') DESC, u.display_name, u.id LIMIT 51 OFFSET ${offset}`;
  });
}

export async function clubProgress(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    const rows = await tx<Omit<ClubProgressRow, "level">[]>`WITH visible AS (${visibleCourses(tx, actor, clubId)})
      SELECT m.user_id AS "studentId", u.display_name AS "studentName", m.role,
        COALESCE((SELECT sum(x.points)::int FROM xp_entries x WHERE x.student_id = m.user_id), 0) AS xp,
        (SELECT count(*)::int FROM badge_awards ba WHERE ba.student_id = m.user_id) AS badges,
        (SELECT count(*)::int FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id JOIN visible v ON v.course_id = l.course_id
          WHERE lc.student_id = m.user_id) AS "lessonsCompleted",
        (SELECT count(*)::int FROM project_members pm JOIN projects p ON p.id = pm.project_id JOIN visible v ON v.course_id = p.course_id
          WHERE pm.student_id = m.user_id AND p.status = 'approved') AS "projectsApproved"
      FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${clubId} AND m.removed_at IS NULL AND m.role = 'member' AND u.is_active AND u.display_name ILIKE ${pattern}
      ORDER BY xp DESC, u.display_name, u.id LIMIT 51 OFFSET ${offset}`;
    return rows.map(row => ({ ...row, level: levelFor(row.xp).level }));
  });
}

// Candidates are people already connected to the club's linked courses: enrolled students
// and assigned teachers. A mentor can therefore never pull in an unrelated account.
export async function clubCandidates(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId, "manage");
    return tx<{ userId: string; name: string; role: "mentor" | "member" }[]>`WITH visible AS (${visibleCourses(tx, actor, clubId)})
      SELECT u.id AS "userId", u.display_name AS name, CASE WHEN people.teacher THEN 'mentor' ELSE 'member' END AS role FROM (
        SELECT cm.student_id AS user_id, false AS teacher FROM class_members cm JOIN courses c ON c.class_id = cm.class_id
          JOIN visible v ON v.course_id = c.id
        UNION SELECT ta.teacher_id, true FROM teaching_assignments ta JOIN visible v ON v.course_id = ta.course_id
      ) people JOIN users u ON u.id = people.user_id
      WHERE u.is_active AND u.display_name ILIKE ${pattern}
        AND NOT EXISTS (SELECT 1 FROM club_members m WHERE m.club_id = ${clubId} AND m.user_id = u.id AND m.removed_at IS NULL)
      ORDER BY people.teacher DESC, u.display_name, u.id LIMIT 51 OFFSET ${offset}`;
  });
}

// The club directory is administrator work: creating a club, and archiving or restoring it.
// Archive is the club's delete — rows are kept so history, membership and audit stay
// explainable — so there is no destructive route.
export async function createClub(db: SQL, actor: Actor, body: Record<string, unknown>, requestId: string) {
  const input = clubCreateInput(body);
  requireClubAdmin(actor);
  return db.begin(async tx => {
    const rows = await tx<{ id: string; slug: string }[]>`INSERT INTO clubs (slug, name, tagline, purpose, direction, program)
      VALUES (${input.slug}, ${input.name}, ${input.tagline}, ${input.purpose}, ${input.direction}, ${input.program}) RETURNING id, slug`;
    await recordAudit(tx, actor.id, "club.created", "clubs", rows[0]!.id, requestId);
    return rows[0]!;
  });
}

export async function archiveClub(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const archived = clubArchivedInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "admin", true);
    const rows = await tx<{ id: string }[]>`UPDATE clubs SET archived_at = CASE WHEN ${archived} THEN COALESCE(archived_at, clock_timestamp()) END,
      updated_at = clock_timestamp() WHERE id = ${clubId} RETURNING id`;
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `club.${archived ? "archived" : "restored"}`, "clubs", clubId, requestId);
    return { id: clubId, archived };
  });
}

export async function updateClub(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const input = clubProfileInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    const rows = await tx<{ id: string }[]>`UPDATE clubs SET name = ${input.name}, tagline = ${input.tagline}, purpose = ${input.purpose},
      direction = ${input.direction}, program = ${input.program}, updated_at = clock_timestamp() WHERE id = ${clubId} RETURNING id`;
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, "club.updated", "clubs", clubId, requestId);
    return rows[0]!;
  });
}

export async function publishClub(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const published = publishedInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    const rows = await tx<{ id: string }[]>`UPDATE clubs SET published = ${published}, updated_at = clock_timestamp() WHERE id = ${clubId} RETURNING id`;
    if (!rows.length) notFound();
    await recordAudit(tx, actor.id, `club.${published ? "published" : "unpublished"}`, "clubs", clubId, requestId);
    return { id: clubId, published };
  });
}

// Goals are replaced as a whole ordered list; a retry with the same list is a no-op result.
export async function setClubGoals(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const goals = clubGoalsInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    await tx`DELETE FROM club_goals WHERE club_id = ${clubId}`;
    for (const goal of goals) {
      await tx`INSERT INTO club_goals (club_id, position, title, description) VALUES (${clubId}, ${goal.position}, ${goal.title}, ${goal.description})`;
    }
    await recordAudit(tx, actor.id, "club.goals.updated", "clubs", clubId, requestId);
    return { goals: goals.length };
  });
}

// Membership reuses accounts and capabilities: a mentor must hold learning.manage and a
// member learning.participate, so a club never grants what a role does not.
export async function setClubMember(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const input = clubMemberInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    if (input.removed) {
      if (input.role === "mentor") {
        const mentors = await tx`SELECT 1 FROM club_members WHERE club_id = ${clubId} AND removed_at IS NULL AND role = 'mentor' AND user_id <> ${input.userId}`;
        if (!mentors.length) throw new HttpError(409, "LAST_MENTOR", "Klub harus memiliki minimal satu mentor aktif.");
      }
      const rows = await tx<{ userId: string }[]>`UPDATE club_members SET removed_at = COALESCE(removed_at, clock_timestamp())
        WHERE club_id = ${clubId} AND user_id = ${input.userId} RETURNING user_id AS "userId"`;
      if (!rows.length) notFound();
      await recordAudit(tx, actor.id, "club.member.removed", "club_members", input.userId, requestId);
      return { userId: input.userId, role: input.role, removed: true };
    }
    const capability = input.role === "mentor" ? "learning.manage" : "learning.participate";
    const eligible = await tx`SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id WHERE u.id = ${input.userId} AND u.is_active AND p.key = ${capability} LIMIT 1`;
    if (!eligible.length) {
      throw new HttpError(400, "INVALID_INPUT", input.role === "mentor"
        ? "Mentor harus akun guru atau admin yang aktif." : "Anggota harus akun santri yang aktif.");
    }
    await tx`INSERT INTO club_members (club_id, user_id, role) VALUES (${clubId}, ${input.userId}, ${input.role})
      ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role, removed_at = NULL,
        joined_at = CASE WHEN club_members.removed_at IS NULL THEN club_members.joined_at ELSE clock_timestamp() END`;
    await recordAudit(tx, actor.id, "club.member.added", "club_members", input.userId, requestId);
    return { userId: input.userId, role: input.role, removed: false };
  });
}

// Linking checks the course through courseAccess, so a mentor can only attach a course they
// already manage; the course itself is never modified.
export async function setClubCourse(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const input = clubCourseInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    await courseAccess(tx, actor, input.courseId, "manage", true);
    if (input.linked) {
      await tx`INSERT INTO club_courses (club_id, course_id, linked_by) VALUES (${clubId}, ${input.courseId}, ${actor.id}) ON CONFLICT DO NOTHING`;
    } else {
      await tx`DELETE FROM club_courses WHERE club_id = ${clubId} AND course_id = ${input.courseId}`;
    }
    await recordAudit(tx, actor.id, `club.course.${input.linked ? "linked" : "unlinked"}`, "club_courses", input.courseId, requestId);
    return { courseId: input.courseId, linked: input.linked };
  });
}
