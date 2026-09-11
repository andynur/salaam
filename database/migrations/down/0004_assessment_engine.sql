-- Reverses 0004_assessment_engine.sql.
DROP TABLE IF EXISTS attempt_score_adjustments CASCADE;
DROP TABLE IF EXISTS attempt_answers CASCADE;
DROP TABLE IF EXISTS attempt_questions CASCADE;
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS assessment_questions CASCADE;
DROP TABLE IF EXISTS assessment_settings CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_id_kind_key;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_id_course_key;
