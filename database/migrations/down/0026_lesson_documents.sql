DROP INDEX IF EXISTS lessons_cover_file_idx;
DROP INDEX IF EXISTS lessons_share_slug_idx;
ALTER TABLE lessons
  DROP CONSTRAINT IF EXISTS lessons_share_state_check,
  DROP CONSTRAINT IF EXISTS lessons_cover_file_fkey,
  DROP COLUMN IF EXISTS shared_by,
  DROP COLUMN IF EXISTS shared_at,
  DROP COLUMN IF EXISTS share_slug,
  DROP COLUMN IF EXISTS cover_file_id,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS version;
-- The original limit was 20000 characters; longer documents lose their tail on rollback.
UPDATE lessons SET content = left(content, 20000) WHERE length(trim(content)) > 20000;
ALTER TABLE lessons DROP CONSTRAINT lessons_content_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_content_check CHECK (length(trim(content)) BETWEEN 1 AND 20000);
