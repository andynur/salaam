# Engineering Rules & Definition of Done

## 1. General rules

- TypeScript strict.
- Prefer explicit, boring code over clever abstraction.
- No dependency without justification.
- No microservice without measured need.
- No ORM in baseline.
- No Redis in V1.
- No business logic inside React components.
- No permission logic only in frontend.
- No silent catch of important error.
- No `any` except narrow justified boundary.

## 2. API rules

- Validate input.
- Return consistent error shape.
- Verify authorization server-side.
- Avoid exposing stack traces.
- Use request ID.
- Idempotency for operations prone to duplicate requests.
- Pagination for potentially large lists.

## 3. Database rules

- Use transaction around multi-table invariant.
- Parameterized queries only.
- Foreign keys.
- Unique constraints for real uniqueness.
- Database constraint complements application validation.
- New migration for schema changes.
- Index only when query pattern supports it.

## 4. Frontend rules

Every data page handles:

- loading,
- empty,
- error,
- success.

Every form handles:

- validation,
- pending submit,
- server error,
- duplicate-submit prevention.

## 5. Tests

Required mix grows with feature risk.

### Unit

Business rules.

### Integration

Repository/database/service.

### HTTP

Critical endpoints.

### E2E or browser flow

Use selectively for:

- login,
- exam attempt,
- submission,
- attendance scan,
- publish grade.

## 6. Critical exam tests

Must include:

- reload,
- offline/reconnect,
- duplicate submit,
- stale answer conflict,
- timer expiration,
- permission boundary,
- multi-user concurrency.

## 7. Security checklist per PR/task

- auth?
- authorization?
- input validation?
- output escaping?
- sensitive log?
- file path?
- replay/duplicate?
- rate-sensitive endpoint?
- audit event?

## 8. Definition of Done

Feature is done only when:

- acceptance criteria pass;
- tests added/updated;
- targeted tests pass;
- typecheck pass;
- build pass;
- migration tested if relevant;
- permission reviewed;
- error/empty/loading UI handled;
- documentation updated when behavior/architecture changes;
- no unnecessary dependency introduced;
- no known critical TODO hidden.

## 9. ADR rule

Create lightweight ADR only for decisions with meaningful long-term cost, for example:

- switching storage backend,
- adding Redis,
- adopting ORM,
- changing auth model,
- introducing queue,
- splitting service,
- adding face recognition,
- introducing code-runner architecture.

Do not create ADR for trivial UI decisions.
