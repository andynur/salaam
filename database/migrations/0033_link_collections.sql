-- Link collections: everyone can view the school and their own collections; link.manage
-- lets administrators and teachers curate school-wide links.
INSERT INTO permissions (key, description) VALUES
  ('links.view', 'View school and personal link collections'),
  ('links.manage', 'Manage school-wide link collections');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key = 'links.view' AND r.key IN ('admin', 'teacher', 'student');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key = 'links.manage' AND r.key IN ('admin', 'teacher');

CREATE TABLE link_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz
);
CREATE INDEX link_collections_owner_idx ON link_collections(owner_id, position, created_at) WHERE archived_at IS NULL;

CREATE TABLE link_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES link_collections(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 150),
  url text NOT NULL CHECK (length(url) BETWEEN 12 AND 2000 AND url ~ '^https?://'),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 10000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz
);
CREATE INDEX link_items_collection_idx ON link_items(collection_id, position, created_at) WHERE archived_at IS NULL;

INSERT INTO link_collections (title, description, position)
VALUES ('Tautan Sekolah', 'Akses cepat ke sistem dan sumber daya resmi sekolah.', 0);
