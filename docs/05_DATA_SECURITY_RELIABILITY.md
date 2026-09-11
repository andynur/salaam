# Data, Security & Reliability

## 1. Authentication

For internal web app prefer server-managed session cookies.

Cookie baseline:

- `HttpOnly`
- `Secure` in production
- appropriate `SameSite`
- short enough session exposure
- rotation on sensitive auth events

Passwords:

- hash with Bun password API / Argon2id.
- never log password.
- never store plaintext recovery data.

## 2. Authorization

Authentication is not authorization.

Every server operation must validate:

1. authenticated actor,
2. target resource,
3. required permission,
4. resource/course/class membership if relevant.

Never rely on hidden UI button as security.

## 3. CSRF/XSS

- Use safe cookie strategy.
- Apply CSRF mitigation appropriate to architecture.
- Escape user-generated content.
- Avoid raw HTML rendering.
- Sanitize rich text if rich text is introduced.
- Set security headers.

## 4. Exam reliability

### Client state

During active exam:

- current answers persisted locally using IndexedDB or appropriate browser storage;
- server autosave runs periodically/debounced;
- UI displays `saving / saved / offline`.

### Server state

- server time controls open/close/deadline.
- save answer endpoints idempotent where relevant.
- final submit is atomic/idempotent.
- attempt ownership is checked on every write.

### Reconnect

On reconnect:

1. fetch authoritative attempt status;
2. compare local pending changes;
3. sync safely;
4. never overwrite newer server data blindly.

## 5. File security

- allowlist supported MIME/type.
- max file size.
- generated filename.
- path traversal impossible.
- do not serve private upload as unrestricted static folder.
- permission-check download route or signed access mechanism.
- virus/malware scanning can be added when operationally feasible.

## 6. QR attendance security

QR student identifier should not be equivalent to account credential.

Server verifies:

- active attendance session,
- student enrollment,
- duplicate check,
- time window.

Attendance correction leaves audit history.

## 7. Privacy

Collect only data needed for schooling.

For camera/biometric feature in the future:

- define purpose,
- consent/policy,
- retention,
- storage,
- deletion,
- false match handling,
- manual alternative.

Do not add face recognition just because camera attendance exists.

## 8. Backups

Backup includes:

- PostgreSQL.
- uploaded files.
- critical configuration.

Recommended logical baseline:

- daily automated backup,
- retention tiers,
- copy to separate physical/device/location,
- periodic restore test.

Backup without restore test is not considered complete.

## 9. Audit-worthy actions

Examples:

- user/role changes,
- grade override,
- grade publication,
- attendance correction,
- exam attempt reset,
- course deletion/archive,
- student enrollment change,
- system settings.

## 10. Rate limiting

Apply selectively to:

- login,
- password/reset endpoints,
- QR scan,
- expensive exports,
- upload.

Do not introduce distributed rate-limit infrastructure until needed.

## 11. Threat model checklist

Before each major module ask:

- Who can read this?
- Who can change it?
- Can IDs be guessed?
- Can request be replayed?
- Can same request duplicate state?
- Can user upload dangerous content?
- Can browser disconnect halfway?
- Can teacher accidentally publish draft?
- Can admin action be traced?
- What happens after server restart?

## 12. Student code execution

Never execute student-submitted code directly in Bun app process.

Future code runner must have:

- separate isolated execution boundary,
- CPU limit,
- memory limit,
- timeout,
- no network by default,
- ephemeral filesystem,
- restricted syscalls/container profile,
- queue/worker architecture.
