# Data Security and Reliability

## Identity and sessions

Use Argon2id password hashing, opaque server-managed cookies, absolute expiry, session
rotation, logout revocation, generic login errors, and rate limits. Never log
passwords, cookies, session tokens, or raw database errors.

## Authorization and audit

Enforce permissions on the server for every protected route. A role name alone must
never bypass a permission check. Record sensitive identity, academic, grading, and
attendance mutations transactionally. If the audit write fails, roll back the mutation.

## Input and database safety

Use parameterized SQL, strict JSON validation, bounded request bodies, explicit date and
identifier validation, foreign keys, unique constraints, and transaction-scoped locks.
Never trust user-provided filenames or paths.

## Attendance and QR security

Attendance must reference an explicit meeting/session. QR values must be short-lived,
opaque, server-validated, and unusable as authentication credentials. Corrections must
remain visible in audit history.

## Backups and recovery

Back up PostgreSQL and private storage to a separate location, encrypt backup access,
monitor job status, and run restore drills before production use. Define retention and
recovery objectives before enabling destructive cleanup.

## Operational limits

Local validation does not replace HTTPS proxy review, load testing, backup/restore
drills, or school-specific privacy and retention approval.
