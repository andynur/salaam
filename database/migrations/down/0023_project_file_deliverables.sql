ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_one_deliverable_check;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_deliverable_file_fk;
ALTER TABLE projects DROP COLUMN IF EXISTS deliverable_file_id;
