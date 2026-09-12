ALTER TABLE assessment_settings ADD COLUMN selection_count integer CHECK (selection_count IS NULL OR selection_count BETWEEN 1 AND 100);
