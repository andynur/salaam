# SALAAM documentation

Setup and commands are in the root [README](../README.md). Coding agents start from
[AGENTS.md](../AGENTS.md) and read only the documents their task needs.

| Document | Read when you need |
| --- | --- |
| [Product](product.md) | Users, principles, V1 scope, success metrics, capacity, post-V1 backlog |
| [Roadmap](roadmap.md) | Phase status, planned phases, deferred items |
| [Architecture](architecture.md) | Request flow, authorization, domain model, lifecycle and locking rules, web client, build |
| [Security](security.md) | Sessions, permissions, audit, request limits, headers, uploads, rules for planned features |
| [Operations](operations.md) | Deployment, configuration, reverse proxy, backups, rollout checklist |
| [DESIGN.md](../DESIGN.md) | UI tokens, components, CSS classes, interaction and accessibility rules |
| [Brand](brand.md) | Name, tagline, logos, icons, social preview |
| [Agent harness](agent-harness.md) | How `AGENTS.md`, `CLAUDE.md`, skills, and agent settings fit together |

## Phase records

Each record describes what the phase delivered, its API, verified behavior, validation
results, resolved findings, and out-of-scope items. Phases 1–6 also start with the user
workflow.

| Phase | Record |
| --- | --- |
| 0 — Foundation | [phases/00-foundation.md](phases/00-foundation.md) |
| 1 — Identity & academic foundation | [phases/01-identity-academic.md](phases/01-identity-academic.md) |
| 2 — Learning core | [phases/02-learning-core.md](phases/02-learning-core.md) |
| 3 — Assessment engine | [phases/03-assessment-engine.md](phases/03-assessment-engine.md) |
| 4 — Project learning | [phases/04-project-learning.md](phases/04-project-learning.md) |
| 5 — Gamification | [phases/05-gamification.md](phases/05-gamification.md) |
| 6 — Attendance & classroom sessions | [phases/06-attendance.md](phases/06-attendance.md) |
| 7 — QR attendance | [phases/07-qr-attendance.md](phases/07-qr-attendance.md) |
| 8 — Calendar & notifications | [phases/08-calendar-notifications.md](phases/08-calendar-notifications.md) |
| 9 — Reporting | [phases/09-reporting.md](phases/09-reporting.md) |
| 10 — Advanced IT learning boundary | [phases/10-advanced-it-learning.md](phases/10-advanced-it-learning.md) |
| 11 — Advanced attendance operations | [phases/11-advanced-attendance.md](phases/11-advanced-attendance.md) |
| 12 — Pilot readiness and operational hardening | [phases/12-pilot-readiness.md](phases/12-pilot-readiness.md) |
| 13 — Academic operations | [phases/13-academic-operations.md](phases/13-academic-operations.md) |
| 14 — Academic lifecycle | [phases/14-academic-lifecycle.md](phases/14-academic-lifecycle.md) |
| 15 — Submission lifecycle | [phases/15-submission-lifecycle.md](phases/15-submission-lifecycle.md) |
| 16 — Written assessment grading | [phases/16-written-assessment-grading.md](phases/16-written-assessment-grading.md) |
| 17 — Assessment rubrics | [phases/17-assessment-rubrics.md](phases/17-assessment-rubrics.md) |
| 18 — Surveys and questionnaires | [phases/18-surveys-questionnaires.md](phases/18-surveys-questionnaires.md) |
| 19 — Assessment marking | [phases/19-assessment-marking.md](phases/19-assessment-marking.md) |
| 20 — Assessment accommodations | [phases/20-assessment-accommodations.md](phases/20-assessment-accommodations.md) |
| 21 — Question bank import and export | [phases/21-question-import-export.md](phases/21-question-import-export.md) |
| 22 — Assessment question pools | [phases/22-assessment-question-pools.md](phases/22-assessment-question-pools.md) |
| 23 — Question statistics | [phases/23-question-statistics.md](phases/23-question-statistics.md) |
| 24 — Project task metadata | [phases/24-project-task-metadata.md](phases/24-project-task-metadata.md) |
| 25 — Project task comments | [phases/25-project-task-comments.md](phases/25-project-task-comments.md) |
| 26 — Project file deliverables | [phases/26-project-file-deliverables.md](phases/26-project-file-deliverables.md) |
| 27 — Reporting trends | [phases/27-report-trends.md](phases/27-report-trends.md) |
| 28 — Attendance roster adjustments | [phases/28-attendance-roster-adjustments.md](phases/28-attendance-roster-adjustments.md) |
| 29 — QR attendance breakdown | [phases/29-qr-attendance-breakdown.md](phases/29-qr-attendance-breakdown.md) |
| 30 — QR check-in import | [phases/30-qr-checkin-import.md](phases/30-qr-checkin-import.md) |
| 31 — Student-visible leaderboard | [phases/31-student-leaderboard.md](phases/31-student-leaderboard.md) |
| 32 — Club management | [phases/32-club-management.md](phases/32-club-management.md) |

New records follow
[`.agents/skills/deliver-phase/phase-record-template.md`](../.agents/skills/deliver-phase/phase-record-template.md).
