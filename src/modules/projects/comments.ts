import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { commentInput } from "./input";
import { projectAccess, requireEditable } from "./service";
import { notFound } from "../learning/access";
import type { ProjectTaskComment } from "../../shared/project";

export async function listTaskComments(db: SQL, actor: Actor, projectId: string, taskId: string) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await projectAccess(tx, actor, projectId);
    const task = await tx`SELECT 1 FROM project_tasks WHERE id = ${taskId} AND project_id = ${projectId}`;
    if (!task.length) notFound();
    return tx<ProjectTaskComment[]>`SELECT c.id, c.task_id AS "taskId", c.body, u.id AS "authorId", u.display_name AS "authorName", c.created_at::text AS "createdAt"
      FROM project_task_comments c JOIN users u ON u.id = c.author_id
      WHERE c.project_id = ${projectId} AND c.task_id = ${taskId}
      ORDER BY c.created_at, c.id LIMIT 100`;
  });
}

export async function createTaskComment(db: SQL, actor: Actor, projectId: string, taskId: string, body: Record<string, unknown>) {
  const comment = commentInput(body);
  return db.begin(async tx => {
    requireEditable(await projectAccess(tx, actor, projectId, true));
    const task = await tx`SELECT 1 FROM project_tasks WHERE id = ${taskId} AND project_id = ${projectId}`;
    if (!task.length) notFound();
    const row = (await tx<ProjectTaskComment[]>`INSERT INTO project_task_comments (project_id, task_id, author_id, body)
      VALUES (${projectId}, ${taskId}, ${actor.id}, ${comment})
      RETURNING id, task_id AS "taskId", body, author_id AS "authorId", created_at::text AS "createdAt"`)[0]!;
    await tx`UPDATE projects SET updated_at = clock_timestamp() WHERE id = ${projectId}`;
    return { ...row, authorName: actor.displayName };
  });
}
