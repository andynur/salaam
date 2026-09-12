-- Uses existing learning.manage and learning.participate capabilities.
-- Surveys and questionnaires reuse activities but store response data separately.
CREATE TABLE survey_settings (
  activity_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('survey', 'questionnaire')),
  FOREIGN KEY (activity_id, kind) REFERENCES activities(id, kind)
);
CREATE TABLE survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES survey_settings(activity_id),
  course_id uuid NOT NULL,
  prompt text NOT NULL CHECK (length(trim(prompt)) BETWEEN 1 AND 5000),
  type text NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'short_answer')),
  options jsonb NOT NULL CHECK ((type = 'short_answer' AND jsonb_array_length(options) = 0) OR (type <> 'short_answer' AND jsonb_array_length(options) BETWEEN 2 AND 10)),
  required boolean NOT NULL DEFAULT true,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 10000),
  UNIQUE (activity_id, position),
  UNIQUE (activity_id, id),
  FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id)
);
CREATE INDEX survey_questions_activity_idx ON survey_questions(activity_id, position, id);
CREATE TABLE survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  course_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES users(id),
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (activity_id, student_id),
  FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id)
);
CREATE INDEX survey_responses_activity_idx ON survey_responses(activity_id, submitted_at, id);
