-- Uses existing admin.users.manage, academic.manage and learning.manage capabilities.
-- A series is a bounded template that materializes real classroom sessions.
CREATE TABLE classroom_meeting_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '24 hours'),
  interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 365),
  occurrence_count integer NOT NULL CHECK (occurrence_count BETWEEN 1 AND 52),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  qr_rotate_seconds integer NOT NULL DEFAULT 30 CHECK (qr_rotate_seconds BETWEEN 15 AND 300),
  qr_late_after_minutes integer CHECK (qr_late_after_minutes IS NULL OR qr_late_after_minutes BETWEEN 0 AND 1440),
  created_by uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  creation_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (created_by, request_key)
);
CREATE INDEX classroom_meeting_series_course_idx ON classroom_meeting_series(course_id, starts_at DESC, id);

ALTER TABLE classroom_sessions
  ADD COLUMN series_id uuid REFERENCES classroom_meeting_series(id),
  ADD COLUMN occurrence_index integer,
  ADD CONSTRAINT classroom_sessions_occurrence_check CHECK (occurrence_index IS NULL OR occurrence_index BETWEEN 1 AND 52),
  ADD CONSTRAINT classroom_sessions_series_occurrence_unique UNIQUE (series_id, occurrence_index);
CREATE INDEX classroom_sessions_series_idx ON classroom_sessions(series_id, occurrence_index);
