-- Reuses dashboard:view, academic.manage and the scoped learning capabilities.
CREATE TABLE academic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  request_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_operation jsonb NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (created_by, request_key),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '93 days')
);
CREATE INDEX academic_events_range_idx ON academic_events(starts_at, id) WHERE archived_at IS NULL;
CREATE INDEX academic_events_course_idx ON academic_events(course_id);
CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  reminders boolean NOT NULL DEFAULT true,
  level_up boolean NOT NULL DEFAULT true,
  checkin boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('reminder', 'level_up', 'checkin')),
  source_kind text NOT NULL CHECK (source_kind IN ('event', 'deadline', 'assessment_open', 'assessment_close', 'session', 'level')),
  source_id uuid NOT NULL,
  source_at timestamptz,
  level integer CHECK (level BETWEEN 2 AND 12),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) <= 200),
  scheduled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'suppressed')),
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, dedupe_key),
  CHECK ((kind = 'level_up' AND source_kind = 'level' AND source_id = user_id AND level IS NOT NULL AND source_at IS NULL)
    OR (kind = 'checkin' AND source_kind = 'session' AND level IS NULL AND source_at IS NOT NULL)
    OR (kind = 'reminder' AND source_kind NOT IN ('level', 'assessment_open') AND level IS NULL AND source_at IS NOT NULL)),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
  CHECK (read_at IS NULL OR (status = 'delivered' AND read_at >= delivered_at))
);
CREATE UNIQUE INDEX notifications_source_idx ON notifications(user_id, kind, source_kind, source_id, source_at) WHERE source_at IS NOT NULL;
CREATE UNIQUE INDEX notifications_level_idx ON notifications(user_id, level) WHERE kind = 'level_up';
CREATE INDEX notifications_inbox_idx ON notifications(user_id, created_at DESC, id DESC);
CREATE INDEX notifications_pending_idx ON notifications(scheduled_at, id) WHERE status = 'pending';
-- The view holds no copied deadlines. Every read resolves publication and enrollment anew.
CREATE VIEW calendar_sources AS
SELECT 'event'::text AS kind, e.id, e.course_id, NULL::uuid AS lesson_id, e.title, e.description,
  e.starts_at, e.ends_at, true AS published, e.version
FROM academic_events e WHERE e.archived_at IS NULL
UNION ALL
SELECT 'deadline', a.id, a.course_id, a.lesson_id, a.title, ''::text, a.due_at, a.due_at,
  a.published AND l.published AND m.published, NULL::integer
FROM activities a JOIN lessons l ON l.id = a.lesson_id JOIN course_modules m ON m.id = l.module_id
WHERE a.due_at IS NOT NULL AND a.kind IN ('assignment', 'challenge') AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL
UNION ALL
SELECT v.kind, a.id, a.course_id, a.lesson_id, a.title, ''::text, v.at, v.at,
  a.published AND l.published AND m.published, NULL::integer
FROM activities a JOIN assessment_settings s ON s.activity_id = a.id JOIN lessons l ON l.id = a.lesson_id
JOIN course_modules m ON m.id = l.module_id
CROSS JOIN LATERAL (VALUES ('assessment_open', s.opens_at), ('assessment_close', s.closes_at)) v(kind, at)
WHERE v.at IS NOT NULL AND a.archived_at IS NULL AND l.archived_at IS NULL AND m.archived_at IS NULL
UNION ALL
SELECT 'session', s.id, s.course_id, NULL::uuid, s.title, ''::text, s.starts_at, s.ends_at, true, NULL::integer
FROM classroom_sessions s WHERE s.status <> 'cancelled';
CREATE VIEW calendar_audience AS
WITH capabilities AS (
  SELECT u.id, bool_or(p.key = 'dashboard:view') AS dashboard, bool_or(p.key = 'learning.view') AS learning,
    bool_or(p.key = 'learning.manage') AS manage, bool_or(p.key = 'learning.manage.all') AS manage_all,
    bool_or(p.key = 'learning.participate') AS participate
  FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions p ON p.id = rp.permission_id WHERE u.is_active GROUP BY u.id
)
SELECT u.id AS user_id, s.*, c.name AS course_name,
  COALESCE(u.manage AND (u.manage_all OR EXISTS (SELECT 1 FROM teaching_assignments t WHERE t.course_id = c.id AND t.teacher_id = u.id)), false) AS can_manage
FROM calendar_sources s LEFT JOIN courses c ON c.id = s.course_id CROSS JOIN capabilities u
WHERE u.dashboard AND (s.course_id IS NULL OR (u.learning AND (
  (u.manage AND (u.manage_all OR EXISTS (SELECT 1 FROM teaching_assignments t WHERE t.course_id = c.id AND t.teacher_id = u.id)))
  OR (u.participate AND c.published AND s.published AND EXISTS (SELECT 1 FROM class_members cm WHERE cm.class_id = c.class_id AND cm.student_id = u.id)
    AND (s.kind <> 'session' OR EXISTS (SELECT 1 FROM classroom_roster r WHERE r.session_id = s.id AND r.student_id = u.id)))
)));
