-- Gamification: an auditable XP ledger, derived levels, and badges. Reading growth data
-- uses learning.view (own) and learning.manage (a taught class); configuring reward rules
-- and the badge catalogue uses academic.manage. No new capabilities are needed.
--
-- Levels are not stored: they are a pure function of the XP total in
-- src/shared/gamification.ts, so a threshold change never needs a backfill.

-- One row per rewarded event kind. The key set is closed: awarding code references these
-- keys, so a new kind arrives with the migration that teaches the server to award it.
CREATE TABLE reward_rules (
  key text PRIMARY KEY CHECK (key IN ('lesson.completed', 'assignment.graded', 'assessment.completed', 'project.approved')),
  -- Audit rows reference resources by uuid, so the rule carries one beside its stable key.
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  points integer NOT NULL CHECK (points BETWEEN 0 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO reward_rules (key, description, points) VALUES
  ('lesson.completed', 'Menyelesaikan satu pelajaran', 10),
  ('assignment.graded', 'Tugas dinilai guru', 25),
  ('assessment.completed', 'Menyelesaikan kuis atau ujian', 30),
  ('project.approved', 'Proyek disetujui guru', 75);

-- The XP ledger is append-only and is the source of truth for every total. One award per
-- student and source: a regrade, a repeated attempt, or a retried request adds nothing.
CREATE TABLE xp_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id),
  rule_key text NOT NULL REFERENCES reward_rules(key),
  source_type text NOT NULL CHECK (source_type IN ('lessons', 'submissions', 'activities', 'projects')),
  source_id uuid NOT NULL,
  course_id uuid REFERENCES courses(id),
  points integer NOT NULL CHECK (points BETWEEN 0 AND 1000),
  awarded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (student_id, source_type, source_id)
);
CREATE INDEX xp_entries_student_idx ON xp_entries(student_id, awarded_at DESC, id DESC);
CREATE INDEX xp_entries_rule_idx ON xp_entries(student_id, rule_key);

-- Badge catalogue. A badge is earned when a counted criterion reaches its threshold;
-- `icon` names an icon in src/web/components/icons.tsx.
CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  icon text NOT NULL CHECK (icon IN ('star', 'academic', 'book', 'board', 'assignment', 'quiz', 'layers', 'briefcase')),
  criterion text NOT NULL CHECK (criterion IN ('xp_total', 'lessons_completed', 'assignments_graded', 'assessments_completed', 'projects_approved')),
  threshold integer NOT NULL CHECK (threshold BETWEEN 1 AND 100000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX badges_active_idx ON badges(active, criterion, threshold);
INSERT INTO badges (key, name, description, icon, criterion, threshold) VALUES
  ('langkah-pertama', 'Langkah Pertama', 'Menyelesaikan pelajaran pertama.', 'book', 'lessons_completed', 1),
  ('pembelajar-tekun', 'Pembelajar Tekun', 'Menyelesaikan 10 pelajaran.', 'book', 'lessons_completed', 10),
  ('penjelajah-ilmu', 'Penjelajah Ilmu', 'Menyelesaikan 25 pelajaran.', 'academic', 'lessons_completed', 25),
  ('tugas-perdana', 'Tugas Perdana', 'Tugas pertama selesai dinilai.', 'assignment', 'assignments_graded', 1),
  ('rajin-mengumpulkan', 'Rajin Mengumpulkan', 'Sepuluh tugas selesai dinilai.', 'assignment', 'assignments_graded', 10),
  ('siap-uji', 'Siap Uji', 'Menyelesaikan kuis atau ujian pertama.', 'quiz', 'assessments_completed', 1),
  ('pembangun', 'Pembangun', 'Proyek pertama disetujui guru.', 'board', 'projects_approved', 1),
  ('juara-proyek', 'Juara Proyek', 'Tiga proyek disetujui guru.', 'briefcase', 'projects_approved', 3),
  ('bintang-500', 'Bintang 500', 'Mengumpulkan 500 XP.', 'star', 'xp_total', 500),
  ('bintang-1500', 'Bintang 1500', 'Mengumpulkan 1500 XP.', 'star', 'xp_total', 1500),
  ('legenda-3000', 'Legenda 3000', 'Mengumpulkan 3000 XP.', 'layers', 'xp_total', 3000);

-- Earned badges are append-only and idempotent; re-evaluating a student awards nothing new.
CREATE TABLE badge_awards (
  badge_id uuid NOT NULL REFERENCES badges(id),
  student_id uuid NOT NULL REFERENCES users(id),
  awarded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (badge_id, student_id)
);
CREATE INDEX badge_awards_student_idx ON badge_awards(student_id, awarded_at DESC);
