-- Uses the existing learning.manage and learning.participate capabilities.
-- Marking policy is snapshotted so later authoring changes never rewrite attempts.
ALTER TABLE assessment_settings ADD COLUMN scoring_mode text NOT NULL DEFAULT 'all_or_nothing'
  CHECK (scoring_mode IN ('all_or_nothing', 'partial_credit', 'negative_marking'));
ALTER TABLE attempt_questions ADD COLUMN scoring_mode text NOT NULL DEFAULT 'all_or_nothing'
  CHECK (scoring_mode IN ('all_or_nothing', 'partial_credit', 'negative_marking'));
