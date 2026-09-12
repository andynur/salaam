-- Roster adjustments reuse learning.manage and preserve attendance history.
ALTER TABLE classroom_roster ADD COLUMN removed_at timestamptz;
ALTER TABLE classroom_roster ADD COLUMN removed_by uuid REFERENCES users(id);
ALTER TABLE classroom_roster ADD CONSTRAINT classroom_roster_removal_pair_check
  CHECK ((removed_at IS NULL) = (removed_by IS NULL));
ALTER TABLE classroom_session_events DROP CONSTRAINT IF EXISTS classroom_session_events_action_check;
ALTER TABLE classroom_session_events ADD CONSTRAINT classroom_session_events_action_check
  CHECK (action IN ('open', 'close', 'reopen', 'cancel', 'note', 'roster'));
CREATE INDEX classroom_roster_active_student_idx ON classroom_roster(session_id, student_id) WHERE removed_at IS NULL;
