# Product Vision and Scope

## Product statement

SALAAM is the internal Learning & Growth Platform for HSI Boarding School, covering
learning and academic operations. It combines LMS workflows with project management, portfolios,
gamification, classroom attendance, and academic administration in a lightweight
system that can run reliably on the school network.

## Primary users

### Students

- View the current learning plan and continue the latest lesson.
- Submit assignments and complete quizzes, exams, and challenges.
- Track progress, XP, levels, badges, projects, portfolios, calendars, and deadlines.

### Teachers and mentors

- Create courses and activities and use question banks.
- Grade work, provide feedback, and manage attendance.
- Review student progress, projects, teams, Kanban boards, and classroom activity.
- Select projects for a showcase.

### Academic administrators

- Manage academic years, terms, students, classes, course assignments, calendars,
  roles, permissions, audit records, and backup status.

### System administrators

System administrators have broad access, but every sensitive action remains visible in
the audit log.

## Product pillars

- Learning: Course → Module → Lesson → Activity.
- Assessment: Question bank → Attempt → Answer → Grade → Feedback.
- Project learning: Challenge → Project → Team → Kanban → Review → Showcase.
- Student growth: Activity/project events → XP → Level → Badge → Portfolio.
- Classroom operations: Meeting → Attendance → Calendar → Realtime status.

## Activity Engine

Assignments, quizzes, exams, surveys, questionnaires, and challenges share one
`Activity` aggregate. Type-specific behavior is configuration: availability, attempts,
timers, question types, grading mode, randomization, anonymity, submission type, and
reward rules. This prevents parallel implementations that drift apart.

## V1 scope

V1 includes authentication and sessions, users and permissions, academic structure,
course/module/lesson foundations, simple assignments and quizzes, submissions and
grading, meeting attendance, projects and Kanban, showcases, basic portfolios,
XP/levels/badges, calendars, notification foundations, audit logs, and backup basics.

V1 excludes face recognition, chat/video conferencing, a complex parent portal,
AI grading, a spreadsheet-style form builder, an online judge or container runner,
advanced analytics warehousing, multi-tenant SaaS, microservices, distributed caches,
and Elasticsearch.

## UX principles

Teacher and administrator interfaces should be productive and information-dense, with
Jira-inspired patterns. Student interfaces should remain task-oriented, simple, and
progress-focused.

## Success metrics

Track course completion, on-time assignment submission, quiz/exam completion,
attendance, active projects, challenge completion, portfolio completion, exam errors,
autosave reliability, API latency, backup success, and restore-drill success.

## Capacity target

The initial target is 50–125 concurrent students on a development or pilot server with
2 vCPUs and 2 GB RAM. A school production LAN should target at least four CPU cores,
8 GB RAM, SSD/NVMe storage, UPS protection, and a wired Gigabit backbone. Correctness
and WLAN reliability take priority over premature throughput optimization.
