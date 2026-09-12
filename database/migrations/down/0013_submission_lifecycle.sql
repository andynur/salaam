DROP TABLE IF EXISTS submission_deadline_exceptions CASCADE;
DROP TABLE IF EXISTS submission_returns CASCADE;
ALTER TABLE submission_grades DROP COLUMN IF EXISTS revision;
ALTER TABLE submissions DROP COLUMN IF EXISTS status;
ALTER TABLE submissions DROP COLUMN IF EXISTS revision;
