import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { invalid, textField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { recordStoredFile, uploadInput, withFileCleanup } from "../../core/storage/files";
import { awardProjectApproval } from "../gamification/awards";
import { courseAccess, notFound } from "../learning/access";
import { memberIdsInput, projectInput, reviewInput, showcaseInput } from "./input";
import type { ProjectDetail, ProjectMember, ProjectReview, ProjectRow, ProjectStatus, ProjectTask, ReviewDecision, TeamMode } from "../../shared/project";

const can = (actor: Actor, permission: string) => actor.permissions.includes(permission);

export interface ProjectAccess {
  id: string; courseId: string; activityId: string; status: ProjectStatus; summary: string; firstSubmittedAt: string | null; closed: boolean;
  canManage: boolean; isMember: boolean; canEdit: boolean;
}

// Course managers always reach a project. Members reach it while they are enrolled and
// the course, challenge, lesson, and module are published and unarchived. Mutations lock
// the course for share (publishing waits for them) and then the project row, so board and
// review writes on one project serialize.
export async function projectAccess(db: SQL, actor: Actor, projectId: string, lock = false): Promise<ProjectAccess> {
  requirePermission(actor, "learning.view");
  if (lock) {
    const owner = (await db<{ courseId: string }[]>`SELECT course_id AS "courseId" FROM projects WHERE id = ${projectId}`)[0];
    if (!owner) notFound();
    await db`SELECT id FROM courses WHERE id = ${owner.courseId} FOR SHARE`;
    await db`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
  }
  const row = (await db<Omit<ProjectAccess, "canEdit">[]>`SELECT p.id, p.course_id AS "courseId", p.activity_id AS "activityId", p.status, p.summary,
      p.first_submitted_at::text AS "firstSubmittedAt", (a.due_at IS NOT NULL AND clock_timestamp() >= a.due_at) AS closed,
      (${can(actor, "learning.manage")} AND (${can(actor, "learning.manage.all")} OR EXISTS
        (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = p.course_id AND ta.teacher_id = ${actor.id}))) AS "canManage",
      (${can(actor, "learning.participate")} AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.student_id = ${actor.id})
        AND EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.class_id AND cm.student_id = ${actor.id})
        AND c.published AND a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL) AS "isMember"
    FROM projects p JOIN activities a ON a.id = p.activity_id JOIN lessons l ON l.id = a.lesson_id
    JOIN course_modules m ON m.id = l.module_id JOIN courses c ON c.id = p.course_id
    WHERE p.id = ${projectId}`)[0];
  if (!row || !(row.canManage || row.isMember)) notFound();
  return { ...row, canEdit: row.status === "in_progress" || row.status === "changes_requested" };
}

export function requireEditable(access: ProjectAccess) {
  if (!access.canEdit) {
    throw new HttpError(409, "PROJECT_LOCKED", access.status === "approved"
      ? "Proyek sudah disetujui dan tidak dapat diubah."
      : "Proyek sedang direview. Proyek dapat diubah lagi jika guru meminta revisi.");
  }
}

async function lockChallenge(db: SQL, courseId: string, activityId: string) {
  return (await db<{ teamMode: TeamMode; maxTeamSize: number; closed: boolean; archived: boolean; visible: boolean }[]>`SELECT s.team_mode AS "teamMode", s.max_team_size AS "maxTeamSize",
      (a.due_at IS NOT NULL AND clock_timestamp() >= a.due_at) AS closed, a.archived_at IS NOT NULL AS archived,
      (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL) AS visible
    FROM challenge_settings s JOIN activities a ON a.id = s.activity_id JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    WHERE a.id = ${activityId} AND a.course_id = ${courseId} FOR UPDATE OF s`)[0];
}

// IDs are validated UUIDs, so a comma-joined array literal is safe to bind.
async function checkMembers(db: SQL, courseId: string, activityId: string, memberIds: string[], maxTeamSize: number, projectId: string | null) {
  if (memberIds.length > maxTeamSize) invalid(`Anggota tim maksimal ${maxTeamSize} santri.`);
  const list = memberIds.join(",");
  const enrolled = await db`SELECT u.id FROM users u JOIN class_members cm ON cm.student_id = u.id JOIN courses c ON c.class_id = cm.class_id
    WHERE c.id = ${courseId} AND u.is_active AND u.id = ANY(string_to_array(${list}, ',')::uuid[])`;
  if (enrolled.length !== memberIds.length) invalid("Anggota tim harus santri aktif yang terdaftar di kelas course ini.");
  const taken = await db`SELECT 1 FROM project_members WHERE activity_id = ${activityId} AND student_id = ANY(string_to_array(${list}, ',')::uuid[])
    AND (${projectId}::uuid IS NULL OR project_id <> ${projectId}::uuid) LIMIT 1`;
  if (taken.length) throw new HttpError(409, "MEMBER_TAKEN", "Ada santri yang sudah tergabung di proyek lain untuk challenge ini.");
}

// Managers form a team for any challenge. Students start their own project only for an
// individual challenge before its deadline; repeated or concurrent starts resume it.
export async function createProject(db: SQL, actor: Actor, courseId: string, activityId: string, body: Record<string, unknown>, requestId: string) {
  const title = textField(body, "title", 150);
  return db.begin(async tx => {
    const { course, canParticipate } = await courseAccess(tx, actor, courseId, "view", "share");
    const challenge = await lockChallenge(tx, courseId, activityId);
    let memberIds: string[];
    if (course.canManage) {
      if (!challenge || challenge.archived) notFound();
      memberIds = memberIdsInput(body);
      await checkMembers(tx, courseId, activityId, memberIds, challenge.maxTeamSize, null);
    } else {
      if (!canParticipate || !challenge?.visible) notFound();
      const own = (await tx<{ id: string }[]>`SELECT project_id AS id FROM project_members WHERE activity_id = ${activityId} AND student_id = ${actor.id}`)[0];
      if (own) return { id: own.id, resumed: true };
      if (challenge.teamMode !== "individual") throw new HttpError(403, "TEAM_BY_TEACHER", "Tim untuk challenge ini dibentuk oleh guru.");
      if (challenge.closed) throw new HttpError(409, "DEADLINE_PASSED", "Tenggat challenge sudah berakhir.");
      memberIds = [actor.id];
    }
    const id = (await tx<{ id: string }[]>`INSERT INTO projects (activity_id, course_id, title, created_by)
      VALUES (${activityId}, ${courseId}, ${title}, ${actor.id}) RETURNING id`)[0]!.id;
    await tx`INSERT INTO project_members (project_id, activity_id, student_id)
      SELECT ${id}, ${activityId}, member FROM unnest(string_to_array(${memberIds.join(",")}, ',')::uuid[]) AS member`;
    await recordAudit(tx, actor.id, "project.created", "projects", id, requestId);
    return { id, resumed: false };
  });
}

export async function listProjects(db: SQL, actor: Actor, pattern: string, offset: number, status: ProjectStatus | null, activityId: string | null) {
  requirePermission(actor, "learning.view");
  return db<ProjectRow[]>`SELECT p.id, p.title, p.status, c.id AS "courseId", c.name AS "courseName", cl.name AS "className",
      a.id AS "challengeId", a.title AS "challengeTitle", s.team_mode AS "teamMode", a.due_at::text AS "dueAt",
      p.showcased_at IS NOT NULL AS showcased, p.updated_at::text AS "updatedAt",
      (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.display_name) ORDER BY u.display_name, u.id), '[]'::json)
        FROM project_members pm JOIN users u ON u.id = pm.student_id WHERE pm.project_id = p.id) AS members,
      (SELECT count(*)::int FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL) AS "taskCount",
      (SELECT count(*)::int FROM project_tasks t WHERE t.project_id = p.id AND t.archived_at IS NULL AND t.status = 'done') AS "doneCount"
    FROM projects p JOIN activities a ON a.id = p.activity_id JOIN challenge_settings s ON s.activity_id = a.id
    JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    JOIN courses c ON c.id = p.course_id JOIN classes cl ON cl.id = c.class_id
    WHERE (p.title ILIKE ${pattern} OR a.title ILIKE ${pattern} OR c.name ILIKE ${pattern})
      AND (${status}::text IS NULL OR p.status = ${status}::text)
      AND (${activityId}::uuid IS NULL OR p.activity_id = ${activityId}::uuid)
      AND ((${can(actor, "learning.manage")} AND (${can(actor, "learning.manage.all")} OR EXISTS
          (SELECT 1 FROM teaching_assignments ta WHERE ta.course_id = c.id AND ta.teacher_id = ${actor.id})))
        OR (${can(actor, "learning.participate")} AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.student_id = ${actor.id})
          AND EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.class_id AND cm.student_id = ${actor.id})
          AND c.published AND a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))
    ORDER BY CASE p.status WHEN 'submitted' THEN 0 WHEN 'changes_requested' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END, p.updated_at DESC, p.id
    LIMIT 51 OFFSET ${offset}`;
}

export async function projectDetail(db: SQL, actor: Actor, projectId: string): Promise<ProjectDetail> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    const access = await projectAccess(tx, actor, projectId);
    const row = (await tx<(ProjectDetail["project"] & Pick<ProjectDetail, "course" | "challenge">)[]>`SELECT p.id, p.title, p.summary, p.deliverable_url AS "deliverableUrl",
        CASE WHEN f.id IS NULL THEN NULL ELSE json_build_object('id', f.id, 'name', f.original_name, 'mediaType', f.media_type, 'sizeBytes', f.size_bytes) END AS "deliverableFile", p.status,
        p.first_submitted_at::text AS "firstSubmittedAt", p.submitted_at::text AS "submittedAt", p.showcased_at::text AS "showcasedAt", p.updated_at::text AS "updatedAt",
        json_build_object('id', c.id, 'name', c.name, 'className', cl.name) AS course,
        json_build_object('id', a.id, 'lessonId', a.lesson_id, 'title', a.title, 'instructions', a.instructions, 'dueAt', a.due_at,
          'closed', a.due_at IS NOT NULL AND clock_timestamp() >= a.due_at, 'teamMode', s.team_mode, 'maxTeamSize', s.max_team_size) AS challenge
      FROM projects p JOIN activities a ON a.id = p.activity_id JOIN challenge_settings s ON s.activity_id = a.id
      JOIN courses c ON c.id = p.course_id JOIN classes cl ON cl.id = c.class_id LEFT JOIN stored_files f ON f.id = p.deliverable_file_id AND f.course_id = p.course_id
      WHERE p.id = ${projectId}`)[0]!;
    const { course, challenge, ...project } = row;
    const members = await tx<ProjectMember[]>`SELECT u.id, u.display_name AS name FROM project_members pm JOIN users u ON u.id = pm.student_id
      WHERE pm.project_id = ${projectId} ORDER BY u.display_name, u.id`;
    const tasks = await tx<ProjectTask[]>`SELECT t.id, t.title, t.description, t.status, t.position, t.assignee_id AS "assigneeId", u.display_name AS "assigneeName", t.due_at::text AS "dueAt", t.labels,
        t.version, t.updated_at::text AS "updatedAt"
      FROM project_tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.project_id = ${projectId} AND t.archived_at IS NULL ORDER BY t.status, t.position, t.created_at, t.id`;
    const reviews = await tx<ProjectReview[]>`SELECT r.id, r.decision, r.score::float8 AS score, r.feedback, u.display_name AS "reviewerName", r.created_at::text AS "createdAt"
      FROM project_reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.project_id = ${projectId} ORDER BY r.created_at DESC, r.id DESC LIMIT 50`;
    const portfolio = (await tx<NonNullable<ProjectDetail["portfolio"]>[]>`SELECT reflection, archived_at IS NOT NULL AS archived, updated_at::text AS "updatedAt"
      FROM portfolio_entries WHERE project_id = ${projectId} AND student_id = ${actor.id}`)[0] ?? null;
    return { project, course, challenge, members, tasks, reviews, canManage: access.canManage, isMember: access.isMember, canEdit: access.canEdit, portfolio };
  });
}

export async function updateProject(db: SQL, storageRoot: string, actor: Actor, projectId: string, body: Record<string, unknown>, file: File | null, requestId: string) {
  const input = projectInput(body);
  if (file && input.deliverableUrl) invalid("Pilih tautan atau berkas hasil karya, bukan keduanya.");
  const upload = file ? await uploadInput(file) : null;
  return withFileCleanup(storageRoot, upload, store => db.begin(async tx => {
    const access = await projectAccess(tx, actor, projectId, true);
    requireEditable(access);
    const current = (await tx<{ fileId: string | null }[]>`SELECT deliverable_file_id AS "fileId" FROM projects WHERE id = ${projectId} FOR UPDATE`)[0];
    if (!current) notFound();
    const fileId = upload?.id ?? (Object.hasOwn(body, "deliverableUrl") ? null : current.fileId);
    if (upload) await recordStoredFile(tx, access.courseId, actor.id, upload);
    await tx`UPDATE projects SET title = ${input.title}, summary = ${input.summary}, deliverable_url = ${upload ? null : input.deliverableUrl},
      deliverable_file_id = ${fileId === undefined ? null : fileId}, updated_at = clock_timestamp() WHERE id = ${projectId}`;
    await recordAudit(tx, actor.id, "project.updated", "projects", projectId, requestId);
    await store();
    return { id: projectId };
  }));
}

export async function projectFile(db: SQL, actor: Actor, projectId: string): Promise<import("../../shared/learning").StoredFile> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await projectAccess(tx, actor, projectId);
    const file = (await tx<import("../../shared/learning").StoredFile[]>`SELECT f.id, f.original_name AS name, f.media_type AS "mediaType", f.size_bytes AS "sizeBytes"
      FROM projects p JOIN stored_files f ON f.id = p.deliverable_file_id AND f.course_id = p.course_id WHERE p.id = ${projectId}`)[0];
    if (!file) notFound();
    return file;
  });
}

// Removing a member unassigns their cards (ON DELETE SET NULL on the assignee column).
export async function setProjectMembers(db: SQL, actor: Actor, projectId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const memberIds = memberIdsInput(body);
  return db.begin(async tx => {
    const owner = (await tx<{ courseId: string; activityId: string }[]>`SELECT course_id AS "courseId", activity_id AS "activityId" FROM projects WHERE id = ${projectId}`)[0];
    if (!owner) notFound();
    // Same lock order as project creation: course, challenge, then project.
    await tx`SELECT id FROM courses WHERE id = ${owner.courseId} FOR SHARE`;
    const challenge = await lockChallenge(tx, owner.courseId, owner.activityId);
    const access = await projectAccess(tx, actor, projectId, true);
    if (!access.canManage || !challenge) notFound();
    requireEditable(access);
    await checkMembers(tx, owner.courseId, owner.activityId, memberIds, challenge.maxTeamSize, projectId);
    const list = memberIds.join(",");
    await tx`DELETE FROM project_members WHERE project_id = ${projectId} AND NOT (student_id = ANY(string_to_array(${list}, ',')::uuid[]))`;
    await tx`INSERT INTO project_members (project_id, activity_id, student_id)
      SELECT ${projectId}, ${owner.activityId}, member FROM unnest(string_to_array(${list}, ',')::uuid[]) AS member ON CONFLICT DO NOTHING`;
    await tx`UPDATE projects SET updated_at = clock_timestamp() WHERE id = ${projectId}`;
    await recordAudit(tx, actor.id, "project.members.updated", "projects", projectId, requestId);
    return { id: projectId, memberCount: memberIds.length };
  });
}

// Idempotent: a repeated submit returns the submitted state without another audit event.
// The first submission must happen before the deadline; resubmissions after a revision
// request are always accepted.
export async function submitProject(db: SQL, actor: Actor, projectId: string, requestId: string) {
  requirePermission(actor, "learning.participate");
  return db.begin(async tx => {
    const access = await projectAccess(tx, actor, projectId, true);
    if (!access.isMember) notFound();
    if (access.status === "submitted") return { id: projectId, status: access.status };
    if (access.status === "approved") throw new HttpError(409, "ALREADY_APPROVED", "Proyek sudah disetujui.");
    if (!access.summary.trim()) invalid("Isi ringkasan hasil proyek sebelum mengirim untuk review.");
    if (!access.firstSubmittedAt && access.closed) throw new HttpError(409, "DEADLINE_PASSED", "Tenggat challenge sudah berakhir.");
    await tx`UPDATE projects SET status = 'submitted', submitted_at = clock_timestamp(), first_submitted_at = COALESCE(first_submitted_at, clock_timestamp()),
      updated_at = clock_timestamp() WHERE id = ${projectId}`;
    await recordAudit(tx, actor.id, "project.submitted", "projects", projectId, requestId);
    return { id: projectId, status: "submitted" as const };
  });
}

// Reviews append and apply only to a submitted project, so concurrent reviewers cannot
// both decide; an identical retry of the latest decision returns it.
export async function reviewProject(db: SQL, actor: Actor, projectId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const review = reviewInput(body);
  return db.begin(async tx => {
    const access = await projectAccess(tx, actor, projectId, true);
    if (!access.canManage) notFound();
    if (access.status !== "submitted") {
      const latest = (await tx<{ id: string; decision: ReviewDecision; score: number | null; feedback: string }[]>`SELECT id, decision, score::float8 AS score, feedback
        FROM project_reviews WHERE project_id = ${projectId} ORDER BY created_at DESC, id DESC LIMIT 1`)[0];
      if (latest && latest.decision === access.status && latest.decision === review.decision && latest.score === review.score && latest.feedback === review.feedback) {
        return { id: latest.id, status: access.status };
      }
      throw new HttpError(409, "NOT_SUBMITTED", "Proyek belum dikirim untuk review atau sudah direview.");
    }
    const id = (await tx<{ id: string }[]>`INSERT INTO project_reviews (project_id, reviewer_id, decision, score, feedback)
      VALUES (${projectId}, ${actor.id}, ${review.decision}, ${review.score}, ${review.feedback}) RETURNING id`)[0]!.id;
    await tx`UPDATE projects SET status = ${review.decision}, updated_at = clock_timestamp() WHERE id = ${projectId}`;
    await recordAudit(tx, actor.id, "project.reviewed", "projects", projectId, requestId);
    // Approval is final, so every member is rewarded exactly once per project.
    if (review.decision === "approved") await awardProjectApproval(tx, projectId, access.courseId, requestId);
    return { id, status: review.decision };
  });
}

export async function showcaseProject(db: SQL, actor: Actor, projectId: string, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "learning.manage");
  const showcased = showcaseInput(body);
  return db.begin(async tx => {
    const access = await projectAccess(tx, actor, projectId, true);
    if (!access.canManage) notFound();
    if (showcased && access.status !== "approved") throw new HttpError(409, "NOT_APPROVED", "Hanya proyek yang sudah disetujui yang dapat masuk showcase.");
    const rows = await tx`UPDATE projects SET showcased_at = CASE WHEN ${showcased} THEN clock_timestamp() END, showcased_by = CASE WHEN ${showcased} THEN ${actor.id}::uuid END
      WHERE id = ${projectId} AND (showcased_at IS NULL) = ${showcased} RETURNING id`;
    if (rows.length) await recordAudit(tx, actor.id, showcased ? "project.showcased" : "project.unshowcased", "projects", projectId, requestId);
    return { id: projectId, showcased };
  });
}
