# Phase 22 — Assessment question pools

## Scope decisions

An assessment may select a fixed number of questions randomly from its existing
`assessment_questions` pool. Pool selection happens at attempt start using the server's
cryptographic random source. All questions in a configured pool must have equal points so
the maximum score is deterministic. Existing assessments with no selection count retain
the fixed-list behavior.

## Delivered behavior

Teachers can set an optional selection count (1–100) in the assessment editor. The count
cannot exceed the configured pool when a student starts. The selected questions, options,
answer keys, points, and marking mode remain snapshotted in the attempt; later pool edits
are already blocked once an attempt exists. The assessment summary reports the deterministic
maximum for equal-point pools. Pool settings use existing assessment permissions, locks,
and no new capability.

## Verification

Migration `0020_assessment_question_pools.sql` has a matching down script. Unit and
PostgreSQL integration tests cover validation, migration rollback, equal-point enforcement,
pool-size bounds, selection counts, and legacy fixed-list compatibility. Typecheck and
production build are required before closing the phase.

## Out of scope

Weighted pools, category/tag quotas, adaptive selection, question statistics, per-student
preselected questions, and proctoring remain deferred.
