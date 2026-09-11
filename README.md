# HSI Learning OS

Platform internal HSI Boarding School untuk pembelajaran, assessment, karya santri,
dan operasional akademik. Implementasi saat ini mencakup **Phase 1 — Core Identity & Academic Foundation**.
Admin dapat membuat akun/profil, struktur akademik, enrollment, course dasar, penugasan
guru, serta melihat audit log. Module/lesson dan activity engine mengikuti fase berikutnya.

## Arsitektur

Modular monolith: `Bun.serve()` → service/repository → PostgreSQL melalui native
`Bun.SQL`. React dan Tailwind menggunakan HTML imports dan bundler native Bun,
termasuk HMR saat development dan bundling sebelum production. Tidak ada framework
backend, Vite, ORM, Redis, atau layanan tambahan.

- `src/core/`: konfigurasi, HTTP/error/logging, database, auth, permission.
- `src/modules/users/`: identitas, profil per role, dan provisioning akun.
- `src/modules/academic/`: struktur akademik, enrollment, penugasan guru, dan ringkasan dashboard.
- `src/shared/`: kontrak data daftar administrasi.
- `src/web/`: shell, halaman, primitive UI, dan design tokens.
- `database/migrations/`: migrasi SQL berurutan dan immutable setelah diterapkan.
- `database/seed/`: seed admin development eksplisit.
- `storage/`: penyimpanan privat, tidak dilayani sebagai static directory.
- `tests/`: unit, HTTP, dan integrasi PostgreSQL.

## Prasyarat dan setup

- Bun **1.4.2** (`bun --version`).
- PostgreSQL 17 (baseline yang diuji), database UTF-8, dan role yang bisa menjalankan migrasi.

```sh
bun install --frozen-lockfile
cp .env.example .env
createdb hsi_learning_os
# Sesuaikan DATABASE_URL dan konfigurasi lain di .env.
bun run db:migrate
bun run dev
```

Buka http://localhost:3000. `APP_BASE_URL` harus persis sama dengan origin browser;
`localhost` dan `127.0.0.1` adalah origin berbeda. Tidak ada akun/password bawaan.

## Environment

| Variable | Penggunaan |
| --- | --- |
| `NODE_ENV` | `development`, `test`, atau `production`; default development |
| `HOST`, `PORT` | Bind address; default `127.0.0.1:3000` |
| `DATABASE_URL` | Wajib, URL PostgreSQL dengan nama database |
| `APP_BASE_URL` | Wajib, origin tanpa path/query; HTTPS wajib di production |
| `STORAGE_ROOT` | Wajib, path storage privat; relative terhadap working directory |
| `SCHOOL_TIMEZONE` | IANA timezone; default `Asia/Jakarta` |
| `SESSION_TTL_HOURS` | 1–168 jam; default 12 jam, expiry absolut |
| `TEST_DATABASE_URL` | Opsional; DB terpisah dengan nama berakhiran `_test` |

Token sesi acak 256-bit disimpan sebagai SHA-256 di DB. Karena token bersifat opaque
dan tidak memuat klaim, tidak diperlukan session signing secret. Jangan commit `.env`.

## Admin development

Isi sementara `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, dan `SEED_ADMIN_PASSWORD` di
`.env` privat atau melalui environment shell. Password harus 12–128 karakter.

```sh
bun run db:seed
```

Hapus ketiga variable tersebut setelah seed. Seed hanya berjalan pada
`NODE_ENV=development`, bersifat transactional, mencatat audit, dan menolak email
yang sudah ada; tidak mereset password atau menaikkan role akun existing.
Untuk admin pertama, termasuk production, gunakan bootstrap berikut.

## Admin pertama dan alur Phase 1

Isi `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_IDENTIFIER`, dan
`BOOTSTRAP_ADMIN_PASSWORD` secara privat, kemudian jalankan:

```sh
bun run db:migrate
bun run db:bootstrap-admin
```

Password harus 12–128 karakter. Bootstrap memakai transaction lock, menolak jika
sudah ada admin (termasuk admin nonaktif), tidak menimpa akun, dan mencatat audit.
Hapus variable bootstrap setelah berhasil. Akun selanjutnya dibuat oleh admin
melalui **Akun & profil**, dengan role Santri, Guru, atau Admin dan NIS/nomor pegawai.
Nomor identitas unik per role; akun hasil migrasi/seed lama dapat belum memiliki nomor.

Urutan setup melalui menu **Akademik**:

1. Buat tahun ajaran dan semester di dalam rentang tanggalnya.
2. Buat kelas pada tahun ajaran tersebut, lalu enroll santri aktif.
3. Buat mata pelajaran dan course dasar yang menghubungkan kelas dan semester.
4. Assign guru aktif ke course.
5. Buka **Audit log** untuk memeriksa pelaku, event, resource, waktu, dan request ID.

Satu santri memiliki satu kelas per tahun ajaran. Course harus memakai kelas dan
semester dari tahun ajaran yang sama; kombinasi kelas/semester/mata pelajaran unik.
Satu course dapat memiliki beberapa guru, dengan pasangan course/guru yang unik.
Data pada fase ini tersedia melalui create/list, tanpa edit/delete riwayat akademik.
Role/permission memakai baseline tetap; editor role kustom dan reset password belum tersedia.

Dashboard menampilkan tahun ajaran yang mencakup tanggal sekolah saat ini (jika lebih
dari satu, pilih yang mulai paling baru). Jumlah kelas/course mencakup seluruh tahun
dalam akses aktor: admin dengan `academic.manage` melihat semua, guru sesuai penugasan,
dan santri sesuai enrollment. Isi pembelajaran course merupakan scope Phase 2.

API administrasi memakai `GET`/`POST /api/admin/{resource}` untuk `users`, `years`,
`terms`, `classes`, `enrollments`, `subjects`, `courses`, dan `teaching-assignments`.
`GET /api/admin/audit` bersifat read-only. Daftar menerima `q` dan `offset`, maksimal
50 baris per halaman, serta mengembalikan `items`/`nextOffset`. Pemilihan santri/guru
memakai daftar user dengan filter `role`.

## Database dan migrasi

```sh
bun run db:migrate
```

Runner memegang PostgreSQL transaction advisory lock, memvalidasi checksum/histori,
dan menerapkan pending migrations dalam satu transaction. Kegagalan membatalkan
seluruh batch. Replay tidak menerapkan ulang SQL. Gunakan file baru dengan format
`0002_description.sql`; jangan edit migrasi yang sudah applied. `unsafe().simple()`
hanya digunakan untuk SQL tepercaya dari file migrasi; data runtime memakai parameter.

Identitas awal: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`,
`sessions`, `audit_logs`. Migrasi `0002_academic_foundation.sql` menambah `user_profiles`,
`academic_years`, `terms`, `classes`, `class_members`, `subjects`, `courses`,
`teaching_assignments`, permission admin, dan resource/metadata audit.
UUID konsisten, timestamps `timestamptz`, foreign keys,
unique/check constraints. Pool aplikasi maksimum 4 koneksi. SQL transaction native
dipakai langsung untuk invariant lintas tabel.

## Development dan validasi

```sh
bun run dev
bun test
bun run typecheck
bun run build
```

`bun test` menjalankan unit/HTTP tests dan melewati integrasi jika URL DB test tidak
disediakan. Untuk pengujian DB sungguhan:

```sh
createdb hsi_learning_os_test
TEST_DATABASE_URL=postgres://localhost:5432/hsi_learning_os_test bun test
```

Integration tests membuat schema acak yang dibuang setelah pengujian, tidak mengubah
tabel schema `public`. Role test membutuhkan izin create/drop schema. Cakupan:
migration replay/rollback, constraint, login, session rotation/expiry/logout,
disabled user, pencabutan izin, provisioning/profil, isolasi akses admin, alur akademik,
validasi tanggal/relasi, duplikasi dan race enrollment, rollback audit, pagination,
dan koneksi database.

Format awal: dua spasi, semicolon, double quotes. TypeScript strict dan code review
menjadi pemeriksaan awal; belum menambah dependency formatter/linter.

Browser smoke: invalid login → pesan error; login benar → dashboard; reload → tetap
login; logout → login; uji laptop/tablet/ponsel dan focus keyboard. Jalankan alur
setup Phase 1 di atas, termasuk input invalid dan akses URL admin sebagai santri.
Hasil validasi lokal: [Phase 1 validation](docs/12_PHASE1_VALIDATION.md).

## Build dan production

```sh
bun run build
# Konfigurasikan .env production secara privat, lalu:
bun run db:migrate
bun run start
```

`start` memaksa `NODE_ENV=production`. Jalankan dari root repository; distribusikan
`dist/`, `database/migrations/`, serta source/script migrasi jika menjalankan command
migrasi dari release. Aset React/CSS/logo sudah ada dalam output build. Install
dependency development pada tahap build; aplikasi hasil bundle tidak membutuhkan
Tailwind compiler saat runtime.

Bun 1.4.2 mencari file manifest HTML relatif terhadap working directory. Bootstrap
membaca konfigurasi dan mengubah storage ke absolute path terlebih dahulu, kemudian
memakai direktori bundle sebagai working directory untuk serving aset prebuilt.

Pasang reverse proxy HTTPS (misalnya Caddy) di depan bind loopback, lalu jalankan Bun
sebagai user non-root di service manager. Proxy harus menambahkan security headers
ke seluruh respons, termasuk error yang ditangani proxy. Manifest HTML production
juga menerapkan CSP, anti-framing, nosniff, dan HSTS. Development memakai CSP meta
dengan inline styles untuk HMR; header hardening penuh berlaku pada build production.

Health endpoints:

- `GET /health/live`: process hidup; tidak mengakses DB.
- `GET /health/ready`: hanya `SELECT 1`, dengan pembatalan query setelah 2 detik
  dan connection timeout 5 detik; DB tidak tersedia menghasilkan 503.

Readiness tidak memeriksa versi schema; deployment wajib menjalankan migrasi sebelum
mengarahkan traffic. API/health mencatat JSON log dengan timestamp, level, request ID,
status, dan durasi. Gunakan access log reverse proxy untuk aset static. SIGTERM/SIGINT
menghentikan server dan menutup pool; shutdown memiliki batas waktu 10 detik.

Untuk VPS 2 GB, batasi koneksi PostgreSQL, monitor disk, rotasi log, serta jadwalkan
backup PostgreSQL dan storage privat ke lokasi lain. Uji restore sebelum deployment
sekolah. Detail: [deployment dan operasi](docs/07_DEPLOYMENT_AND_OPERATIONS.md).

## Keamanan

- Bun Argon2id (19 MiB, 2 iterations); password tidak disimpan/log plaintext.
- Cookie HttpOnly, SameSite=Lax, expiry absolut; production memakai Secure dan
  prefix `__Host-`. Login merotasi cookie sesi existing; logout menghapus sesi di DB.
- CSRF: seluruh mutasi auth/admin wajib Origin yang sesuai, JSON untuk input, dan menolak
  `Sec-Fetch-Site: cross-site`. Tidak ada token auth di localStorage.
- Setiap dashboard/admin request memeriksa permission DB; role admin tidak otomatis bypass.
  `admin.users.manage`, `academic.manage`, dan `audit.view` hanya diberikan ke baseline admin.
  User disabled, expired session, dan perubahan permission berlaku di request berikutnya.
- Login menggunakan error kredensial generik, verifikasi dummy Argon2id untuk akun
  yang tidak dikenal, maksimum 10 percobaan/15 menit/IP, dan 2 login aktif sekaligus.
  Limit process-memory reset saat restart; dengan proxy loopback, limit IP menjadi
  bersama untuk semua klien. Tambahkan limit per-client di proxy sebelum penggunaan
  sekolah; aplikasi sengaja tidak mempercayai `X-Forwarded-For` mentah.
- HTTP body dibatasi 4 KiB untuk foundation. Log tidak mencatat body, email, cookie,
  password, token, SQL error, atau URL database. Pesan error tidak membuka stack trace.
- Upload belum diimplementasikan. Storage tidak public; fitur upload berikutnya wajib
  membuat nama/path sendiri, memvalidasi MIME/size, dan memeriksa permission download.
- Sesi expired tidak valid meski baris masih ada; bersihkan rutin dengan
  `DELETE FROM sessions WHERE expires_at <= now()` lewat maintenance database.
- Audit auth/provisioning/akademik transactional dan append-oriented; kegagalan audit
  membatalkan mutasi. Audit UI tidak menyediakan perubahan/penghapusan. Recovery/MFA,
  kebijakan retention, backup automation, dan load testing masuk fase berikutnya.

## Dependensi langsung

| Production dependency | Alasan |
| --- | --- |
| `react` | Komponen/state shell UI sesuai stack |
| `react-dom` | Render React ke DOM browser |

Development: `typescript` untuk strict typecheck; `@types/bun`, `@types/react`, dan
`@types/react-dom` untuk tipe; `tailwindcss` untuk token/utility CSS;
`bun-plugin-tailwind` sebagai adapter resmi yang dicontohkan dokumentasi Bun untuk
HTML bundling. Tidak diperlukan package untuk routing, crypto, SQL, logging, atau test.
Dependency versions direkam dalam `bun.lock`.

Referensi build: [Bun fullstack HTML bundling](https://bun.com/docs/bundler/fullstack),
[Bun native SQL](https://bun.com/docs/runtime/sql).

## Roadmap dan task berikutnya

Exit criteria **Phase 1 — Core Identity & Academic Foundation** sudah diuji lokal.
Task berikutnya adalah **Phase 2 — Learning Core**: course module, lesson, material,
publish/draft, dan progress belajar, menggunakan record course yang sudah tersedia.
Lihat [roadmap](docs/03_MASTER_ROADMAP.md) dan [peta dokumen](docs/00_README.md).
Aturan kerja ringkas ada di [AGENTS.md](AGENTS.md); baca dokumen relevan sesuai task.

Format task berikutnya:

```md
## Goal
...

## Context
Read:
- docs/...

## Scope
- ...

## Out of scope
- ...

## Acceptance criteria
- ...
- bun test, typecheck, build pass

## Constraints
- Reuse existing patterns; justify new dependencies.
```
# los
