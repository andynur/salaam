# HSI Learning OS — Planning Pack

Dokumen ini adalah baseline perencanaan pengembangan **HSI Learning OS**, aplikasi internal HSI Boarding School yang berfokus pada pembelajaran, assessment, project-based learning, gamification, portfolio siswa, absensi, dan operasional kelas.

> Baseline teknis: **Bun 1.4.2**, TypeScript, React, Tailwind CSS, PostgreSQL melalui `Bun.SQL`, `Bun.serve()`, native WebSocket, local file storage, dan deployment awal pada Ubuntu Server VPS 2 vCPU / 2 GB RAM.

## Tujuan utama

HSI Learning OS **bukan sekadar LMS**. Sistem ini dirancang sebagai *School Learning Operating System* yang menyatukan:

- Course, module, lesson, dan material pembelajaran.
- Assignment, quiz, exam, survey, questionnaire, challenge.
- Question bank, submission, attempt, grading, rubric.
- Task management, Kanban, dan project-based learning.
- Student showcase dan portfolio.
- XP, level, badge, challenge, dan achievement.
- Kalender akademik dan event.
- Absensi kelas per pertemuan.
- QR/camera-assisted attendance.
- Realtime notification dan classroom status.
- Audit, permission, backup, dan observability dasar.
- Fitur IT-learning lanjutan seperti coding challenge dan isolated code runner.

## Prinsip produk

1. **Modular monolith dahulu.**
2. **Minimum dependencies.**
3. Gunakan kemampuan native Bun sebelum menambah package.
4. PostgreSQL sebagai source of truth.
5. Redis/Valkey **tidak diperlukan di V1**.
6. Local filesystem sebagai storage awal.
7. Satu Activity Engine untuk assignment, quiz, exam, survey, dan challenge.
8. UI guru/admin lebih padat seperti Jira; UI siswa lebih sederhana.
9. Offline/reconnect resilience wajib untuk online exam.
10. Fitur biometrik/face recognition bukan MVP.
11. Student code tidak pernah dieksekusi langsung di main application process.
12. Security, auditability, backup, dan restore harus dibangun sejak awal.

## Urutan membaca

1. `01_PRODUCT_VISION_AND_SCOPE.md`
2. `02_ARCHITECTURE_AND_STACK.md`
3. `03_MASTER_ROADMAP.md`
4. `04_MODULE_AND_DOMAIN_PLAN.md`
5. `05_DATA_SECURITY_RELIABILITY.md`
6. `06_UI_UX_DESIGN_SYSTEM.md`
7. `07_DEPLOYMENT_AND_OPERATIONS.md`
8. `08_CODEX_VSCODE_HARNESS.md`
9. `09_ENGINEERING_RULES_AND_DOD.md`
10. `10_BACKLOG_AFTER_V1.md`
11. `AGENTS_TEMPLATE.md`
12. `MASTER_PROMPT.md`

## Cara memakai paket ini dengan Codex

- Letakkan folder dokumen ini di repo, idealnya sebagai `/docs`.
- Salin `AGENTS_TEMPLATE.md` menjadi `/AGENTS.md` setelah setup awal.
- Jalankan isi `MASTER_PROMPT.md` sebagai instruksi awal Codex.
- Setelah foundation terbentuk, kerjakan roadmap **per fase**, bukan seluruh sistem sekaligus.
- Untuk setiap fase baru, beri Codex task spesifik dengan goal, scope, acceptance criteria, dan file/module yang relevan.

## Definition of success V1

V1 dianggap berhasil jika sekolah dapat melakukan alur berikut secara stabil:

**Teacher membuat course → lesson → activity → siswa mengerjakan → jawaban/submission tersimpan aman → teacher menilai → progress/XP diperbarui → project dapat masuk showcase/portfolio → absensi dan kalender dapat dikelola → audit dan backup tersedia.**

## Implementation validation

- [Phase 0 — Foundation](11_FOUNDATION_VALIDATION.md).
- [Phase 1 — Identity & Academic Foundation](12_PHASE1_VALIDATION.md).
