INSERT INTO permissions (key, description) VALUES
  ('admin.users.manage', 'Create and view users and role profiles'),
  ('academic.manage', 'Manage academic foundation records'),
  ('audit.view', 'View basic audit events');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND p.key IN ('admin.users.manage', 'academic.manage', 'audit.view');

CREATE TABLE user_profiles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  identifier text CHECK (length(trim(identifier)) BETWEEN 1 AND 50),
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id, role_id) REFERENCES user_roles(user_id, role_id) ON DELETE CASCADE,
  UNIQUE (role_id, identifier)
);
INSERT INTO user_profiles (user_id, role_id) SELECT user_id, role_id FROM user_roles;

CREATE TABLE academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 100),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, name),
  UNIQUE (id, academic_year_id)
);
CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, name),
  UNIQUE (id, academic_year_id)
);
CREATE TABLE class_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (class_id, academic_year_id) REFERENCES classes(id, academic_year_id),
  UNIQUE (academic_year_id, student_id)
);
CREATE INDEX class_members_class_idx ON class_members(class_id);
CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(trim(code)) BETWEEN 1 AND 30),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  academic_year_id uuid NOT NULL,
  term_id uuid NOT NULL,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL REFERENCES subjects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (term_id, academic_year_id) REFERENCES terms(id, academic_year_id),
  FOREIGN KEY (class_id, academic_year_id) REFERENCES classes(id, academic_year_id),
  UNIQUE (term_id, class_id, subject_id)
);
CREATE INDEX courses_class_idx ON courses(class_id);
CREATE INDEX courses_subject_idx ON courses(subject_id);
CREATE TABLE teaching_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  teacher_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, teacher_id)
);
CREATE INDEX teaching_assignments_teacher_idx ON teaching_assignments(teacher_id);
ALTER TABLE audit_logs ADD COLUMN resource_type text;
ALTER TABLE audit_logs ADD COLUMN resource_id uuid;
ALTER TABLE audit_logs ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object');
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id);
