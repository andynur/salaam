import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { invalid } from "../../core/validation";
import { archivedInput } from "../learning/input";
import { notFound } from "../learning/access";
import { maxActiveTasks, type TaskStatus } from "../../shared/project";
import { moveInput, taskInput, versionInput } from "./input";
import { projectAccess, requireEditable } from "./service";

// Board cards are working notes, so card writes are not audited; project-level
// decisions (submission, review, showcase, membership) are.
type CardRow = { id: string; title: string; description: string; assigneeId: string | null; status: TaskStatus; position: number; version: number; archived: boolean };

const taskChanged = () => new HttpError(409, "TASK_CHANGED", "Kartu sudah diubah anggota lain. Muat ulang board lalu coba lagi.");
async function editable(tx: SQL, actor: Actor, projectId: string) {
  requireEditable(await projectAccess(tx, actor, projectId, true));
}
async function checkAssignee(tx: SQL, projectId: string, assigneeId: string | null) {
  if (assigneeId && !(await tx`SELECT 1 FROM project_members WHERE project_id = ${projectId} AND student_id = ${assigneeId}`).length) invalid("Penanggung jawab harus anggota tim.");
}
async function card(tx: SQL, projectId: string, taskId: string) {
  const row = (await tx<CardRow[]>`SELECT id, title, description, assignee_id AS "assigneeId", status, position, version, archived_at IS NOT NULL AS archived
    FROM project_tasks WHERE id = ${taskId} AND project_id = ${projectId} FOR UPDATE`)[0];
  if (!row) notFound();
  return row;
}
async function column(tx: SQL, projectId: string, status: TaskStatus, except: string | null) {
  return (await tx<{ id: string }[]>`SELECT id FROM project_tasks WHERE project_id = ${projectId} AND status = ${status} AND archived_at IS NULL
    AND (${except}::uuid IS NULL OR id <> ${except}::uuid) ORDER BY position, created_at, id`).map(row => row.id);
}
// Positions stay contiguous (0..n-1) per column; the project row lock serializes renumbering.
async function renumber(tx: SQL, projectId: string, ids: string[]) {
  if (!ids.length) return;
  await tx`UPDATE project_tasks t SET position = x.position
    FROM jsonb_to_recordset(${JSON.stringify(ids.map((id, position) => ({ id, position })))}::text::jsonb) AS x(id uuid, position integer)
    WHERE t.id = x.id AND t.project_id = ${projectId} AND t.position <> x.position`;
}
async function touch(tx: SQL, projectId: string) {
  await tx`UPDATE projects SET updated_at = clock_timestamp() WHERE id = ${projectId}`;
}
async function activeCount(tx: SQL, projectId: string) {
  const [row] = await tx<{ total: number }[]>`SELECT count(*)::int AS total FROM project_tasks WHERE project_id = ${projectId} AND archived_at IS NULL`;
  if (row!.total >= maxActiveTasks) throw new HttpError(409, "BOARD_FULL", `Board maksimal ${maxActiveTasks} kartu aktif. Arsipkan kartu yang sudah tidak dipakai.`);
}

export async function createTask(db: SQL, actor: Actor, projectId: string, body: Record<string, unknown>) {
  const input = taskInput(body);
  return db.begin(async tx => {
    await editable(tx, actor, projectId);
    await checkAssignee(tx, projectId, input.assigneeId);
    await activeCount(tx, projectId);
    const position = (await column(tx, projectId, input.status, null)).length;
    const row = (await tx<{ id: string; version: number }[]>`INSERT INTO project_tasks (project_id, title, description, status, position, assignee_id, created_by)
      VALUES (${projectId}, ${input.title}, ${input.description}, ${input.status}, ${position}, ${input.assigneeId}, ${actor.id}) RETURNING id, version`)[0]!;
    await touch(tx, projectId);
    return row;
  });
}

export async function updateTask(db: SQL, actor: Actor, projectId: string, taskId: string, body: Record<string, unknown>) {
  const input = taskInput(body);
  const version = versionInput(body);
  return db.begin(async tx => {
    await editable(tx, actor, projectId);
    await checkAssignee(tx, projectId, input.assigneeId);
    const current = await card(tx, projectId, taskId);
    if (current.archived) notFound();
    // A retry of an applied edit finds the requested content and returns it.
    if (current.title === input.title && current.description === input.description && current.assigneeId === input.assigneeId) return { id: taskId, version: current.version };
    if (current.version !== version) throw taskChanged();
    const row = (await tx<{ id: string; version: number }[]>`UPDATE project_tasks SET title = ${input.title}, description = ${input.description}, assignee_id = ${input.assigneeId},
      version = version + 1, updated_at = clock_timestamp() WHERE id = ${taskId} RETURNING id, version`)[0]!;
    await touch(tx, projectId);
    return row;
  });
}

export async function moveTask(db: SQL, actor: Actor, projectId: string, taskId: string, body: Record<string, unknown>) {
  const { status, position, version } = moveInput(body);
  return db.begin(async tx => {
    await editable(tx, actor, projectId);
    const current = await card(tx, projectId, taskId);
    if (current.archived) notFound();
    const target = await column(tx, projectId, status, taskId);
    const index = Math.min(position, target.length);
    if (current.status === status && current.position === index) return { id: taskId, version: current.version, status, position: index };
    if (current.version !== version) throw taskChanged();
    target.splice(index, 0, taskId);
    await tx`UPDATE project_tasks SET status = ${status}, version = version + 1, updated_at = clock_timestamp() WHERE id = ${taskId}`;
    await renumber(tx, projectId, target);
    if (current.status !== status) await renumber(tx, projectId, await column(tx, projectId, current.status, null));
    await touch(tx, projectId);
    return { id: taskId, version: current.version + 1, status, position: index };
  });
}

// Archived cards leave the board; restoring appends them to the end of their column.
export async function archiveTask(db: SQL, actor: Actor, projectId: string, taskId: string, body: Record<string, unknown>) {
  const archived = archivedInput(body);
  const version = versionInput(body);
  return db.begin(async tx => {
    await editable(tx, actor, projectId);
    const current = await card(tx, projectId, taskId);
    if (current.archived === archived) return { id: taskId, version: current.version, archived };
    if (current.version !== version) throw taskChanged();
    if (archived) {
      await tx`UPDATE project_tasks SET archived_at = clock_timestamp(), version = version + 1, updated_at = clock_timestamp() WHERE id = ${taskId}`;
      await renumber(tx, projectId, await column(tx, projectId, current.status, null));
    } else {
      await activeCount(tx, projectId);
      const position = (await column(tx, projectId, current.status, taskId)).length;
      await tx`UPDATE project_tasks SET archived_at = NULL, position = ${position}, version = version + 1, updated_at = clock_timestamp() WHERE id = ${taskId}`;
    }
    await touch(tx, projectId);
    return { id: taskId, version: current.version + 1, archived };
  });
}
