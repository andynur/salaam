# Product Vision & Scope

## 1. Product statement

**HSI Learning OS** adalah platform internal HSI Boarding School untuk mengelola pembelajaran dan aktivitas akademik dalam satu sistem yang ringan, cepat, mudah dipelihara, dan dapat berjalan baik di jaringan lokal sekolah.

Platform menggabungkan konsep LMS, task/project management, portfolio, gamification, classroom attendance, dan academic workflow.

## 2. Primary users

### Student

Kebutuhan utama:

- Melihat pembelajaran hari ini.
- Melanjutkan lesson terakhir.
- Mengumpulkan tugas.
- Mengerjakan quiz/exam.
- Menjalankan challenge.
- Melihat project dan Kanban.
- Melihat progress, XP, level, badge.
- Membangun portfolio.
- Melihat kalender dan deadline.

### Teacher / Mentor

Kebutuhan utama:

- Membuat dan mengelola course.
- Membuat activity.
- Menggunakan question bank.
- Memberi nilai dan feedback.
- Mengelola attendance.
- Melihat progress siswa.
- Mengelola project/team/Kanban.
- Memilih project untuk showcase.
- Melihat classroom activity secara realtime.

### Academic/Admin

Kebutuhan utama:

- Academic year/term.
- Student/class management.
- Course assignment.
- Kalender akademik.
- Permission dan role.
- Audit log.
- System configuration.
- Backup/restore status.

### Super Admin

Hak akses sistem penuh, tetapi tetap tercatat pada audit log.

## 3. Product pillars

### Learning

Course → Module → Lesson → Activity.

### Assessment

Question bank → Attempt → Answer → Grade → Feedback.

### Project Learning

Challenge → Project → Team → Kanban → Review → Showcase.

### Student Growth

Activity/Project events → XP → Level → Badge → Portfolio.

### Classroom Operation

Meeting → Attendance → Calendar → Realtime status.

## 4. One Activity Engine

Jangan membuat mesin terpisah untuk:

- Assignment
- Quiz
- Exam
- Survey
- Questionnaire
- Challenge

Semua menggunakan satu aggregate `Activity`.

Perbedaan ditentukan oleh konfigurasi:

- `activity.type`
- availability
- attempts
- timer
- question/item types
- grading mode
- randomization
- anonymity
- submission type
- reward rules

Contoh:

| Type | Grading | Attempt | Timer | Reward |
|---|---|---:|---|---|
| Assignment | Manual/Rubric | configurable | optional | optional |
| Quiz | Auto + manual | configurable | optional | optional |
| Exam | Auto + manual | usually 1 | usually yes | normally no |
| Survey | none | configurable | no | no |
| Challenge | auto/manual | configurable | optional | yes |

## 5. Product boundaries V1

### Masuk V1

- Authentication/session.
- User, role, permission.
- Academic structure.
- Course/module/lesson.
- Assignment + simple quiz.
- Submission/attempt.
- Grading.
- Attendance per meeting.
- Project + simple Kanban.
- Showcase.
- Basic portfolio.
- XP/level/badge.
- Calendar.
- Notification foundation.
- Audit log.
- Backup basics.

### Tidak masuk V1

- Face recognition.
- Chat/video conference.
- Complex parent portal.
- AI grading.
- Full-feature spreadsheet-like form builder.
- Online judge/container code runner.
- Advanced analytics warehouse.
- Multi-tenant SaaS.
- Microservices.
- Distributed cache.
- Elasticsearch.

## 6. UX principle

**Teacher UI:** productive, information-dense, Jira-inspired.

**Student UI:** task-oriented, simplified, progress-focused.

Hindari membuat UI siswa sepadat admin dashboard.

## 7. Success metrics

Minimal indikator yang perlu dipantau:

- Course completion rate.
- Assignment on-time rate.
- Quiz/exam completion.
- Attendance rate.
- Active project count.
- Challenge completion.
- Student portfolio completion.
- Error rate saat exam.
- Autosave success/failure.
- Median API latency.
- Backup success.
- Restore drill success.

## 8. Capacity target

Baseline:

- 50–125 concurrent students.
- Development/pilot server: 2 vCPU / 2 GB RAM.
- Production LAN server recommended target: 4+ CPU core, 8 GB RAM, SSD/NVMe, UPS, wired Gigabit backbone.

Optimize for correctness and WLAN reliability before micro-optimizing raw request throughput.
