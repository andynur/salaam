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

New records follow
[`.agents/skills/deliver-phase/phase-record-template.md`](../.agents/skills/deliver-phase/phase-record-template.md).
