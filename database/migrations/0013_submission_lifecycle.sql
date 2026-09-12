-- Uses existing learning.manage and learning.participate capabilities.
-- Submission revisions and returns preserve the full review history.
ALTER TABLE submissions ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE submissions ADD COLUMN status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'returned'));
ALTER TABLE submission_grades ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE submission_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id),
  revision integer NOT NULL CHECK (revision > 0),
  returned_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX submission_returns_latest_idx ON submission_returns(submission_id, created_at DESC, id DESC);

CREATE TABLE submission_deadline_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id),
  student_id uuid NOT NULL REFERENCES users(id),
  due_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  granted_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (activity_id, student_id)
);
CREATE INDEX submission_deadline_exceptions_student_idx ON submission_deadline_exceptions(student_id, due_at DESC);
