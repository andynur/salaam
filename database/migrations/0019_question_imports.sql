-- Import batches make a retried upload idempotent without storing the source file.
CREATE TABLE question_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  request_key uuid NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  question_ids jsonb NOT NULL CHECK (jsonb_typeof(question_ids) = 'array' AND jsonb_array_length(question_ids) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (course_id, request_key)
);
CREATE INDEX question_imports_created_idx ON question_imports(course_id, created_at DESC, id DESC);
