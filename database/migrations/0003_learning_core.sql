INSERT INTO permissions (key, description) VALUES
  ('learning.view', 'View enrolled or assigned courses'),
  ('learning.manage', 'Author and grade assigned courses'),
  ('learning.manage.all', 'Author and grade all courses'),
  ('learning.participate', 'Complete lessons and submit enrolled activities');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE
  (r.key IN ('admin', 'teacher', 'student') AND p.key = 'learning.view') OR
  (r.key IN ('admin', 'teacher') AND p.key = 'learning.manage') OR
  (r.key = 'admin' AND p.key = 'learning.manage.all') OR
  (r.key = 'student' AND p.key = 'learning.participate');

-- Students only see published, unarchived content. Archiving hides content without
-- deleting the completions, submissions, and grades that reference it.
ALTER TABLE courses ADD COLUMN published boolean NOT NULL DEFAULT false;
CREATE TABLE course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 10000),
  published boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, course_id)
);
CREATE INDEX course_modules_order_idx ON course_modules(course_id, position, created_at, id);
CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  module_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 20000),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 10000),
  published boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (module_id, course_id) REFERENCES course_modules(id, course_id),
  UNIQUE (id, course_id)
);
CREATE INDEX lessons_order_idx ON lessons(module_id, position, created_at, id);
CREATE INDEX lessons_course_idx ON lessons(course_id);

-- File bytes live under STORAGE_ROOT at a path derived from the generated ID. The
-- original name is display metadata only and never becomes part of a path.
CREATE TABLE stored_files (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  original_name text NOT NULL CHECK (length(original_name) BETWEEN 1 AND 180 AND original_name !~ '[/\\[:cntrl:]]'),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, course_id)
);
CREATE INDEX stored_files_course_idx ON stored_files(course_id);
CREATE TABLE lesson_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  lesson_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  kind text NOT NULL CHECK (kind IN ('text', 'link', 'file')),
  content text NOT NULL CHECK (length(content) <= 20000),
  file_id uuid UNIQUE,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (lesson_id, course_id) REFERENCES lessons(id, course_id),
  FOREIGN KEY (file_id, course_id) REFERENCES stored_files(id, course_id),
  CHECK ((kind = 'file') = (file_id IS NOT NULL)),
  CHECK (kind = 'file' OR length(trim(content)) >= 1),
  CHECK (kind <> 'link' OR (length(content) <= 2000 AND content ~ '^https?://'))
);
CREATE INDEX lesson_materials_lesson_idx ON lesson_materials(lesson_id, created_at, id);

-- All activity kinds share this aggregate; assessment behavior arrives in Phase 3.
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  lesson_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('assignment', 'quiz', 'exam', 'survey', 'questionnaire', 'challenge')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  instructions text NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 20000),
  due_at timestamptz,
  published boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (lesson_id, course_id) REFERENCES lessons(id, course_id)
);
CREATE INDEX activities_lesson_idx ON activities(lesson_id, created_at, id);
CREATE INDEX activities_course_idx ON activities(course_id);
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id),
  student_id uuid NOT NULL REFERENCES users(id),
  content text NOT NULL CHECK (length(content) <= 20000),
  file_id uuid UNIQUE REFERENCES stored_files(id),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (activity_id, student_id),
  CHECK (length(trim(content)) >= 1 OR file_id IS NOT NULL)
);
CREATE INDEX submissions_student_idx ON submissions(student_id);
-- Corrections append a new grade so previous decisions remain inspectable.
CREATE TABLE submission_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id),
  grader_id uuid NOT NULL REFERENCES users(id),
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  feedback text NOT NULL CHECK (length(trim(feedback)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX submission_grades_latest_idx ON submission_grades(submission_id, created_at DESC, id DESC);
CREATE TABLE lesson_completions (
  lesson_id uuid NOT NULL REFERENCES lessons(id),
  student_id uuid NOT NULL REFERENCES users(id),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (lesson_id, student_id)
);
CREATE INDEX lesson_completions_student_idx ON lesson_completions(student_id);
