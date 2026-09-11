# Architecture & Technology Stack

## 1. Architecture style

Gunakan **modular monolith**.

```text
Browser
  |
  | HTTP / WebSocket
  v
Bun Application
  |-- Web / React
  |-- API
  |-- Auth/RBAC
  |-- Activity Engine
  |-- Assessment
  |-- Attendance
  |-- Project/Kanban
  |-- Portfolio
  |-- Gamification
  |-- Notification
  |-- Jobs
  |
  +--> PostgreSQL
  +--> Local File Storage
```

Tidak ada alasan memakai microservices pada V1.

## 2. Required stack

### Runtime

- Bun **1.4.2** baseline.
- TypeScript.
- Bun package manager.
- Bun test runner.
- Bun bundler/build capabilities where practical.

### Backend

- `Bun.serve()`.
- Native Bun WebSocket.
- `Bun.SQL` for PostgreSQL.
- `Bun.password` with Argon2id.
- `Bun.file()` / `Bun.write()`.
- `Bun.Image` for image processing when required.
- Bun cron/scheduled job capability when appropriate.

### Frontend

- React.
- TypeScript.
- Tailwind CSS.
- Small custom component system.
- Minimal utility dependencies.
- Avoid large all-in-one UI framework.

### Database

- PostgreSQL.
- SQL migrations stored in source control.
- Repository/query layer around `Bun.SQL`.
- No ORM in V1 unless a later ADR proves a real need.

### Cache

V1:

```text
Application memory + PostgreSQL
```

Redis/Valkey only after measured need.

### Storage

V1:

```text
local filesystem
```

DB stores metadata/path/size/mime/hash/owner.

Future abstraction may support S3/MinIO.

## 3. Dependencies policy

Before adding dependency:

1. Does Bun/browser/PostgreSQL already provide it?
2. Is implementation security-sensitive?
3. Is the package actively maintained?
4. Is it materially simpler/safer than 20–100 lines of internal code?
5. What is the transitive dependency cost?

Good candidates for dependencies:

- Tailwind CSS.
- Validation library if clearly useful.
- Accessible primitive library only when needed.
- Icon package such as Lucide.

Avoid by default:

- Express.
- NestJS.
- Prisma.
- Sequelize.
- TypeORM.
- Redis.
- BullMQ.
- RabbitMQ.
- Kafka.
- Elasticsearch.
- Large UI suites.

This is a policy, not dogma. Any exception should be documented in an ADR.

## 4. Suggested source layout

```text
src/
  core/
    auth/
    database/
    permissions/
    events/
    files/
    realtime/
    audit/
    errors/
    config/

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
    features/
    layouts/
    pages/
    hooks/
    lib/
    styles/

  jobs/
  server.ts

database/
  migrations/
  seed/

storage/
tests/
docs/
```

## 5. Module boundary

Setiap module idealnya memiliki:

```text
module/
  domain/
  service/
  repository/
  http/
  schema/
  tests/
```

Jangan memaksakan Clean Architecture secara berlebihan. Tujuannya adalah boundary yang jelas, bukan folder ceremony.

## 6. Internal event bus

Gunakan event domain sederhana:

- `activity.completed`
- `assignment.submitted`
- `exam.submitted`
- `project.published`
- `challenge.completed`
- `attendance.checked_in`
- `grade.published`

Consumer:

- Gamification.
- Notifications.
- Analytics counters.
- Audit.
- Portfolio update.

Event dalam V1 dapat berjalan in-process. Event penting harus menghasilkan state yang transactional atau recoverable.

## 7. Database rules

- UUID/ULID strategy dipilih sekali dan konsisten.
- Semua timestamp disimpan UTC.
- Academic timezone ditampilkan sesuai konfigurasi sekolah.
- Foreign key aktif.
- Unique constraint untuk invariant penting.
- Index dibuat berdasarkan query nyata.
- JSONB hanya untuk configuration/flexible metadata, bukan menggantikan relational model.
- Soft-delete hanya untuk entity yang benar-benar memerlukannya.
- Audit log bersifat append-oriented.

## 8. Activity Engine entities

Minimal:

```text
activities
activity_items
activity_item_options
activity_assignments
activity_attempts
activity_answers
activity_submissions
activity_grades
rubrics
rubric_items
```

`activities.settings` dapat memakai JSONB untuk pengaturan type-specific tetapi field kritis tetap explicit.

## 9. Realtime

Gunakan WebSocket hanya untuk hal yang memang realtime:

- Attendance dashboard.
- Notifications.
- Teacher live classroom status.
- Optional project updates.

Jangan gunakan WebSocket untuk semua CRUD.

## 10. File pipeline

Upload:

```text
Request
 -> validate auth
 -> validate MIME/size
 -> safe generated filename
 -> write temporary file
 -> optional image transform
 -> hash/metadata
 -> atomic move
 -> DB record
```

Never trust original filename as storage path.

## 11. Horizontal scaling

Bukan kebutuhan V1.

Jika suatu hari application menjadi multi-instance:

- shared session/cache if needed,
- external pub/sub,
- object storage,
- job coordination.

Jangan menambah semua itu sebelum ada alasan operasional nyata.
