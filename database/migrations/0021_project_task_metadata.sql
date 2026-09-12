-- Project work still uses learning.participate; no new capability is needed.
ALTER TABLE project_tasks ADD COLUMN due_at timestamptz;
ALTER TABLE project_tasks ADD COLUMN labels text[] NOT NULL DEFAULT '{}';
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_labels_limit CHECK (cardinality(labels) <= 10);
