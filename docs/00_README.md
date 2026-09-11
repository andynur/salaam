# Learning OS — Planning Pack

This directory is the planning baseline for Learning OS, an HSI Boarding School
platform for learning, assessment, project-based learning, gamification, portfolios,
attendance, and classroom operations.

The technical baseline is Bun 1.4.2, TypeScript, React, Tailwind CSS, PostgreSQL via
`Bun.SQL`, `Bun.serve()`, native WebSocket support, private local storage, and an
initial Ubuntu Server deployment target.

## Product goals

Learning OS is a school learning operating system rather than a narrow LMS. The
planned product brings together courses, activities, submissions, grading, projects,
portfolios, XP and badges, calendars, attendance, notifications, auditability,
backups, and future isolated coding challenges.

The product follows these principles:

1. Start with a modular monolith.
2. Keep runtime dependencies minimal.
3. Prefer native Bun capabilities before adding packages.
4. Treat PostgreSQL as the source of truth.
5. Do not require Redis or Valkey for V1.
6. Use private local storage as the initial storage boundary.
7. Share one Activity Engine across assignments, quizzes, exams, surveys, and challenges.
8. Keep teacher/admin screens dense and productive while keeping student screens focused.
9. Build reconnect resilience into online exams.
10. Keep biometrics and face recognition outside the MVP.
11. Never execute untrusted student code in the main application process.
12. Design security, auditability, backup, and restore from the beginning.

## Reading order

1. [Product vision and scope](01_PRODUCT_VISION_AND_SCOPE.md)
2. [Architecture and stack](02_ARCHITECTURE_AND_STACK.md)
3. [Master roadmap](03_MASTER_ROADMAP.md)
4. [Module and domain plan](04_MODULE_AND_DOMAIN_PLAN.md)
5. [Security and reliability](05_DATA_SECURITY_RELIABILITY.md)
6. [UI/UX design system](06_UI_UX_DESIGN_SYSTEM.md)
7. [Deployment and operations](07_DEPLOYMENT_AND_OPERATIONS.md)
8. [Codex/VS Code harness](08_CODEX_VSCODE_HARNESS.md)
9. [Engineering rules and Definition of Done](09_ENGINEERING_RULES_AND_DOD.md)
10. [Post-V1 backlog](10_BACKLOG_AFTER_V1.md)
11. [Agent instruction template](AGENTS_TEMPLATE.md)
12. [Initial setup prompt](MASTER_PROMPT.md)

## Working with the planning pack

Read only the documents relevant to the current task. Implement the roadmap one phase
at a time, and give each phase a specific goal, scope, acceptance criteria, and list of
relevant files or modules. Keep completed phases independently testable and reviewable.

## V1 success path

V1 is successful when a teacher can create a course, lesson, and activity; a student
can submit work safely; the teacher can grade it; progress and XP can be updated; a
project can enter a showcase or portfolio; attendance and calendar operations work;
and audit and backup workflows are available.

## Validation

- [Phase 0 validation](11_FOUNDATION_VALIDATION.md)
- [Phase 1 validation](12_PHASE1_VALIDATION.md)
