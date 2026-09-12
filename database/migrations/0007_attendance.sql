-- Reuses learning.view, learning.manage and learning.manage.all.
CREATE TABLE classroom_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours'),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'open', 'closed', 'cancelled')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  created_by uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  creation_payload jsonb NOT NULL,
  last_operation jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (created_by, request_key)
);
CREATE INDEX classroom_sessions_course_idx ON classroom_sessions(course_id, starts_at DESC, id);
CREATE TABLE classroom_roster (
  session_id uuid NOT NULL REFERENCES classroom_sessions(id),
  student_id uuid NOT NULL REFERENCES users(id),
  student_name text NOT NULL,
  identifier text,
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX classroom_roster_student_idx ON classroom_roster(student_id, session_id);
CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'late', 'excused', 'sick', 'absent')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  recorded_by uuid NOT NULL REFERENCES users(id),
  previous_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (session_id, student_id) REFERENCES classroom_roster(session_id, student_id),
  UNIQUE (id, session_id, student_id),
  FOREIGN KEY (previous_id, session_id, student_id) REFERENCES attendance_records(id, session_id, student_id),
  UNIQUE (previous_id)
);
CREATE UNIQUE INDEX attendance_records_first_idx ON attendance_records(session_id, student_id) WHERE previous_id IS NULL;
CREATE INDEX attendance_records_latest_idx ON attendance_records(session_id, student_id, created_at DESC, id DESC);
-- Preserve session lifecycle/note history and correction reasons independently of audit metadata.
CREATE TABLE classroom_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES classroom_sessions(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('open', 'close', 'reopen', 'cancel', 'note')),
  reason text NOT NULL CHECK (length(reason) <= 500),
  note text NOT NULL CHECK (length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (session_id, version)
);
