# Phase 29 — QR attendance breakdown

## Scope decisions

- QR metrics are derived from `attendance_checkins`, not inferred from attendance status;
  a teacher correction therefore does not rewrite the original scan result.
- Only managers see the breakdown and per-student scan timestamps. Student responses retain
  the existing privacy boundary.

## Delivered

- Session detail returns `qrBreakdown` with scanned, present, late, and unscanned counts.
- The manager summary displays the breakdown directly beside the regular attendance counts.
- The roster detail includes the QR scan status and timestamp for manager review.

## Validation

- QR integration tests cover one scan, the 125-student concurrent scan path, and the exact
  derived breakdown values.
- Typecheck and the full PostgreSQL suite are the release gates.

## Boundaries

- Bulk import of QR scans remains separate until its proof-of-presence and provenance
  contract is implemented; raw student/code CSVs must not manufacture QR proof.
- No recurring QR windows, geofencing, device binding, or biometric identification is added.
