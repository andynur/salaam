-- Mentoring tracks and small mentoring groups inside a club. No new capabilities: reading
-- goes through club.view like the rest of the workspace, and every write goes through
-- club.manage, so a santri named as a group mentor stays read-only in the application.
-- Composite foreign keys keep a group's track and a group's members inside the same club.
CREATE TABLE club_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  tagline text NOT NULL DEFAULT '' CHECK (length(tagline) <= 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (club_id, slug),
  UNIQUE (id, club_id)
);
CREATE INDEX club_tracks_club_idx ON club_tracks(club_id, position) WHERE archived_at IS NULL;

-- A group is one mentor plus a handful of santri on one topic at one level. The mentor is a
-- club member: a teacher who mentors the club, or a senior santri guiding juniors.
CREATE TABLE club_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  track_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  topic text NOT NULL DEFAULT '' CHECK (length(topic) <= 200),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
  capacity integer NOT NULL DEFAULT 8 CHECK (capacity BETWEEN 2 AND 20),
  schedule text NOT NULL DEFAULT '' CHECK (length(schedule) <= 100),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  mentor_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,
  UNIQUE (id, club_id),
  FOREIGN KEY (track_id, club_id) REFERENCES club_tracks(id, club_id)
);
CREATE INDEX club_groups_club_idx ON club_groups(club_id, level, name) WHERE archived_at IS NULL;
CREATE INDEX club_groups_mentor_idx ON club_groups(mentor_id) WHERE archived_at IS NULL;

-- A removed member keeps its row so the history of a group stays explainable, the way
-- club_members already works.
CREATE TABLE club_group_members (
  group_id uuid NOT NULL REFERENCES club_groups(id) ON DELETE CASCADE,
  club_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  removed_at timestamptz,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id, club_id) REFERENCES club_groups(id, club_id)
);
CREATE INDEX club_group_members_group_idx ON club_group_members(group_id) WHERE removed_at IS NULL;
-- One active group per santri per club; mentoring another group is a separate relation.
CREATE UNIQUE INDEX club_group_members_one_active_idx ON club_group_members(club_id, user_id) WHERE removed_at IS NULL;

-- Coders Club runs two learning tracks. Track definitions are product structure, like the
-- clubs themselves, so they are seeded here; groups and membership stay demo or school data.
INSERT INTO club_tracks (club_id, slug, name, tagline, description, position)
SELECT c.id, t.slug, t.name, t.tagline, t.description, t.position FROM clubs c CROSS JOIN (VALUES
  ('olympiad', 'Olympiad Track', 'OSN Informatika dan competitive programming',
   'Jalur untuk santri yang menyukai logika, algoritma, dan pemecahan masalah. Materinya bertahap: dasar C++, algoritma dan struktur data, pembahasan soal tahun sebelumnya, lalu simulasi dan kontes internal sebagai persiapan OSN Informatika.', 1),
  ('product', 'Product Track', 'Web development dan proyek perangkat lunak',
   'Jalur untuk santri yang ingin menghasilkan produk digital yang dapat dipakai. Materinya bertahap: HTML, CSS, dan JavaScript, Git dan GitHub, API, backend, dan basis data, lalu proyek tim yang ditutup dengan demo day.', 2)
) AS t(slug, name, tagline, description, position) WHERE c.slug = 'coders-club';
