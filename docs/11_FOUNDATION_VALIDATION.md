# Foundation validation

Validated locally on 2026-09-11 with **Bun 1.4.2** and **PostgreSQL 17.9**.
The machine's global Bun was 1.4.0; validation used a project-local 1.4.2 binary
without modifying the global install. Use Bun 1.4.2 for subsequent work.

## Completed checks

- `bun install --frozen-lockfile`: successful, lockfile unchanged.
- `bun run typecheck`: passed.
- `TEST_DATABASE_URL=postgres://localhost:5432/hsi_learning_os_test bun test`:
  **24 passed, 0 failed, 88 assertions**; includes real PostgreSQL integration.
- `bun run db:migrate`: first migration applied to the new local app database;
  second invocation reported already up to date.
- `bun run db:seed`: temporary generated QA credentials created an admin; the
  account, its test audit rows, and credential file were removed after browser QA.
- `bun run build`: five production output files generated.
- `bun run dev`: started with native HTML/React/Tailwind bundling.
- `APP_BASE_URL=https://school.example PORT=3101 bun run start`: production bundle
  started from repository root. HTML, live, and ready returned 200; production
  HTML CSP/security headers were verified. Private storage and source URLs returned 404.
- Browser on prebuilt bundle with `NODE_ENV=test` and loopback HTTP: invalid-login
  feedback, successful login, dashboard empty states, session persistence after
  reload, and logout back to login all verified against the real local database.
- Rendered desktop, tablet (820 px), and phone (390 px) layouts inspected; tablet
  and phone had no horizontal overflow. Phone menu and keyboard focus verified.

## Findings resolved during validation

- Prebuilt Bun HTML manifests resolve asset paths relative to working directory.
  Bootstrap now resolves config/storage first, then selects the bundle directory.
- Bun SQL queries are lazy thenables. Constraint tests await SQL inside an async
  function before passing the resulting promise to rejection assertions.
- A password-manager extension triggered a ResizeObserver development overlay.
  Browser flow was completed on the prebuilt app without HMR; no application
  ResizeObserver is used and no application workaround was added for the extension.

## Boundaries

This is local foundation validation, not a school production deployment, HTTPS
browser session test, capacity benchmark, or backup/restore drill. Secure-cookie
attributes are unit-tested; full HTTPS reverse-proxy validation remains a deployment
step. Configure proxy per-client login throttling before real multi-user operation
(the app's socket-IP limiter sees a shared address behind a proxy).

Local databases `hsi_learning_os` and `hsi_learning_os_test` and ignored `.env` were
created. The application database has the identity schema and baseline roles/
permissions, with no remaining QA account. Seed your own development admin privately.

Next task: **Phase 1 — Core Identity & Academic Foundation**, as defined in
[the roadmap](03_MASTER_ROADMAP.md).
