CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL
);
CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text NOT NULL
);
CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event text NOT NULL,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);
INSERT INTO roles (key, name) VALUES ('admin', 'Administrator'), ('teacher', 'Guru'), ('student', 'Santri');
INSERT INTO permissions (key, description) VALUES ('dashboard:view', 'Access the application dashboard');
INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions WHERE permissions.key = 'dashboard:view';
