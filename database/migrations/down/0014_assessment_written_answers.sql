DROP TABLE IF EXISTS attempt_question_grades CASCADE;
ALTER TABLE attempt_answers DROP COLUMN IF EXISTS answer_text;
ALTER TABLE attempt_questions DROP CONSTRAINT IF EXISTS attempt_questions_type_check;
ALTER TABLE attempt_questions ADD CONSTRAINT attempt_questions_type_check CHECK (type IN ('single_choice', 'multiple_choice', 'true_false'));
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check CHECK (type IN ('single_choice', 'multiple_choice', 'true_false'));
