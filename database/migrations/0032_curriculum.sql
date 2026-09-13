-- Curriculum map: the weekly roadmap per grade and semester. No new capabilities: reading goes
-- through learning.view (all roles) and revising or importing goes through academic.manage.
-- The school's curriculum.csv is only the first import; these rows are the source of truth
-- afterwards, so a revision is an edit or a re-import, never a code change.
CREATE TABLE curriculum_grades (
  grade text PRIMARY KEY CHECK (grade IN ('X', 'XI', 'XII')),
  position integer NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 3),
  program text NOT NULL CHECK (length(trim(program)) BETWEEN 1 AND 100),
  goal text NOT NULL DEFAULT '' CHECK (length(goal) <= 1000),
  published boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE curriculum_semesters (
  grade text NOT NULL REFERENCES curriculum_grades(grade) ON DELETE CASCADE,
  semester integer NOT NULL CHECK (semester IN (1, 2)),
  theme text NOT NULL DEFAULT '' CHECK (length(theme) <= 150),
  PRIMARY KEY (grade, semester)
);

-- One row per week. Materi and asesmen are ordered lists of short items, stored as JSON arrays.
-- The unique key is the import's identity and also serves the (grade, semester, week) order.
CREATE TABLE curriculum_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade text NOT NULL,
  semester integer NOT NULL,
  week integer NOT NULL CHECK (week BETWEEN 1 AND 30),
  phase text NOT NULL CHECK (length(trim(phase)) BETWEEN 1 AND 100),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  objective text NOT NULL DEFAULT '' CHECK (length(objective) <= 500),
  content jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(content) = 'array'),
  practice text NOT NULL DEFAULT '' CHECK (length(practice) <= 300),
  assessment jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(assessment) = 'array'),
  source text NOT NULL DEFAULT '' CHECK (length(source) <= 300),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (grade, semester, week),
  FOREIGN KEY (grade, semester) REFERENCES curriculum_semesters(grade, semester)
);

-- Grades and their semester themes are product structure, like the clubs; the weeks are
-- school data and arrive through the import. Kelas XII stays unpublished ("Segera hadir").
INSERT INTO curriculum_grades (grade, position, program, goal, published) VALUES
  ('X', 1, 'Digital Creator Foundation', 'Santri mengenal ekosistem digital, merancang produk dan brand, lalu membangun program Python serta website portofolio pertama.', true),
  ('XI', 2, 'Fullstack JavaScript Developer', 'Santri membangun aplikasi web modern dengan React, REST API berbasis Bun, database relasional, dan portofolio fullstack.', true),
  ('XII', 3, 'Segera hadir', 'Kurikulum kelas XII sedang disusun dan akan tampil setelah ditetapkan sekolah.', false);
INSERT INTO curriculum_semesters (grade, semester, theme) VALUES
  ('X', 1, 'Digital Fluency & Product Design'), ('X', 2, 'Python, Web Foundation & Demo Day'),
  ('XI', 1, 'Modern Frontend Development'), ('XI', 2, 'Backend & Fullstack Development'),
  ('XII', 1, ''), ('XII', 2, '');
