-- Course certificates reuse learning.view/manage/participate; no new capability.
-- Issuance stores an immutable public verification snapshot behind an opaque slug.
CREATE TABLE course_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  student_id uuid NOT NULL REFERENCES users(id),
  issued_by uuid NOT NULL REFERENCES users(id),
  public_slug text NOT NULL UNIQUE CHECK (public_slug ~ '^[A-Za-z0-9_-]{22}$'),
  student_name text NOT NULL CHECK (length(trim(student_name)) BETWEEN 1 AND 150),
  course_name text NOT NULL CHECK (length(trim(course_name)) BETWEEN 1 AND 150),
  class_name text NOT NULL CHECK (length(trim(class_name)) BETWEEN 1 AND 100),
  term_name text NOT NULL CHECK (length(trim(term_name)) BETWEEN 1 AND 100),
  academic_year text NOT NULL CHECK (length(trim(academic_year)) BETWEEN 1 AND 100),
  teacher_names jsonb NOT NULL CHECK (jsonb_typeof(teacher_names) = 'array' AND jsonb_array_length(teacher_names) <= 20),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (course_id, student_id)
);
CREATE INDEX course_certificates_student_idx ON course_certificates(student_id, issued_at DESC);
