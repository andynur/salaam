ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_labels_limit;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS labels;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS due_at;
