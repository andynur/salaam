# Engineering Rules and Definition of Done

## Engineering rules

Keep the modular-monolith boundaries explicit. Prefer native Bun and PostgreSQL
features. Do not add a framework, ORM, cache, or dependency without a documented
reason. Add a migration for schema changes and keep applied migrations immutable.

Enforce authorization on the server, hash passwords with Argon2id, use secure session
cookies, validate all input, and audit sensitive state changes. Do not execute untrusted
student code in the main process.

## Definition of Done

A change is complete when:

- Scope and out-of-scope behavior are documented.
- Server-side authorization and validation are covered.
- Database invariants are represented by constraints or transactions.
- Meaningful behavior tests pass.
- `bun test`, `bun run typecheck`, and `bun run build` pass when relevant.
- Loading, empty, error, retry, and success UI states exist for new data views.
- Documentation and migration history are updated.
- No credentials, private data, generated output, or unrelated cleanup is included.
