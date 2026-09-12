-- One current, auditable time accommodation per assessment and student.
-- The service validates that the activity is a timed quiz or exam and that the
-- student belongs to the course class before writing a row.
CREATE TABLE assessment_accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  course_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES users(id),
  extra_minutes integer NOT NULL CHECK (extra_minutes BETWEEN 1 AND 120),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  granted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id),
  UNIQUE (activity_id, student_id)
);
CREATE INDEX assessment_accommodations_student_idx ON assessment_accommodations(student_id);
