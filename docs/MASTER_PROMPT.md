# MASTER PROMPT — Learning OS Initial Setup

> Historical record: this is the original setup prompt, written when the product was
> named Learning OS. The product is now **SALAAM**; see `docs/REBRANDING.md`.

Copy the prompt below into Codex from the root folder that will become the repository.

---

You are the primary implementation agent for a new internal school platform named **Learning OS**.

Your job in this task is to create the **initial production-minded foundation only**. Do not attempt to build the full LMS in one turn.

## 1. Working mode

Act as an implementation agent, not an advisor.

- Inspect the current directory first.
- If the directory is empty, initialize the project.
- If files already exist, preserve user work and adapt carefully.
- Continue until the foundation described below is implemented and validated.
- Do not stop after writing a plan.
- Keep progress updates short and only report meaningful milestones or blockers.
- Do not dump full source files into chat unless asked.
- At completion, report:
  1. what was created/changed,
  2. commands/tests run,
  3. any real unresolved risk,
  4. the next recommended roadmap task.

Do not ask routine questions that can be resolved safely from this specification.

## 2. Read project planning context

If these files exist, read them selectively before implementation:

- `docs/00_README.md`
- `docs/01_PRODUCT_VISION_AND_SCOPE.md`
- `docs/02_ARCHITECTURE_AND_STACK.md`
- `docs/03_MASTER_ROADMAP.md`
- `docs/05_DATA_SECURITY_RELIABILITY.md`
- `docs/06_UI_UX_DESIGN_SYSTEM.md`
- `docs/08_CODEX_VSCODE_HARNESS.md`
- `docs/09_ENGINEERING_RULES_AND_DOD.md`

Do not repeatedly reread all documents after you have the required context.

If `AGENTS_TEMPLATE.md` exists and root `AGENTS.md` does not, create root `AGENTS.md` from it, correcting paths if needed.

## 3. Product

Learning OS is an internal HSI Boarding School application for:

- course/module/lesson,
- assignment/quiz/exam/form/challenge,
- student projects and Kanban,
- portfolio/showcase,
- gamification,
- attendance,
- calendar,
- classroom operations.

The long-term product is broad, but **this task is Foundation Phase 0 only**.

## 4. Fixed architecture

Use a **modular monolith**.

Baseline:

- Bun 1.4.2
- TypeScript with strict checks
- React
- Tailwind CSS
- `Bun.serve()` for HTTP
- PostgreSQL through native `Bun.SQL`
- native Bun WebSocket later when required
- Bun file/image/password capabilities where relevant
- local filesystem storage initially

### Do not add by default

- Express
- Hono
- Elysia
- NestJS
- Next.js
- Prisma
- Drizzle
- Sequelize
- TypeORM
- Redis/Valkey
- BullMQ
- RabbitMQ
- Kafka
- Elasticsearch
- microservices

Do not use a framework merely to make scaffolding easier.

If current Bun 1.4.2 native full-stack HTML/React build support is practical and stable for this setup, prefer it.

If a tiny amount of build glue is required, use Bun's native bundler/build pipeline.

Do **not** introduce Vite unless you encounter a concrete limitation that cannot be reasonably solved with Bun's supported build workflow. If such a limitation exists, document it before adding another build dependency.

## 5. Dependency policy

Before adding any dependency:

1. check whether Bun, browser APIs, React, Tailwind, or PostgreSQL already solve it;
2. inspect dependencies already present;
3. prefer no dependency when a small safe implementation is reasonable;
4. for security-sensitive functionality, prefer proven primitives over homegrown crypto/security;
5. avoid large transitive dependency trees.

At the end, explain every direct production dependency in one short table in the README.

## 6. Initial repository structure

Create a clean baseline similar to:

```text
src/
  core/
    auth/
    config/
    database/
    errors/
    audit/
    events/
    files/
    permissions/
    realtime/

  modules/
    users/
    academic/
    courses/
    activities/
    assessment/
    attendance/
    projects/
    portfolio/
    gamification/
    calendar/
    notifications/

  web/
    components/
    layouts/
    pages/
    styles/
    lib/

  jobs/
  server.ts

database/
  migrations/
  seed/

storage/
  .gitkeep

tests/

docs/
```

Do not create dozens of empty placeholder files. Create directories only where useful now; future modules can remain documented rather than filled with fake implementations.

## 7. Foundation features to implement now

Implement only the following.

### 7.1 Configuration

Create a typed configuration layer.

Validate required environment variables at startup.

At minimum plan for:

- app environment,
- host,
- port,
- database URL,
- session secret or equivalent secure session configuration,
- storage root,
- application base URL,
- school timezone.

Provide `.env.example`.

Never commit secrets.

### 7.2 HTTP server

Create Bun server with:

- app bootstrap,
- request ID,
- centralized error handling,
- JSON error shape,
- `/health/live`,
- `/health/ready`,
- static/frontend serving through the chosen Bun-native build approach,
- safe default headers where appropriate.

Readiness should perform only a lightweight DB check.

### 7.3 PostgreSQL

Use native `Bun.SQL`.

Create:

- connection module,
- conservative pooling suitable for a 2 GB VPS,
- transaction helper if helpful,
- migration table,
- migration runner,
- first migration.

Do not install an ORM.

Migration system can be simple and explicit.

### 7.4 Minimal identity schema

The first migration may establish the core needed for future auth:

- users,
- roles,
- permissions,
- user_roles,
- role_permissions,
- sessions if using DB-backed sessions,
- audit_logs.

Keep schema practical; do not over-model future school entities yet.

Use database constraints.

### 7.5 Authentication foundation

Implement a minimal secure login/session foundation sufficient to prove the architecture.

Requirements:

- password hash via Bun secure password API / Argon2id,
- HttpOnly cookie,
- Secure in production,
- sensible SameSite,
- session expiry,
- logout/revocation,
- server-side authorization helper.

Do not store auth token in browser localStorage.

A development seed admin mechanism may be added, but it must be explicit and safe and must never ship with a hard-coded password.

### 7.6 React shell

Create the first application shell.

Teacher/admin-oriented baseline:

- top bar,
- left navigation,
- content area.

Student dashboard can remain only a route/shell placeholder if user-role routing is not yet required for foundation.

Use HSI visual direction:

- white,
- navy,
- blue,
- golden accent,
- Jira-inspired information hierarchy,
- not a Jira clone.

Set up design tokens.

Create only a small primitive set needed for the shell.

### 7.7 Error/loading states

Provide a basic reusable pattern for:

- loading,
- empty state,
- error state.

### 7.8 Logging

Create lightweight structured logging.

Include:

- timestamp,
- level,
- request id,
- event/message.

Do not log:

- password,
- session secret,
- full session token,
- sensitive form contents.

Do not add a heavyweight logging platform.

### 7.9 Tests

Set up Bun tests.

At minimum test:

- config validation,
- health/live,
- critical database/migration helper where practical,
- password/auth helper,
- permission helper.

Database integration tests can require a test DB, but commands and setup must be documented.

### 7.10 Scripts

Create stable scripts for:

```bash
bun run dev
bun test
bun run typecheck
bun run build
bun run start
bun run db:migrate
```

If useful:

```bash
bun run db:seed
```

Keep scripts obvious.

## 8. UI foundation requirements

Create design variables/tokens rather than scattering raw colors.

Suggested initial token direction:

```text
navy       #0B1F3A
blue       #1D5FD1
blue-soft  #EAF2FF
gold       #EAB308
gold-soft  #FFF8D6
surface    #FFFFFF
background #F7F8FA
border     #DFE1E6
text       #172B4D
muted      #5E6C84
```

You may adjust small details for contrast/accessibility.

UI requirements:

- keyboard-visible focus,
- semantic HTML,
- responsive enough for laptop/tablet,
- no arbitrary one-off colors,
- no giant component library unless explicitly approved later.

## 9. Initial page

After successful login, create a simple dashboard shell that proves the design system.

Show placeholder-but-real layout such as:

- page title,
- academic/course summary cards,
- "Today's Tasks" empty state,
- upcoming calendar empty state.

Do not invent fake production statistics.

Clearly mark seed/demo content if any.

## 10. Security rules

Enforce from the start:

- parameterized SQL,
- server-side authorization,
- generated storage paths,
- safe error messages,
- no secrets in logs,
- secure password hash,
- secure cookie behavior,
- no direct public exposure of private uploads,
- no use of `eval` or execution of user code.

Add a short security section to README.

## 11. Codex harness setup

Optimize this repo for future Codex work.

### Root AGENTS.md

Keep root `AGENTS.md` concise.

It should contain:

- product identity,
- stack,
- architecture constraints,
- canonical commands,
- dependency policy,
- security invariants,
- Definition of Done,
- docs map.

Do **not** copy the entire roadmap into AGENTS.md.

### Docs-on-demand

Keep detailed architecture and roadmap in `/docs`.

Future agents should be instructed to read only task-relevant docs.

### Prompt pattern

Add a small section in README showing this future task format:

```md
## Goal
...

## Context
Read:
- ...

## Scope
- ...

## Out of scope
- ...

## Acceptance criteria
- ...

## Constraints
- ...
```

### Context efficiency rules

Encode these in AGENTS.md:

- inspect relevant files rather than reading entire repo;
- search for existing pattern before creating new helper/component;
- do not load every doc for every task;
- do not output entire file contents unless requested;
- use targeted tests first;
- keep task changes reviewable/commit-sized;
- mention adjacent improvements without implementing them unless requested.

### Model usage

Do not hard-code a fast-changing Codex model name in repo configuration.

Use the current recommended Codex coding model selected by the user/IDE.

If reasoning effort is selectable:

- low for trivial/mechanical work,
- medium as normal default,
- high for architecture/security/migration/race-condition/debugging tasks.

Do not spend high reasoning on routine formatting/copy changes.

### Approval and sandboxing

Do not weaken Codex sandbox or approval boundaries as part of project setup.

Prefer normal workspace-scoped write access.

Do not add broad network/tool permissions unless required for a concrete task.

## 12. README

Create a concise but useful project README containing:

- what the system is,
- architecture summary,
- prerequisites,
- setup,
- environment,
- database setup,
- migrations,
- development,
- testing,
- production build,
- deployment note,
- security note,
- dependency rationale,
- roadmap pointer.

Do not paste every planning document into README.

## 13. Git hygiene

Create/update `.gitignore`.

Ignore:

- env secrets,
- build output,
- node_modules,
- runtime storage contents except `.gitkeep`,
- logs,
- local DB/test artifacts,
- OS/editor junk.

Do not ignore planning docs.

If Git is initialized, inspect status before and after work.

Do not rewrite unrelated user changes.

## 14. Definition of Done for this initial task

Do not declare completion until all feasible items below are true:

- project installs with Bun;
- TypeScript checks;
- Bun tests pass;
- production build succeeds;
- server can start;
- liveness route works;
- readiness logic is implemented;
- migration runner exists;
- initial migration exists;
- auth/session foundation exists;
- basic React shell renders;
- AGENTS.md exists and is concise;
- README documents setup;
- no unnecessary framework/ORM/cache dependency was added.

If PostgreSQL is unavailable in the local agent environment, do not fake a successful database test. Implement the code, test non-DB parts, document the exact DB command needed, and clearly report that the integration test was not executed.

## 15. Scope stop

After foundation is complete, STOP.

Do not automatically implement:

- full course system,
- activity builder,
- exam UI,
- Kanban,
- gamification,
- QR attendance,
- face recognition,
- code runner.

Recommend **Phase 1 — Core Identity & Academic Foundation** as the next task.

Begin by inspecting the repository and available planning files, then implement the foundation.
