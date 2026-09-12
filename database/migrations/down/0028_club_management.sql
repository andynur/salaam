-- Reverses 0028_club_management.sql.
DROP TABLE IF EXISTS club_courses CASCADE;
DROP TABLE IF EXISTS club_members CASCADE;
DROP TABLE IF EXISTS club_goals CASCADE;
DROP TABLE IF EXISTS clubs CASCADE;
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key IN ('club.view', 'club.manage'));
DELETE FROM permissions WHERE key IN ('club.view', 'club.manage');
