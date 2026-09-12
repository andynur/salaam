-- Academic calendar uses academic.manage for administration and dashboard:view for reading.
CREATE TABLE academic_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  class_id uuid,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  category text NOT NULL DEFAULT 'academic' CHECK (category IN ('academic', 'holiday', 'assessment', 'student', 'learning')),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  FOREIGN KEY (class_id, academic_year_id) REFERENCES classes(id, academic_year_id)
);
CREATE INDEX academic_calendar_events_year_dates_idx ON academic_calendar_events(academic_year_id, starts_on, ends_on);
CREATE INDEX academic_calendar_events_class_idx ON academic_calendar_events(class_id, starts_on) WHERE class_id IS NOT NULL;
