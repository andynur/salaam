-- Uses existing learning.manage capability. Rubrics belong to an assessment question.
CREATE TABLE assessment_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  question_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) BETWEEN 1 AND 10),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (activity_id, question_id),
  FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id),
  FOREIGN KEY (activity_id, question_id) REFERENCES assessment_questions(activity_id, question_id)
);
CREATE INDEX assessment_rubrics_course_idx ON assessment_rubrics(course_id, activity_id);
ALTER TABLE attempt_question_grades ADD COLUMN breakdown jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(breakdown) = 'array');
