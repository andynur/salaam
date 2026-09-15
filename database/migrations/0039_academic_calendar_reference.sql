-- Populate the approved 2026/2027 reference only when that year's annual calendar is empty.
WITH target AS (
  SELECT y.id AS academic_year_id, manager.id AS created_by
  FROM academic_years y
  JOIN LATERAL (
    SELECT DISTINCT u.id
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id AND p.key = 'academic.manage'
    WHERE u.is_active
    ORDER BY u.id LIMIT 1
  ) manager ON true
  WHERE y.name = '2026/2027' AND y.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM academic_calendar_events e WHERE e.academic_year_id = y.id AND e.archived_at IS NULL)
), reference(title, description, category, starts_on, ends_on) AS (VALUES
  ('Libur Semester/ Tahun Ajaran Baru', 'Libur semester dan persiapan tahun ajaran baru.', 'holiday', DATE '2026-07-29', DATE '2026-08-11'),
  ('Serah Terima Santri', 'Orientasi dan serah terima santri baru.', 'student', DATE '2026-07-12', DATE '2026-07-12'),
  ('MPLS', 'Masa pengenalan lingkungan sekolah.', 'student', DATE '2026-07-13', DATE '2026-07-19'),
  ('Dauroh Ilmu Ust. Ayatullah', 'Kegiatan pembinaan dan penguatan ilmu.', 'academic', DATE '2026-08-01', DATE '2026-08-02'),
  ('Nusantara Spirit Day.', 'Kegiatan kebersamaan sekolah.', 'student', DATE '2026-08-16', DATE '2026-08-17'),
  ('Sharing the Joy', 'Kegiatan berbagi dan refleksi.', 'student', DATE '2026-10-18', DATE '2026-10-18'),
  ('Life to learn', 'Sesi pengembangan karakter.', 'learning', DATE '2026-11-15', DATE '2026-11-15'),
  ('Ujian Tahfidz', 'Penilaian hafalan tahfidz.', 'assessment', DATE '2026-12-09', DATE '2026-12-13'),
  ('SAS', 'Sumatif akhir semester.', 'assessment', DATE '2026-12-14', DATE '2026-12-19'),
  ('Portofolio', 'Pengumpulan dan presentasi portofolio.', 'learning', DATE '2026-12-20', DATE '2026-12-22'),
  ('Class Meeting', 'Pertemuan kelas dan evaluasi semester.', 'student', DATE '2026-12-23', DATE '2026-12-24'),
  ('Liburan Semester', 'Libur semester ganjil.', 'holiday', DATE '2026-12-27', DATE '2027-01-09'),
  ('Kedatangan Santri', 'Kedatangan santri setelah liburan.', 'student', DATE '2027-01-10', DATE '2027-01-10'),
  ('Presentasi Tugas Liburan', 'Presentasi tugas selama liburan.', 'learning', DATE '2027-01-11', DATE '2027-01-11'),
  ('KBM Pertama', 'Kegiatan belajar mengajar semester genap dimulai.', 'academic', DATE '2027-01-12', DATE '2027-01-12'),
  ('Prakiraan Libur Awal Ramadhan', 'Tanggal dapat berubah mengikuti keputusan resmi.', 'holiday', DATE '2027-02-08', DATE '2027-02-08'),
  ('Ramadhan Journey', 'Program pembelajaran dan ibadah Ramadhan.', 'academic', DATE '2027-02-09', DATE '2027-02-27'),
  ('Ramadhan Fest', 'Kegiatan penutup program Ramadhan.', 'student', DATE '2027-02-20', DATE '2027-02-21'),
  ('Prakiraan Libur I''tikaf Ramadhan 1448 H', 'Tanggal dapat berubah mengikuti keputusan resmi.', 'holiday', DATE '2027-02-28', DATE '2027-02-28'),
  ('Libur I''tikaf', 'Libur dan persiapan I''tikaf.', 'holiday', DATE '2027-03-01', DATE '2027-03-08'),
  ('Perkiraan Iedul Fitri', 'Tanggal dapat berubah mengikuti keputusan resmi.', 'holiday', DATE '2027-03-09', DATE '2027-03-09'),
  ('Libur Iedul Fitri', 'Libur Iedul Fitri.', 'holiday', DATE '2027-03-10', DATE '2027-03-19'),
  ('Kedatangan Santri', 'Kedatangan santri setelah libur Iedul Fitri.', 'student', DATE '2027-03-20', DATE '2027-03-20'),
  ('Mission Impossible', 'Kegiatan tantangan dan kolaborasi.', 'student', DATE '2027-04-11', DATE '2027-04-11'),
  ('Stories of Wisdom', 'Sesi berbagi inspirasi.', 'learning', DATE '2027-04-24', DATE '2027-04-24'),
  ('Iedul Adha', 'Libur Iedul Adha.', 'holiday', DATE '2027-05-16', DATE '2027-05-16'),
  ('Libur Iedul adha', 'Libur Iedul Adha.', 'holiday', DATE '2027-05-17', DATE '2027-05-18'),
  ('Ujian Tahfidz', 'Penilaian hafalan tahfidz semester genap.', 'assessment', DATE '2027-06-02', DATE '2027-06-06'),
  ('SAS', 'Sumatif akhir semester genap.', 'assessment', DATE '2027-06-07', DATE '2027-06-12'),
  ('Portofolio', 'Pengumpulan dan presentasi portofolio semester genap.', 'learning', DATE '2027-06-13', DATE '2027-06-15'),
  ('Class Meeting', 'Pertemuan kelas dan evaluasi akhir tahun.', 'student', DATE '2027-06-16', DATE '2027-06-17')
)
INSERT INTO academic_calendar_events
  (academic_year_id, title, description, category, starts_on, ends_on, created_by, last_operation)
SELECT target.academic_year_id, reference.title, reference.description, reference.category, reference.starts_on, reference.ends_on,
  target.created_by, '{"migration":"0039","reference":"2026/2027"}'::jsonb
FROM target CROSS JOIN reference;
