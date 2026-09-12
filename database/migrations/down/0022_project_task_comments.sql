DROP TABLE IF EXISTS project_task_comments CASCADE;
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_id_project_unique;
