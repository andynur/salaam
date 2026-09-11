-- Quizzes and exams reuse the shared activities aggregate. Authoring and grading use
-- learning.manage; attempts use learning.participate. No new capabilities are needed.
ALTER TABLE activities ADD CONSTRAINT activities_id_course_key UNIQUE (id, course_id);
ALTER TABLE activities ADD CONSTRAINT activities_id_kind_key UNIQUE (id, kind);

-- Course question bank. Options carry stable IDs; `correct` lists the correct option IDs.
-- Attempts snapshot questions, so later edits never change started or submitted attempts.
CREATE TABLE questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  type text NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'true_false')),
  prompt text NOT NULL CHECK (length(trim(prompt)) BETWEEN 1 AND 5000),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 10),
  correct jsonb NOT NULL CHECK (jsonb_typeof(correct) = 'array' AND jsonb_array_length(correct) BETWEEN 1 AND 10),
  explanation text NOT NULL DEFAULT '' CHECK (length(explanation) <= 2000),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, course_id)
);
CREATE INDEX questions_course_idx ON questions(course_id, created_at, id);

-- Exams are single-attempt, timed, and closed by a server-side window.
CREATE TABLE assessment_settings (
  activity_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('quiz', 'exam')),
  opens_at timestamptz,
  closes_at timestamptz,
  time_limit_minutes integer CHECK (time_limit_minutes BETWEEN 1 AND 600),
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 10),
  shuffle_questions boolean NOT NULL DEFAULT true,
  shuffle_options boolean NOT NULL DEFAULT true,
  results_visibility text NOT NULL DEFAULT 'after_submit' CHECK (results_visibility IN ('after_submit', 'after_close', 'score_only', 'hidden')),
  FOREIGN KEY (activity_id, kind) REFERENCES activities(id, kind),
  CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at),
  CHECK (kind <> 'exam' OR (max_attempts = 1 AND time_limit_minutes IS NOT NULL AND closes_at IS NOT NULL))
);

CREATE TABLE assessment_questions (
  activity_id uuid NOT NULL,
  course_id uuid NOT NULL,
  question_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 10000),
  points numeric(6,2) NOT NULL CHECK (points > 0 AND points <= 1000),
  PRIMARY KEY (activity_id, question_id),
  FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id),
  FOREIGN KEY (question_id, course_id) REFERENCES questions(id, course_id)
);
CREATE INDEX assessment_questions_question_idx ON assessment_questions(question_id);

-- Server time is authoritative: deadline_at is fixed when the attempt starts.
CREATE TABLE attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id),
  student_id uuid NOT NULL REFERENCES users(id),
  number integer NOT NULL CHECK (number BETWEEN 1 AND 10),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz,
  submitted_at timestamptz,
  submission_reason text CHECK (submission_reason IN ('student', 'expired')),
  score numeric(8,2) CHECK (score >= 0),
  max_score numeric(8,2) NOT NULL CHECK (max_score > 0),
  UNIQUE (activity_id, student_id, number),
  CHECK ((submitted_at IS NULL) = (submission_reason IS NULL)),
  CHECK ((submitted_at IS NULL) = (score IS NULL)),
  CHECK (score IS NULL OR score <= max_score),
  CHECK (deadline_at IS NULL OR deadline_at > started_at)
);
CREATE UNIQUE INDEX attempts_one_open_idx ON attempts(activity_id, student_id) WHERE submitted_at IS NULL;
CREATE INDEX attempts_student_idx ON attempts(student_id);

CREATE TABLE attempt_questions (
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  question_id uuid NOT NULL REFERENCES questions(id),
  position integer NOT NULL CHECK (position >= 0),
  type text NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'true_false')),
  prompt text NOT NULL,
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  correct jsonb NOT NULL CHECK (jsonb_typeof(correct) = 'array'),
  explanation text NOT NULL,
  points numeric(6,2) NOT NULL CHECK (points > 0),
  PRIMARY KEY (attempt_id, question_id),
  UNIQUE (attempt_id, position)
);

-- `revision` is a client-side counter per question; autosaves only move forward, so
-- delayed retries after a reconnect cannot overwrite a newer answer.
CREATE TABLE attempt_answers (
  attempt_id uuid NOT NULL,
  question_id uuid NOT NULL,
  selected jsonb NOT NULL CHECK (jsonb_typeof(selected) = 'array' AND jsonb_array_length(selected) <= 10),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 1000000),
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  awarded numeric(6,2) CHECK (awarded >= 0),
  PRIMARY KEY (attempt_id, question_id),
  FOREIGN KEY (attempt_id, question_id) REFERENCES attempt_questions(attempt_id, question_id)
);

-- Corrections append; the latest adjustment replaces the automatic score.
CREATE TABLE attempt_score_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES attempts(id),
  grader_id uuid NOT NULL REFERENCES users(id),
  score numeric(8,2) NOT NULL CHECK (score >= 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX attempt_score_adjustments_latest_idx ON attempt_score_adjustments(attempt_id, created_at DESC, id DESC);
