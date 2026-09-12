ALTER TABLE classroom_sessions
  DROP CONSTRAINT IF EXISTS classroom_sessions_series_occurrence_unique,
  DROP CONSTRAINT IF EXISTS classroom_sessions_occurrence_check,
  DROP COLUMN IF EXISTS occurrence_index,
  DROP COLUMN IF EXISTS series_id;
DROP TABLE IF EXISTS classroom_meeting_series CASCADE;
