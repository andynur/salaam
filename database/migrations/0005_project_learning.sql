-- Challenges reuse the shared activities aggregate. Authoring, team formation, reviews,
-- and showcase selection use learning.manage; project work uses learning.participate.
-- No new capabilities are needed.
CREATE TABLE challenge_settings (
  activity_id uuid PRIMARY KEY,
  kind text NOT NULL DEFAULT 'challenge' CHECK (kind = 'challenge'),
  team_mode text NOT NULL CHECK (team_mode IN ('individual', 'team')),
  max_team_size integer NOT NULL,
  FOREIGN KEY (activity_id, kind) REFERENCES activities(id, kind),
  CHECK ((team_mode = 'individual' AND max_team_size = 1) OR (team_mode = 'team' AND max_team_size BETWEEN 2 AND 10))
);

-- One project per team (or per student for individual challenges). Review status moves
-- in_progress -> submitted -> changes_requested/approved; approval is final.
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES challenge_settings(activity_id),
  course_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 5000),
  deliverable_url text CHECK (deliverable_url IS NULL OR (length(deliverable_url) <= 2000 AND deliverable_url ~ '^https?://')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'changes_requested', 'approved')),
  first_submitted_at timestamptz,
  submitted_at timestamptz,
  showcased_at timestamptz,
  showcased_by uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (activity_id, course_id) REFERENCES activities(id, course_id),
  UNIQUE (id, activity_id),
  CHECK ((status = 'in_progress') = (submitted_at IS NULL)),
  CHECK ((submitted_at IS NULL) = (first_submitted_at IS NULL)),
  CHECK ((showcased_at IS NULL) = (showcased_by IS NULL)),
  CHECK (showcased_at IS NULL OR status = 'approved')
);
CREATE INDEX projects_activity_idx ON projects(activity_id);
CREATE INDEX projects_course_status_idx ON projects(course_id, status);
CREATE INDEX projects_showcase_idx ON projects(showcased_at DESC) WHERE showcased_at IS NOT NULL;

-- A student belongs to at most one project per challenge.
CREATE TABLE project_members (
  project_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (project_id, student_id),
  FOREIGN KEY (project_id, activity_id) REFERENCES projects(id, activity_id),
  UNIQUE (activity_id, student_id)
);
CREATE INDEX project_members_student_idx ON project_members(student_id);

-- Kanban cards. Moves renumber positions under the project row lock; `version` guards
-- each card against stale edits and moves.
CREATE TABLE project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 1000),
  assignee_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 1000000),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (project_id, assignee_id) REFERENCES project_members(project_id, student_id) ON DELETE SET NULL (assignee_id)
);
CREATE INDEX project_tasks_board_idx ON project_tasks(project_id, status, position) WHERE archived_at IS NULL;

-- Reviews append; the latest decision is mirrored on projects.status.
CREATE TABLE project_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  score numeric(5,2) CHECK (score BETWEEN 0 AND 100),
  feedback text NOT NULL CHECK (length(trim(feedback)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((decision = 'approved') = (score IS NOT NULL))
);
CREATE INDEX project_reviews_latest_idx ON project_reviews(project_id, created_at DESC, id DESC);

-- Portfolio entries belong to a member of an approved project and outlive enrollment.
CREATE TABLE portfolio_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  student_id uuid NOT NULL,
  reflection text NOT NULL CHECK (length(trim(reflection)) BETWEEN 1 AND 5000),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (project_id, student_id) REFERENCES project_members(project_id, student_id),
  UNIQUE (project_id, student_id)
);
CREATE INDEX portfolio_entries_student_idx ON portfolio_entries(student_id, updated_at DESC);
