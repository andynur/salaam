DROP TABLE IF EXISTS attendance_documentations CASCADE;
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'attendance.manage');
DELETE FROM permissions WHERE key = 'attendance.manage';
DELETE FROM roles WHERE key = 'asmen';
