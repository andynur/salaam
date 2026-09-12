-- Check-in imports reuse learning.manage and retain an idempotency record per session.
CREATE TABLE attendance_checkin_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES classroom_sessions(id),
  request_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  imported_count integer NOT NULL CHECK (imported_count BETWEEN 0 AND 500),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (session_id, request_key)
);
