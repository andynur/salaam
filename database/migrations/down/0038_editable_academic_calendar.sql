DELETE FROM academic_calendar_events WHERE last_operation->>'migration' = '0038' AND last_operation ? 'inserted';
UPDATE academic_calendar_events SET title = 'Libur semester / Tahun ajaran baru', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'initial-holiday';
UPDATE academic_calendar_events SET title = 'Serah terima santri', starts_on = DATE '2026-08-12', ends_on = DATE '2026-08-12', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'student-handover';
UPDATE academic_calendar_events SET starts_on = DATE '2026-08-13', ends_on = DATE '2026-08-19', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'mpls';
UPDATE academic_calendar_events SET title = 'Nusantara Spirit Day', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'nusantara';
UPDATE academic_calendar_events SET title = 'Liburan semester', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'semester-holiday';
UPDATE academic_calendar_events SET title = 'Kedatangan santri', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'student-arrival';
UPDATE academic_calendar_events SET title = 'Presentasi tugas liburan', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'holiday-presentation';
UPDATE academic_calendar_events SET title = 'KBM pertama', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'first-class';
UPDATE academic_calendar_events SET title = 'Prakiraan libur awal Ramadhan', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'ramadhan-start';
UPDATE academic_calendar_events SET title = 'Perkiraan Idul Fitri', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'eid-estimate';
UPDATE academic_calendar_events SET title = 'Libur Idul Fitri', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'eid-holiday';
UPDATE academic_calendar_events SET title = 'Idul Adha', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'adha';
UPDATE academic_calendar_events SET title = 'Libur Idul Adha', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'adha-holiday';
UPDATE academic_calendar_events SET starts_on = DATE '2027-06-18', ends_on = DATE '2027-06-18', last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'june-class-meeting';
UPDATE academic_calendar_events SET archived_at = NULL, last_operation = '{}'::jsonb WHERE last_operation->>'previous' = 'edurance';

DROP INDEX IF EXISTS academic_calendar_events_request_key_idx;
ALTER TABLE academic_calendar_events
  DROP CONSTRAINT IF EXISTS academic_calendar_events_operation_check,
  DROP CONSTRAINT IF EXISTS academic_calendar_events_version_check,
  DROP COLUMN IF EXISTS last_operation,
  DROP COLUMN IF EXISTS request_key,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS version;
