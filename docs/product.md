# Product vision and scope

## Statement

SALAAM is the internal Learning & Growth Platform for HSI Boarding School, where students
learn, build, and grow rather than a narrow LMS. It combines learning workflows with project
learning, portfolios, gamification, classroom attendance, and academic administration in a
lightweight system that runs reliably on the school network. The name and its meaning are
described in [brand](brand.md).

## Users

### Students

- View the current learning plan and continue the latest lesson.
- Submit assignments and complete quizzes, exams, and challenges.
- Track progress, XP, levels, badges, projects, portfolios, calendars, and deadlines.

### Teachers and mentors

- Create courses and activities and use question banks.
- Grade work, give feedback, and manage attendance.
- Review student progress, projects, teams, Kanban boards, and classroom activity.
- Select projects for the showcase.

### Academic administrators

Manage academic years, terms, students, classes, course assignments, calendars, roles,
permissions, audit records, and backup status.

### System administrators

Broad access, with every sensitive action visible in the audit log.

## Pillars

- Learning: Course → Module → Lesson → Activity.
- Assessment: Question bank → Attempt → Answer → Grade → Feedback.
- Project learning: Challenge → Project → Team → Kanban → Review → Showcase.
- Student growth: Activity and project events → XP → Level → Badge → Portfolio.
- Classroom operations: Meeting → Attendance → Calendar → Realtime status.

## Principles

1. Start with a modular monolith, keep runtime dependencies minimal, and prefer native Bun
   capabilities before adding packages.
2. PostgreSQL is the source of truth. V1 needs no Redis or Valkey.
3. Private local storage is the initial storage boundary.
4. One Activity Engine serves assignments, quizzes, exams, surveys, questionnaires, and
   challenges. Type-specific behavior — availability, attempts, timers, question types,
   grading mode, randomization, anonymity, submission type, and reward rules — is
   configuration, so parallel implementations cannot drift apart.
5. Teacher and administrator screens are dense and productive, with Jira-inspired patterns.
   Student screens stay task-oriented, simple, and progress-focused.
6. Online exams survive reconnects.
7. Biometrics and face recognition stay outside the MVP.
8. Untrusted student code never runs in the main application process.
9. Security, auditability, backup, and restore are designed in from the beginning.

## V1 scope

V1 includes authentication and sessions, users and permissions, academic structure,
course/module/lesson foundations, simple assignments and quizzes, submissions and grading,
meeting attendance, projects and Kanban, showcases, basic portfolios, XP/levels/badges,
calendars, notification foundations, audit logs, and backup basics.

V1 excludes face recognition, chat or video conferencing, a complex parent portal, AI
grading, a spreadsheet-style form builder, an online judge or container runner, advanced
analytics warehousing, multi-tenant SaaS, microservices, distributed caches, and
Elasticsearch.

V1 is successful when a teacher can create a course, lesson, and activity; a student can
submit work safely; the teacher can grade it; progress and XP update; a project can enter
the showcase or a portfolio; attendance and calendar operations work; and audit and backup
workflows are available.

## Success metrics

Course completion, on-time assignment submission, quiz and exam completion, attendance,
active projects, challenge completion, portfolio completion, exam errors, autosave
reliability, API latency, backup success, and restore-drill success.

## Capacity target

The initial target is 50–125 concurrent students on a development or pilot server with
2 vCPUs and 2 GB RAM. A school production LAN should have at least four CPU cores, 8 GB RAM,
SSD/NVMe storage, UPS protection, and a wired Gigabit backbone. Correctness and WLAN
reliability come before throughput optimization.

## After V1

Promising ideas kept out of the committed V1 scope. Each needs a scoped proposal, a
security and privacy review, a migration plan, behavior tests, and operational acceptance
criteria before implementation.

- **Learning and assessment:** rich authoring and reusable lesson templates; advanced
  rubrics, moderation, and grade review; offline-first lessons and submissions; plagiarism
  or similarity review with an explicit privacy policy; carefully reviewed AI assistance
  for authoring or feedback.
- **Classroom operations:** a parent or guardian portal once access and consent
  requirements are defined; calendar integrations and notification delivery providers;
  more attendance workflows once the session model is stable; camera-assisted attendance
  improvements.
- **Platform:** backup automation and restore verification; metrics, tracing, and long-term
  audit retention policies; multi-instance deployment after measured capacity evidence;
  object storage behind the private storage interface; isolated coding challenge execution.
