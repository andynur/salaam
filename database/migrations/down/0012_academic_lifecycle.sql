DROP TABLE IF EXISTS class_transfers CASCADE;
ALTER TABLE classes DROP COLUMN IF EXISTS archived_at;
ALTER TABLE terms DROP COLUMN IF EXISTS archived_at;
ALTER TABLE academic_years DROP COLUMN IF EXISTS archived_at;
