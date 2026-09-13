-- Distinguishes scoped Asisten Mentor course access from teacher attendance capability.
INSERT INTO permissions (key, description) VALUES ('learning.assist', 'Read assigned learning workspaces and assist with attendance')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'asmen' AND p.key = 'learning.assist'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW calendar_audience AS
WITH capabilities AS (
  SELECT u.id, bool_or(p.key = 'dashboard:view') AS dashboard, bool_or(p.key = 'learning.view') AS learning,
    bool_or(p.key = 'learning.manage') AS manage, bool_or(p.key = 'learning.manage.all') AS manage_all,
    bool_or(p.key = 'learning.participate') AS participate, bool_or(p.key = 'learning.assist') AS assist
  FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions p ON p.id = rp.permission_id WHERE u.is_active GROUP BY u.id
)
SELECT u.id AS user_id, s.*, c.name AS course_name,
  COALESCE(u.manage AND (u.manage_all OR EXISTS (SELECT 1 FROM teaching_assignments t WHERE t.course_id = c.id AND t.teacher_id = u.id)), false) AS can_manage
FROM calendar_sources s LEFT JOIN courses c ON c.id = s.course_id CROSS JOIN capabilities u
WHERE u.dashboard AND (s.course_id IS NULL OR (u.learning AND (
  (u.manage AND (u.manage_all OR EXISTS (SELECT 1 FROM teaching_assignments t WHERE t.course_id = c.id AND t.teacher_id = u.id)))
  OR (u.assist AND EXISTS (SELECT 1 FROM teaching_assignments t WHERE t.course_id = c.id AND t.teacher_id = u.id))
  OR (u.participate AND c.published AND s.published AND EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.class_id AND cm.student_id = u.id)
    AND (s.kind <> 'session' OR EXISTS (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = u.id)))
)));
