-- Reverses 0002_academic_foundation.sql.
DROP INDEX IF EXISTS audit_logs_resource_idx;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS resource_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS resource_type;
DROP TABLE IF EXISTS teaching_assignments CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS class_members CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS terms CASCADE;
DROP TABLE IF EXISTS academic_years CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE key IN ('admin.users.manage', 'academic.manage', 'audit.view')
);
DELETE FROM permissions WHERE key IN ('admin.users.manage', 'academic.manage', 'audit.view');
