-- Reuses learning.view and learning.manage for windows and codes; santri check-in uses
-- learning.participate. No new capabilities are needed.
-- A displayed code proves presence during a short window. It is never an authentication
-- credential: the santri must already hold a session, and only the SHA-256 hex digest of a
-- code is stored so a database copy cannot replay a live code.
CREATE TABLE attendance_checkin_windows (
  session_id uuid PRIMARY KEY REFERENCES classroom_sessions(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'stopped')),
  rotate_seconds integer NOT NULL CHECK (rotate_seconds BETWEEN 15 AND 300),
  late_after timestamptz,
  opened_by uuid NOT NULL REFERENCES users(id),
  last_operation jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE attendance_checkin_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES attendance_checkin_windows(session_id),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  issued_by uuid NOT NULL REFERENCES users(id),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > issued_at)
);
CREATE INDEX attendance_checkin_codes_session_idx ON attendance_checkin_codes(session_id, issued_at DESC, id);
-- One check-in per santri per session. The attendance chain stays append-only: a check-in
-- writes the first attendance_records row only, so later teacher corrections still win.
CREATE TABLE attendance_checkins (
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  code_id uuid NOT NULL REFERENCES attendance_checkin_codes(id),
  record_id uuid NOT NULL REFERENCES attendance_records(id),
  status text NOT NULL CHECK (status IN ('present', 'late')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id, student_id) REFERENCES classroom_roster(session_id, student_id),
  FOREIGN KEY (record_id, session_id, student_id) REFERENCES attendance_records(id, session_id, student_id)
);
