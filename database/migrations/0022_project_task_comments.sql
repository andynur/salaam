-- Project work still uses learning.participate; comments are visible only inside a project.
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_id_project_unique UNIQUE (id, project_id);
CREATE TABLE project_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT project_task_comments_task_project_fk FOREIGN KEY (task_id, project_id)
    REFERENCES project_tasks(id, project_id) ON DELETE CASCADE
);
CREATE INDEX project_task_comments_task_idx ON project_task_comments(task_id, created_at, id);
