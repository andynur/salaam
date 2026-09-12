# Phase 19 — Assessment marking

## Scope decisions

Assessment authors choose one marking mode per quiz or exam: all-or-nothing, partial
credit, or negative marking. Partial credit awards points proportional to correct choices
selected and ignores unselected correct choices. Negative marking uses the same proportional
credit and subtracts 25% of the question points per incorrect selected choice, never below
zero. The policy is snapshotted on each attempt question.

## Delivered behavior

Choice questions are scored by the server when an attempt is submitted or expires. Existing
all-or-nothing assessments retain their behavior. The selected mode is visible in the teacher
editor and assessment settings; students see the resulting score but never receive answer
keys before the existing result-visibility rules allow them.

No new capability is needed. Existing attempt locks, append-only score adjustments, audit
events, server-side scoring, and course scope rules remain authoritative.

## Verification

Migration `0017_assessment_marking.sql` has a matching down script. Unit and PostgreSQL
integration tests cover policy validation, partial scoring, negative scoring, score bounds,
and legacy all-or-nothing compatibility. Typecheck and production build are required.

## Out of scope

Per-question custom penalty rates, weighted question pools, proctoring, and statistical
analytics remain deferred. Time extensions and accommodations are delivered in Phase 20.
