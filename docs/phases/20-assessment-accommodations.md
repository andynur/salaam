# Phase 20 — Assessment accommodations

## Scope decisions

Teachers can grant one current, auditable time accommodation to an active student in a
timed quiz or exam. The grant adds 1–120 minutes and requires a reason. A deadline is
calculated from the immutable attempt start time, so saving the same grant again never
adds the minutes twice. When a closing window exists, the accommodated deadline is capped
at the original closing time plus the granted minutes.

## Delivered behavior

The accommodation may be granted before a student starts or while an attempt is open.
Before start, the extra time is applied when the attempt is created. During an open attempt,
the deadline is recalculated immediately. Submitted attempts are never reopened or changed.
The same grant is idempotent; changing it requires a new product decision and currently
returns a conflict to prevent silent changes to a live assessment. Course membership,
permission, timed-assessment type, input bounds, and audit logging are enforced server-side.
The teacher results table provides the action for open attempts.

## Verification

Migration `0018_assessment_accommodations.sql` has a matching down script. Unit tests cover
bounded input. PostgreSQL integration tests cover migration rollback, pre-start deadlines,
idempotency, stale-policy conflicts, membership boundaries, and audit records. Typecheck
and production build passed. Browser QA was attempted against a disposable database, but
the headless Chrome harness stopped before producing DOM checks; the phase therefore
remains In progress until the smoke run is repeatable.

## Out of scope

Multiple accommodation categories, document uploads, automatic disability-plan imports,
per-question accommodations, proctoring, and a dedicated roster picker remain deferred.
