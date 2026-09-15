-- Editable annual calendar reuses academic.manage; no new capability.
ALTER TABLE academic_calendar_events
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN request_key uuid,
  ADD COLUMN last_operation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT academic_calendar_events_version_check CHECK (version BETWEEN 1 AND 2147483647),
  ADD CONSTRAINT academic_calendar_events_operation_check CHECK (jsonb_typeof(last_operation) = 'object');

CREATE UNIQUE INDEX academic_calendar_events_request_key_idx
  ON academic_calendar_events(created_by, request_key) WHERE request_key IS NOT NULL;

-- Reconcile the original demo rows with the approved 2026/2027 calendar reference.
UPDATE academic_calendar_events e SET title = 'Libur Semester/ Tahun Ajaran Baru',
  last_operation = '{"migration":"0038","previous":"initial-holiday"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Libur semester / Tahun ajaran baru' AND e.starts_on = DATE '2026-07-29' AND e.ends_on = DATE '2026-08-11';
UPDATE academic_calendar_events e SET title = 'Serah Terima Santri', starts_on = DATE '2026-07-12', ends_on = DATE '2026-07-12',
  last_operation = '{"migration":"0038","previous":"student-handover"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Serah terima santri' AND e.starts_on = DATE '2026-08-12' AND e.ends_on = DATE '2026-08-12';
UPDATE academic_calendar_events e SET starts_on = DATE '2026-07-13', ends_on = DATE '2026-07-19',
  last_operation = '{"migration":"0038","previous":"mpls"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'MPLS' AND e.starts_on = DATE '2026-08-13' AND e.ends_on = DATE '2026-08-19';
UPDATE academic_calendar_events e SET title = 'Nusantara Spirit Day.',
  last_operation = '{"migration":"0038","previous":"nusantara"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Nusantara Spirit Day' AND e.starts_on = DATE '2026-08-16';
UPDATE academic_calendar_events e SET title = 'Life to learn',
  last_operation = '{"migration":"0038","previous":"life-to-learn"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Life to learn' AND e.starts_on = DATE '2026-11-15';
UPDATE academic_calendar_events e SET title = 'Liburan Semester',
  last_operation = '{"migration":"0038","previous":"semester-holiday"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Liburan semester' AND e.starts_on = DATE '2026-12-27';
UPDATE academic_calendar_events e SET title = 'Kedatangan Santri',
  last_operation = '{"migration":"0038","previous":"student-arrival"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Kedatangan santri' AND e.starts_on IN (DATE '2027-01-10', DATE '2027-03-20');
UPDATE academic_calendar_events e SET title = 'Presentasi Tugas Liburan',
  last_operation = '{"migration":"0038","previous":"holiday-presentation"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Presentasi tugas liburan' AND e.starts_on = DATE '2027-01-11';
UPDATE academic_calendar_events e SET title = 'KBM Pertama',
  last_operation = '{"migration":"0038","previous":"first-class"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'KBM pertama' AND e.starts_on = DATE '2027-01-12';
UPDATE academic_calendar_events e SET title = 'Prakiraan Libur Awal Ramadhan',
  last_operation = '{"migration":"0038","previous":"ramadhan-start"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Prakiraan libur awal Ramadhan' AND e.starts_on = DATE '2027-02-08';
UPDATE academic_calendar_events e SET title = 'Perkiraan Iedul Fitri',
  last_operation = '{"migration":"0038","previous":"eid-estimate"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Perkiraan Idul Fitri' AND e.starts_on = DATE '2027-03-09';
UPDATE academic_calendar_events e SET title = 'Libur Iedul Fitri',
  last_operation = '{"migration":"0038","previous":"eid-holiday"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Libur Idul Fitri' AND e.starts_on = DATE '2027-03-10';
UPDATE academic_calendar_events e SET title = 'Iedul Adha',
  last_operation = '{"migration":"0038","previous":"adha"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Idul Adha' AND e.starts_on = DATE '2027-05-16';
UPDATE academic_calendar_events e SET title = 'Libur Iedul adha',
  last_operation = '{"migration":"0038","previous":"adha-holiday"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Libur Idul Adha' AND e.starts_on = DATE '2027-05-17';
UPDATE academic_calendar_events e SET starts_on = DATE '2027-06-16', ends_on = DATE '2027-06-17',
  last_operation = '{"migration":"0038","previous":"june-class-meeting"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Class Meeting' AND e.starts_on = DATE '2027-06-18' AND e.ends_on = DATE '2027-06-18';
UPDATE academic_calendar_events e SET archived_at = clock_timestamp(),
  last_operation = '{"migration":"0038","previous":"edurance"}'::jsonb
FROM academic_years y WHERE e.academic_year_id = y.id AND y.name = '2026/2027'
  AND e.title = 'Edurance' AND e.starts_on = DATE '2027-05-22' AND e.archived_at IS NULL;

INSERT INTO academic_calendar_events
  (academic_year_id, title, description, category, starts_on, ends_on, created_by, last_operation)
SELECT y.id, 'Prakiraan Libur I''tikaf Ramadhan 1448 H', 'Tanggal dapat berubah mengikuti keputusan resmi.',
  'holiday', DATE '2027-02-28', DATE '2027-02-28', source.created_by, '{"migration":"0038","inserted":"itikaf-estimate"}'::jsonb
FROM academic_years y JOIN LATERAL (
  SELECT e.created_by FROM academic_calendar_events e WHERE e.academic_year_id = y.id ORDER BY e.created_at LIMIT 1
) source ON true
WHERE y.name = '2026/2027' AND NOT EXISTS (
  SELECT 1 FROM academic_calendar_events e WHERE e.academic_year_id = y.id
    AND e.title = 'Prakiraan Libur I''tikaf Ramadhan 1448 H' AND e.starts_on = DATE '2027-02-28'
);
INSERT INTO academic_calendar_events
  (academic_year_id, title, description, category, starts_on, ends_on, created_by, last_operation)
SELECT y.id, 'Portofolio', 'Pengumpulan dan presentasi portofolio semester genap.',
  'learning', DATE '2027-06-13', DATE '2027-06-15', source.created_by, '{"migration":"0038","inserted":"june-portfolio"}'::jsonb
FROM academic_years y JOIN LATERAL (
  SELECT e.created_by FROM academic_calendar_events e WHERE e.academic_year_id = y.id ORDER BY e.created_at LIMIT 1
) source ON true
WHERE y.name = '2026/2027' AND NOT EXISTS (
  SELECT 1 FROM academic_calendar_events e WHERE e.academic_year_id = y.id
    AND e.title = 'Portofolio' AND e.starts_on = DATE '2027-06-13'
);
