# Phase 14 — Academic lifecycle

Phase 14 closes the remaining safe identity and academic lifecycle gaps from Phase 1.

## Delivered

- Administrator profile editing for name, email, identifier, role, and active status.
- Role reassignment with guards for active academic relations and the last active admin.
- Class transfer within one academic year, with an immutable `class_transfers` history row.
- Archive and restore for academic years, terms, and classes instead of destructive deletion.
- Archived academic parents block new academic relationships and student course access.
- `/admin/transfers` and edit/archive actions in the existing administration UI.
- Migration `0012_academic_lifecycle.sql` with a matching down script.

## Rules

Profile changes, role changes, session revocation caused by identity changes, transfers, and
archive/restore actions are transactional and audited. Role changes are refused while the old
role still owns class enrollments or teaching assignments. A last active administrator cannot be
deactivated or demoted. Transfers do not rewrite attendance snapshots or attendance history.
Archived years cannot retain active terms; archived terms and classes cannot be used to create
new academic relationships. Restoring a child requires its academic year to be active.

## Out of scope

Self-service recovery, hard deletion, archived course content management, essays/rubrics, external
providers, biometrics, online-code execution, and multi-instance realtime remain deferred.

## Validation

Unit validation and PostgreSQL integration coverage verify profile/role guards, transfer history,
archive reversibility, archived relationship rejection, audit behavior, migration replay, and
rollback. UI build and responsive administration checks remain part of the release gate.
