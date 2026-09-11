# Master Development Roadmap

Roadmap ini disusun agar sistem selalu memiliki keadaan yang dapat diuji dan digunakan. Jangan mengerjakan semua fitur sekaligus.

---

# Phase 0 — Repository & Engineering Foundation

## Goal

Membentuk repo yang konsisten, aman, dan mudah dikerjakan manusia maupun Codex.

## Deliverables

- Bun project.
- TypeScript strict.
- React + Tailwind.
- Formatting/lint strategy yang minimal.
- Environment config validation.
- `AGENTS.md`.
- `/docs`.
- Test command.
- Build command.
- Dev command.
- Database connection healthcheck.
- Migration runner.
- Error model.
- Request ID/logging.
- Basic CI if repository remote tersedia.

## Exit criteria

- Fresh clone dapat setup dari README.
- `bun test` pass.
- production build berhasil.
- DB migrate up berhasil.
- app health endpoint tersedia.

---

# Phase 1 — Core Identity & Academic Foundation

Status: exit criteria implemented and locally validated on 2026-09-11.
See [Phase 1 validation](12_PHASE1_VALIDATION.md) for scope and evidence.

## Goal

Membuat skeleton sistem sekolah.

## Features

- Users.
- Student/teacher/admin profiles.
- Roles.
- Permissions.
- Session authentication.
- Academic years.
- Terms/semesters.
- Classes/cohorts.
- Enrollments.
- Subject/course basic records.
- Audit log.

## Exit criteria

Admin dapat:

- membuat student,
- membuat class,
- enroll student,
- assign teacher,
- login/logout,
- melihat basic audit event.

---

# Phase 2 — Learning Core

## Goal

Course dapat benar-benar dipakai untuk mengajar.

## Features

- Course.
- Module.
- Lesson.
- Lesson content.
- Attachment/material.
- Course enrollment.
- Publish/draft state.
- Student progress.
- Teacher course dashboard.
- Student “Continue Learning”.

## Exit criteria

Teacher dapat membuat:

```text
Course
 -> Module
 -> Lesson
```

Student dapat mengakses lesson dan progress tercatat.

---

# Phase 3 — Activity Engine V1

## Goal

Membentuk engine generik untuk tugas dan quiz.

## Features

- Generic `Activity`.
- Activity item builder.
- Text.
- Multiple choice.
- Multiple answer.
- True/false.
- Short answer.
- Essay.
- File upload.
- Availability.
- Deadline.
- Max attempts.
- Draft/publish.
- Submission.
- Attempt.
- Basic automatic scoring.
- Manual grading.
- Teacher feedback.

## Exit criteria

Satu engine yang sama dapat membuat:

- assignment,
- simple quiz.

Tidak ada duplicated assignment/quiz architecture.

---

# Phase 4 — Exam & Assessment Reliability

## Goal

Online exam aman terhadap reconnect dan browser interruption.

## Features

- Question bank.
- Exam activity mode.
- Timer.
- Attempt lifecycle.
- Randomization.
- Autosave.
- Client-side temporary persistence.
- Reconnect sync.
- Idempotent submit.
- Server authoritative deadline.
- Exam audit event.
- Result release controls.

## Critical tests

- Network putus ketika menjawab.
- Browser refresh.
- Double submit.
- 100 simulated concurrent autosave.
- Deadline reached while offline.
- Duplicate requests.

## Exit criteria

Tidak ada kehilangan jawaban pada skenario reconnect yang didukung.

---

# Phase 5 — Form / Survey Mode

## Goal

Memanfaatkan Activity Engine untuk kebutuhan non-assessment.

## Features

- Survey/questionnaire activity.
- Rating.
- Checkbox.
- Long text.
- Optional anonymous response.
- Required/optional.
- Response export.
- Simple summary.

## Exit criteria

Tidak membuat subsystem form baru; tetap menggunakan Activity Engine.

---

# Phase 6 — Attendance & Classroom Sessions

## Goal

Absensi terhubung dengan meeting/pertemuan.

## Features

- Course meeting/session.
- Attendance roster.
- Present/late/absent/excused.
- Manual attendance.
- Attendance note.
- Attendance report.
- Realtime attendance dashboard.
- Audit correction.

## Exit criteria

Attendance selalu terkait session yang jelas, bukan sekadar tanggal.

---

# Phase 7 — QR Camera Attendance

## Goal

Mempercepat absensi tanpa biometrik.

## Features

- Student QR identity.
- Camera scanner.
- Duplicate scan protection.
- Session-specific acceptance.
- Scan timestamp.
- Realtime dashboard update.
- Manual correction.

## Security

QR tidak boleh menjadi reusable authentication credential.

Gunakan signed/opaque identifier atau server-side validation strategy yang aman.

---

# Phase 8 — Project & Kanban

## Goal

Project-based learning menjadi first-class feature.

## Features

- Student project.
- Team project.
- Member roles.
- Project task.
- Kanban columns.
- Drag/drop ordering.
- Due date.
- Assignment/challenge linkage.
- Teacher review.
- Project status.

## Exit criteria

Course challenge dapat menghasilkan project dan project dapat dikelola melalui Kanban.

---

# Phase 9 — Showcase & Portfolio

## Goal

Hasil belajar membentuk rekam jejak nyata siswa.

## Features

- Student public/internal portfolio.
- Skill tags.
- Project entries.
- Achievements.
- Teacher approval.
- Showcase page.
- Privacy controls.
- Featured project.

## Exit criteria

Teacher dapat memilih project yang layak dipublish dan student dapat melihat portfolio-nya.

---

# Phase 10 — Gamification Engine

## Goal

Gamification mendorong achievement, bukan sekadar login streak.

## Features

- XP ledger.
- Level rules.
- Badge definitions.
- Badge conditions.
- Challenge reward.
- Achievement feed.
- Optional leaderboard.
- Anti-duplicate reward idempotency.

## Suggested events

- challenge completed,
- perfect quiz,
- project published,
- project reviewed,
- learning milestone.

## Exit criteria

Setiap perubahan XP dapat ditelusuri ke transaction/event.

---

# Phase 11 — Calendar & Notification

## Goal

Deadline dan aktivitas sekolah mudah diikuti.

## Features

- Academic calendar.
- Course events.
- Exam schedule.
- Assignment deadline.
- Project milestone.
- In-app notification.
- Read/unread.
- Scheduled reminders.

## Exit criteria

Calendar tidak menduplikasi data deadline; event dapat berasal dari entity sumber.

---

# Phase 12 — Admin & Reporting

## Goal

Operasional sekolah dapat dipantau tanpa query manual.

## Features

- Attendance summary.
- Completion summary.
- Grade export.
- Course activity status.
- Student progress overview.
- Audit explorer.
- Storage usage basic report.

Avoid building a data warehouse at this phase.

---

# Phase 13 — Production Hardening

## Goal

Siap digunakan rutin.

## Features

- Backup automation.
- Restore procedure.
- Restore drill.
- Rate limiting where needed.
- File quota.
- Security headers.
- Session hardening.
- Query profiling.
- DB indexes.
- Structured log.
- Disk usage alert.
- Health/readiness endpoint.
- Load testing.
- WLAN exam simulation.

---

# Phase 14 — LAN Production Migration

## Goal

Memindahkan deployment utama dari VPS ke server lokal.

## Recommended server baseline

- 4+ CPU cores.
- 8 GB RAM minimum.
- SSD/NVMe.
- UPS.
- Gigabit LAN.
- Regular external backup.

## Work

- DNS.
- HTTPS.
- Caddy/reverse proxy.
- PostgreSQL migration.
- File migration.
- Backup target.
- Monitoring.
- Failover/manual recovery runbook.

---

# Phase 15 — Advanced IT Learning

Dikerjakan setelah core stabil.

## Candidates

- Coding challenge.
- Code editor.
- Test case runner.
- Container-isolated execution.
- No-network execution environment.
- CPU/RAM/time limits.
- Coding badge.
- Code/project review.

Main application **tidak boleh** mengeksekusi untrusted student code secara langsung.

---

# Phase 16 — Optional Smart Classroom

Hanya bila benar-benar dibutuhkan:

- Camera-assisted attendance improvements.
- Device presence.
- Classroom kiosk.
- Face recognition feasibility study.

Face recognition membutuhkan privacy, consent, retention, security, false-match, and operational review sebelum implementasi.
