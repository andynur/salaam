DROP INDEX IF EXISTS classroom_roster_active_student_idx;
ALTER TABLE classroom_session_events DROP CONSTRAINT IF EXISTS classroom_session_events_action_check;
ALTER TABLE classroom_session_events ADD CONSTRAINT classroom_session_events_action_check
  CHECK (action IN ('open', 'close', 'reopen', 'cancel', 'note'));
ALTER TABLE classroom_roster DROP CONSTRAINT IF EXISTS classroom_roster_removal_pair_check;
ALTER TABLE classroom_roster DROP COLUMN IF EXISTS removed_by;
ALTER TABLE classroom_roster DROP COLUMN IF EXISTS removed_at;
