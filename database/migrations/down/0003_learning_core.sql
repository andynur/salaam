-- Reverses 0003_learning_core.sql.
DROP TABLE IF EXISTS lesson_completions CASCADE;
DROP TABLE IF EXISTS submission_grades CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS lesson_materials CASCADE;
DROP TABLE IF EXISTS stored_files CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS course_modules CASCADE;
ALTER TABLE courses DROP COLUMN IF EXISTS published;
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE key IN ('learning.view', 'learning.manage', 'learning.manage.all', 'learning.participate')
);
DELETE FROM permissions WHERE key IN ('learning.view', 'learning.manage', 'learning.manage.all', 'learning.participate');
