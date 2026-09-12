-- Club workspaces orchestrate rows that already exist: courses, activities, projects,
-- classroom sessions and XP. Adds club.view (every role) and club.manage (admin, teacher).
-- Linking a course to a club still goes through learning.manage and teaching_assignments,
-- so a club never widens what a mentor may reach.
INSERT INTO permissions (key, description) VALUES
  ('club.view', 'Open club workspaces the actor belongs to or mentors'),
  ('club.manage', 'Manage club profile, goals, membership and linked courses');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key = 'club.view' AND r.key IN ('admin', 'teacher', 'student');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key = 'club.manage' AND r.key IN ('admin', 'teacher');

CREATE TABLE clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  tagline text NOT NULL DEFAULT '' CHECK (length(tagline) <= 200),
  purpose text NOT NULL DEFAULT '' CHECK (length(purpose) <= 4000),
  direction text NOT NULL DEFAULT '' CHECK (length(direction) <= 4000),
  program text NOT NULL DEFAULT '' CHECK (length(program) <= 4000),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz
);
CREATE TABLE club_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 20),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  UNIQUE (club_id, position)
);
CREATE INDEX club_goals_order_idx ON club_goals(club_id, position);
-- Membership reuses users; a removed member keeps the row so history stays explainable.
CREATE TABLE club_members (
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('mentor', 'member')),
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_at timestamptz,
  PRIMARY KEY (club_id, user_id)
);
CREATE INDEX club_members_user_idx ON club_members(user_id) WHERE removed_at IS NULL;
CREATE INDEX club_members_club_role_idx ON club_members(club_id, role) WHERE removed_at IS NULL;
-- Linked courses are the club's learning surface; the courses themselves are untouched.
CREATE TABLE club_courses (
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id),
  linked_by uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (club_id, course_id)
);
CREATE INDEX club_courses_course_idx ON club_courses(course_id);

-- The first managed club. Mentors edit this copy from the workspace afterwards.
INSERT INTO clubs (slug, name, tagline, purpose, direction, program, published) VALUES (
  'coders-club', 'Coders Club',
  'Ruang belajar dan berkarya bidang pemrograman HSI Boarding School',
  'Coders Club adalah ruang belajar dan pengembangan santri di bidang pemrograman. Klub ini menyatukan materi, latihan, challenge, proyek nyata, dan review mentor dalam satu alur yang dapat diikuti santri dari nol sampai menghasilkan karya.',
  'Alur belajar klub: belajar materi, berlatih, menyelesaikan challenge, membangun proyek, review bersama mentor, menampilkan karya di showcase, lalu bertumbuh ke tingkat berikutnya.',
  'Program berjalan: pertemuan rutin mingguan, satu challenge per bulan, dan satu proyek tim per semester yang ditutup dengan showcase karya.',
  true
);
INSERT INTO club_goals (club_id, position, title, description)
SELECT c.id, g.position, g.title, g.description FROM clubs c CROSS JOIN (VALUES
  (1, 'Dasar pemrograman', 'Menguasai logika, sintaks, dan struktur data dasar melalui materi dan latihan terstruktur.'),
  (2, 'Pemecahan masalah', 'Melatih analisis dan penyelesaian masalah melalui challenge bertingkat.'),
  (3, 'Membangun proyek nyata', 'Mengerjakan proyek tim dari ide sampai rilis dengan papan kanban dan review mentor.'),
  (4, 'Belajar bersama', 'Saling mereview pekerjaan, berbagi catatan, dan mendampingi anggota baru.'),
  (5, 'Portfolio santri', 'Mengumpulkan karya terbaik menjadi portfolio yang dapat ditunjukkan.'),
  (6, 'Persiapan kompetisi IT', 'Menyiapkan anggota secara bertahap untuk mengikuti lomba bidang IT.')
) AS g(position, title, description) WHERE c.slug = 'coders-club';
