-- Uses existing learning.manage and learning.participate capabilities.
-- Written answers are stored separately from option selections and graded manually.
ALTER TABLE questions DROP CONSTRAINT questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay'));
ALTER TABLE questions DROP CONSTRAINT questions_options_check;
ALTER TABLE questions ADD CONSTRAINT questions_options_check CHECK ((type IN ('short_answer', 'essay') AND jsonb_array_length(options) = 0) OR (type NOT IN ('short_answer', 'essay') AND jsonb_array_length(options) BETWEEN 2 AND 10));
ALTER TABLE questions DROP CONSTRAINT questions_correct_check;
ALTER TABLE questions ADD CONSTRAINT questions_correct_check CHECK ((type IN ('short_answer', 'essay') AND jsonb_array_length(correct) = 0) OR (type NOT IN ('short_answer', 'essay') AND jsonb_array_length(correct) BETWEEN 1 AND 10));
ALTER TABLE attempt_questions DROP CONSTRAINT attempt_questions_type_check;
ALTER TABLE attempt_questions ADD CONSTRAINT attempt_questions_type_check CHECK (type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay'));
ALTER TABLE attempt_answers ADD COLUMN answer_text text CHECK (length(answer_text) <= 20000);

CREATE TABLE attempt_question_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  grader_id uuid NOT NULL REFERENCES users(id),
  score numeric(8,2) NOT NULL CHECK (score >= 0),
  feedback text NOT NULL CHECK (length(trim(feedback)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (attempt_id, question_id) REFERENCES attempt_questions(attempt_id, question_id)
);
CREATE INDEX attempt_question_grades_latest_idx ON attempt_question_grades(attempt_id, question_id, created_at DESC, id DESC);
