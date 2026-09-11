import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { idField } from "../../core/validation";
import { recordAudit } from "../../core/audit/repository";
import { courseAccess, lessonAccess, notFound } from "../learning/access";
import { challengeInput } from "./input";
import type { Challenge, TeamMode } from "../../shared/project";

// Team settings lock once a project exists; the whole definition locks once any project
// has been submitted, so every team is reviewed against the same instructions and deadline.
export async function saveChallenge(db: SQL, actor: Actor, courseId: string, body: Record<string, unknown>, requestId: string, id?: string) {
  const input = challengeInput(body);
  return db.begin(async tx => {
    await courseAccess(tx, actor, courseId, "manage", true);
    let activityId: string;
    if (id) {
      const current = (await tx<{ teamMode: TeamMode; maxTeamSize: number; projects: boolean; submitted: boolean }[]>`SELECT s.team_mode AS "teamMode", s.max_team_size AS "maxTeamSize",
          EXISTS (SELECT 1 FROM projects p WHERE p.activity_id = a.id) AS projects,
          EXISTS (SELECT 1 FROM projects p WHERE p.activity_id = a.id AND p.first_submitted_at IS NOT NULL) AS submitted
        FROM activities a JOIN challenge_settings s ON s.activity_id = a.id
        WHERE a.id = ${id} AND a.course_id = ${courseId} AND a.archived_at IS NULL`)[0];
      if (!current) notFound();
      if (current.submitted) throw new HttpError(409, "CHALLENGE_LOCKED", "Proyek sudah dikirim untuk review. Challenge tidak dapat diubah.");
      if (current.projects && (current.teamMode !== input.teamMode || current.maxTeamSize !== input.maxTeamSize)) {
        throw new HttpError(409, "TEAM_LOCKED", "Tim sudah dibentuk. Mode dan ukuran tim tidak dapat diubah.");
      }
      await tx`UPDATE activities SET title = ${input.title}, instructions = ${input.instructions}, due_at = ${input.dueAt} WHERE id = ${id}`;
      await tx`UPDATE challenge_settings SET team_mode = ${input.teamMode}, max_team_size = ${input.maxTeamSize} WHERE activity_id = ${id}`;
      activityId = id;
    } else {
      const lessonId = idField(body, "lessonId");
      await lessonAccess(tx, courseId, lessonId, true);
      activityId = (await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at)
        VALUES (${courseId}, ${lessonId}, 'challenge', ${input.title}, ${input.instructions}, ${input.dueAt}) RETURNING id`)[0]!.id;
      await tx`INSERT INTO challenge_settings (activity_id, team_mode, max_team_size) VALUES (${activityId}, ${input.teamMode}, ${input.maxTeamSize})`;
    }
    await recordAudit(tx, actor.id, `challenge.${id ? "updated" : "created"}`, "activities", activityId, requestId);
    return { id: activityId };
  });
}

// Managers see drafts, archived challenges, and project counts; students see visible
// challenges with their own project only.
export async function listChallenges(db: SQL, actor: Actor, courseId: string, manager: boolean) {
  return db<Challenge[]>`SELECT a.id, a.lesson_id AS "lessonId", a.kind, a.title, a.instructions, a.due_at::text AS "dueAt", a.published, a.archived_at IS NOT NULL AS archived,
      json_build_object('teamMode', s.team_mode, 'maxTeamSize', s.max_team_size) AS settings,
      CASE WHEN ${manager} THEN (SELECT count(*)::int FROM projects p WHERE p.activity_id = a.id) ELSE 0 END AS "projectCount",
      EXISTS (SELECT 1 FROM projects p WHERE p.activity_id = a.id) AS "teamLocked",
      EXISTS (SELECT 1 FROM projects p WHERE p.activity_id = a.id AND p.first_submitted_at IS NOT NULL) AS locked,
      (SELECT json_build_object('id', p.id, 'title', p.title, 'status', p.status) FROM projects p JOIN project_members pm ON pm.project_id = p.id
        WHERE p.activity_id = a.id AND pm.student_id = ${actor.id}) AS project
    FROM activities a JOIN challenge_settings s ON s.activity_id = a.id
    JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
    WHERE a.course_id = ${courseId}
      AND (${manager} OR (a.published AND l.published AND m.published AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL))
    ORDER BY a.created_at, a.id`;
}
