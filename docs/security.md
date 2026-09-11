# Security and reliability

The security model as implemented, plus the requirements for features not built yet.
Local validation does not replace an HTTPS proxy review, load testing, backup and restore
drills, or school approval of privacy and retention policies.

## Identity and sessions

- Passwords are hashed with Argon2id through `Bun.password`. Login errors are generic.
- A session token is 32 random bytes in base64url. Only its SHA-256 hash is stored in
  `sessions`, with an absolute expiry of `SESSION_TTL_HOURS` (1–168, default 12). No signing
  secret exists.
- The cookie is `HttpOnly; SameSite=Lax; Path=/` with `Max-Age`, plus `Secure` in
  production. Login issues a new token and removes the user's expired sessions; logout
  revokes the session. Tokens never go to `localStorage`.
- Login allows 10 attempts per socket IP per 15 minutes and at most two concurrent password
  checks. Behind a proxy every client shares one address, so configure per-client
  throttling at the proxy; forwarded IP headers are not trusted.
- No default account ships. The first administrator comes from `db:bootstrap-admin`, which
  is serialized and refuses when an administrator exists, or from the development-only
  `db:seed`.

## Authorization and audit

- Every protected route checks a capability on the server, and role names never bypass it.
  Scope checks return 404 outside the actor's courses, projects, and enrollments.
- Identity, academic, authoring, publishing, archiving, submission, grading, assessment,
  and project decisions call `recordAudit` in the same transaction, so a failed audit write
  rolls the change back. Events store actor, event, resource, and request ID, never
  passwords, hashes, or tokens. An event without an actor is a system action such as
  deadline finalization.
- Kanban card edits are working notes and are not audited.
- XP is awarded inside the transaction that records the event it rewards, so a rolled back
  completion, grade, attempt, or review awards nothing. Individual ledger entries are not
  audited separately — the append-only ledger is itself the record — while each badge award
  is audited as a system action. Reward rules and the badge catalogue are administration:
  they require `academic.manage` and every change is audited. Changing a rule never rewrites
  past entries, so a student's history stays explainable.

## Request safety

- Non-GET API requests require `Origin` to equal `APP_BASE_URL` and reject
  `Sec-Fetch-Site: cross-site`.
- JSON bodies require `application/json` and are capped before parsing: 4 KiB for login and
  administration, 64 KiB for learning and project routes. Multipart is accepted only on the
  upload routes, with a single `file` field. The server-wide body limit is 10.25 MB.
- SQL uses tagged-template parameters only; raw SQL is limited to version-controlled
  migration files. Identifiers, dates, and enumerations are validated explicitly, and
  constraints back every rule.
- Errors return a code, an Indonesian message, and a request ID. Raw database errors and
  stack traces never reach the client.

## HTTP headers

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
and, in production, `Strict-Transport-Security`. API responses add `Cache-Control: no-store`.
The HTML shell adds a Content-Security-Policy that allows only same-origin scripts, styles,
and connections plus `data:` images, and forbids framing, plugins, and foreign form targets.

## Files

- Allowed uploads are PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, and ZIP, from 1 byte to
  10 MB. The extension must match the leading bytes, and TXT must be valid UTF-8 without NUL
  bytes. The browser-supplied media type is ignored.
- Bytes are stored under generated paths. The original name, with control characters and
  path components removed, is display metadata only.
- Downloads repeat the access checks and are sent as `attachment` with
  `Content-Security-Policy: sandbox; default-src 'none'`, `nosniff`, and `no-store`.
- There is no malware scanning or inline preview yet.

## Assessment integrity

The server clock fixes every attempt's deadline. A database constraint requires an exam to
have exactly one attempt, a time limit, and a closing time. Attempts snapshot questions and
answer keys; keys reach students only when results are visible. Autosave accepts only a
higher revision, and final submission is idempotent.

## Logging

Each log entry is one JSON line with allowlisted fields: timestamp, level, event, request
ID, status, and duration. Never log request bodies, cookies, tokens, passwords, or raw SQL
errors.

## Requirements for planned features

- **Attendance** always references a defined meeting session, and corrections stay visible
  in the audit history.
- **QR attendance** values are short-lived, opaque, validated on the server, and never
  usable as login credentials.
- **Coding challenges** run only behind a separate execution boundary with resource limits,
  a network policy, and review. The application process never executes student code.
- **Biometrics and face recognition** stay outside V1.

## Backups and recovery

Back up PostgreSQL and `STORAGE_ROOT` together to a separate location, restrict and encrypt
backup access, monitor job status, and run restore drills before production use. Define
retention and recovery objectives before enabling destructive cleanup. See
[operations](operations.md).
