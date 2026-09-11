# tests — conventions

- Tests use `bun:test`. `*.test.ts` files are unit tests without a database.
  `*.integration.test.ts` files use PostgreSQL inside
  `describe.skipIf(!process.env.TEST_DATABASE_URL)`.
- Integration setup (copy it from the nearest phase file): create a random schema, open
  `new SQL(url, { max: 4, connection: { search_path: schema } })`, run `migrate(db)` and
  `bootstrapAdmin`, build `createHttpHandler` with the real routers and
  `loadConfig({ …, NODE_ENV: "test" })`, create users with `createUser`, and log in through
  `/api/auth/login` to get a cookie. Drop the schema in `afterAll`.
- Exercise behavior through the HTTP handler with the `origin` header. Check status codes,
  response bodies, and audit rows.
- For each feature, cover: 403 without the capability and 404 outside scope, validation,
  idempotent retries, 409 on stale or concurrent conflicts, rollback when the audit write
  fails, and a 125-student concurrent run for heavy student flows.
- Bun SQL queries are lazy. Await them inside an async function before passing the promise
  to `expect(...).rejects`.
- Write uploads under `.test-artifacts/` and remove them afterwards.
- `database.integration.test.ts` expects the latest migration name in its rollback test;
  update it with every new migration.
