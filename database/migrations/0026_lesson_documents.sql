-- Lesson documents reuse learning.manage and learning.view; no new capability.
-- A lesson becomes an editable document: a longer Markdown body, an optional cover image,
-- a version for autosave conflict detection, and an opaque slug for public sharing.
ALTER TABLE lessons DROP CONSTRAINT lessons_content_check;
ALTER TABLE lessons ADD CONSTRAINT lessons_content_check CHECK (length(trim(content)) BETWEEN 1 AND 100000);
ALTER TABLE lessons
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483647),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN cover_file_id uuid,
  ADD COLUMN share_slug text CHECK (share_slug ~ '^[A-Za-z0-9_-]{22}$'),
  ADD COLUMN shared_at timestamptz,
  ADD COLUMN shared_by uuid REFERENCES users(id),
  ADD CONSTRAINT lessons_cover_file_fkey FOREIGN KEY (cover_file_id, course_id) REFERENCES stored_files(id, course_id),
  ADD CONSTRAINT lessons_share_state_check CHECK ((share_slug IS NULL) = (shared_at IS NULL) AND (share_slug IS NULL) = (shared_by IS NULL));
-- The public page looks a lesson up by slug alone; a cover file belongs to one lesson.
CREATE UNIQUE INDEX lessons_share_slug_idx ON lessons(share_slug) WHERE share_slug IS NOT NULL;
CREATE UNIQUE INDEX lessons_cover_file_idx ON lessons(cover_file_id) WHERE cover_file_id IS NOT NULL;
