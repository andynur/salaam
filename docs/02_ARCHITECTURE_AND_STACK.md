# Architecture and Stack

## Architecture

SALAAM is a modular monolith. Bun serves HTTP and WebSocket traffic, application
modules enforce domain rules, repositories use PostgreSQL through native `Bun.SQL`,
and React/Tailwind provide the web UI. V1 does not require a backend framework, ORM,
Redis, Valkey, or microservices.

## Runtime boundaries

- `src/core/`: configuration, HTTP, errors, logging, database, authentication, and permissions.
- `src/modules/`: domain services and repositories.
- `src/shared/`: data contracts shared by server and browser code.
- `src/web/`: pages, shell, UI primitives, and styles.
- `database/migrations/`: ordered SQL migrations.
- `storage/`: private application storage; never serve it as a public directory.

Use explicit service functions and parameterized SQL. Keep cross-table invariants in
transactions and enforce important invariants again with PostgreSQL constraints.

## Data conventions

Use UUID identifiers, UTC timestamps, and the configured school timezone for display.
Add unique constraints for business invariants and indexes based on real query paths.
Use JSONB only for flexible metadata or configuration. Use soft deletion only where
historical retention requires it.

## Activity domain

Assignments, quizzes, exams, surveys, and challenges use one Activity model with
type-specific configuration. Do not create separate activity engines.

## Realtime and scale

Use WebSocket only for genuinely realtime behavior such as classroom status and
attendance dashboards. Keep normal CRUD on HTTP. The initial deployment is a single
Bun process with PostgreSQL; add a broker or multi-instance coordination only when a
measured operational requirement exists.
