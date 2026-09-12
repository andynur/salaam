-- Reporting reads existing learning, attendance, assessment, project and gamification
-- rows; it stores nothing of its own. It adds one capability, reports.view, for the
-- cross-course operational views, and reuses audit.view for the filtered audit report.
-- Course scope still comes from teaching_assignments and learning.manage.all, so a
-- teacher's report never reaches a course they do not teach.
INSERT INTO permissions (key, description) VALUES
  ('reports.view', 'View cross-course operational reports and exports');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('admin', 'teacher') AND p.key = 'reports.view';

-- Indexes for the query paths the report service adds: filtering courses by year and
-- term, counting sessions by status, summing XP per course, and the audit report's
-- actor and event filters.
CREATE INDEX courses_term_idx ON courses(academic_year_id, term_id);
CREATE INDEX classroom_sessions_status_idx ON classroom_sessions(course_id, status);
CREATE INDEX xp_entries_course_idx ON xp_entries(course_id) WHERE course_id IS NOT NULL;
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id, created_at DESC);
CREATE INDEX audit_logs_event_idx ON audit_logs(event, created_at DESC);
