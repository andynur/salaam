-- Reverses 0009_reporting.sql.
DROP INDEX IF EXISTS audit_logs_event_idx;
DROP INDEX IF EXISTS audit_logs_actor_idx;
DROP INDEX IF EXISTS xp_entries_course_idx;
DROP INDEX IF EXISTS classroom_sessions_status_idx;
DROP INDEX IF EXISTS courses_term_idx;
DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'reports.view');
DELETE FROM permissions WHERE key = 'reports.view';
