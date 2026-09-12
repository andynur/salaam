-- Two more managed clubs so the club directory shows the school's real offering: Builders
-- Club (product and design) and Multimedia Club (photography, video, and content). Club
-- definitions are product structure, like roles and badges, so they are seeded here;
-- membership and linked courses stay demo or production data.
INSERT INTO clubs (slug, name, tagline, purpose, direction, program, published) VALUES (
  'builders-club', 'Builders Club',
  'Ruang belajar UI/UX, web design, dan pengembangan produk digital',
  'Builders Club adalah ruang belajar santri di bidang perancangan dan pembangunan produk digital: UI/UX, web design, dan pengembangan produk dari ide sampai rilis. Klub ini menyatukan materi, latihan, challenge, proyek nyata, dan review mentor dalam satu alur yang dapat diikuti santri dari nol sampai menghasilkan karya.',
  'Alur belajar klub: belajar dasar desain dan riset pengguna, berlatih membuat wireframe dan prototipe, menyelesaikan challenge desain, membangun produk bersama tim, review bersama mentor, menampilkan karya di showcase, lalu bertumbuh ke tingkat berikutnya.',
  'Program berjalan: pertemuan rutin mingguan, satu challenge desain per bulan, dan satu produk tim per semester yang ditutup dengan showcase karya.',
  true
), (
  'multimedia-club', 'Multimedia Club',
  'Ruang belajar fotografi, videografi, dan produksi konten kreatif',
  'Multimedia Club adalah ruang belajar santri di bidang fotografi, videografi, vlog, media sosial, dan produksi konten kreatif. Klub ini menyatukan materi, latihan, challenge, proyek nyata, dan review mentor dalam satu alur yang dapat diikuti santri dari nol sampai menghasilkan karya.',
  'Alur belajar klub: belajar dasar visual dan penceritaan, berlatih memotret dan mengambil gambar, menyelesaikan challenge konten, membangun produksi bersama tim, review bersama mentor, menampilkan karya di showcase, lalu bertumbuh ke tingkat berikutnya.',
  'Program berjalan: pertemuan rutin mingguan, satu challenge konten per bulan, dan satu produksi tim per semester yang ditutup dengan showcase karya.',
  true
);
INSERT INTO club_goals (club_id, position, title, description)
SELECT c.id, g.position, g.title, g.description FROM clubs c CROSS JOIN (VALUES
  (1, 'Dasar desain produk', 'Menguasai prinsip UI, tipografi, warna, dan tata letak melalui materi dan latihan terstruktur.'),
  (2, 'Riset dan empati pengguna', 'Melatih kemampuan memahami kebutuhan pengguna sebelum merancang solusi.'),
  (3, 'Prototipe dan pengujian', 'Membuat wireframe, prototipe, dan menguji rancangan bersama calon pengguna.'),
  (4, 'Membangun produk nyata', 'Mengerjakan produk tim dari ide sampai rilis dengan papan kanban dan review mentor.'),
  (5, 'Portfolio santri', 'Mengumpulkan karya desain terbaik menjadi portfolio yang dapat ditunjukkan.'),
  (6, 'Kolaborasi lintas klub', 'Bekerja sama dengan klub lain agar rancangan menjadi produk yang berjalan.')
) AS g(position, title, description) WHERE c.slug = 'builders-club';
INSERT INTO club_goals (club_id, position, title, description)
SELECT c.id, g.position, g.title, g.description FROM clubs c CROSS JOIN (VALUES
  (1, 'Dasar fotografi', 'Menguasai komposisi, pencahayaan, dan pengaturan kamera melalui materi dan latihan.'),
  (2, 'Videografi dan penyuntingan', 'Merekam dan menyunting video pendek dengan alur cerita yang jelas.'),
  (3, 'Penceritaan konten', 'Menyusun naskah dan alur cerita untuk vlog dan konten dokumentasi sekolah.'),
  (4, 'Produksi konten sekolah', 'Memproduksi konten media sosial sekolah secara terjadwal bersama tim.'),
  (5, 'Portfolio santri', 'Mengumpulkan karya foto dan video terbaik menjadi portfolio yang dapat ditunjukkan.'),
  (6, 'Adab bermedia', 'Menjaga adab, izin, dan privasi dalam setiap liputan dan publikasi.')
) AS g(position, title, description) WHERE c.slug = 'multimedia-club';
