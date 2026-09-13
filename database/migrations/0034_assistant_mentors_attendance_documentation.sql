-- Adds scoped Asisten Mentor access for attendance assistance and session photo documentation.
INSERT INTO roles (key, name) VALUES ('asmen', 'Asisten Mentor');
INSERT INTO permissions (key, description) VALUES ('attendance.manage', 'Record attendance and attach session documentation for assigned courses');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'asmen' AND p.key IN ('learning.view', 'attendance.manage');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key IN ('admin', 'teacher') AND p.key = 'attendance.manage';

CREATE TABLE attendance_documentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  file_id uuid NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK (length(trim(caption)) <= 500),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (file_id) REFERENCES stored_files(id)
);
CREATE INDEX attendance_documentations_session_idx ON attendance_documentations(session_id, created_at DESC, id DESC);
