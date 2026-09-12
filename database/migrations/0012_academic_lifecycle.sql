-- Uses existing admin.users.manage and academic.manage capabilities.
-- Academic records are archived instead of deleted; transfers keep an immutable trail.
ALTER TABLE academic_years ADD COLUMN archived_at timestamptz;
ALTER TABLE terms ADD COLUMN archived_at timestamptz;
ALTER TABLE classes ADD COLUMN archived_at timestamptz;

CREATE TABLE class_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  from_class_id uuid REFERENCES classes(id),
  to_class_id uuid NOT NULL REFERENCES classes(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  changed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (from_class_id IS NULL OR from_class_id <> to_class_id)
);
CREATE INDEX class_transfers_student_idx ON class_transfers(student_id, created_at DESC, id);
CREATE INDEX class_transfers_year_idx ON class_transfers(academic_year_id, created_at DESC, id);
