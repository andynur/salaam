# Phase 31 — Student-visible leaderboard

## Scope decisions

- A student can view the ranking for their current active academic class.
- The server derives that class from current membership; client-supplied `classId` filters
  cannot expand or redirect the scope.
- Students see aggregate ranking rows but cannot open another student's growth detail.
  Teachers retain their existing assigned-class view and drill-in.

## Delivered

- `GET /api/gamification/leaderboard` accepts `learning.participate` for students and
  returns only their current class ranking.
- The Growth page exposes `Peringkat kelas` to students, while keeping peer detail actions
  manager-only.
- Ranking levels are derived from each student's total XP using the canonical level table.

## Validation

- Gamification integration tests cover student access, current-class scope, ignored arbitrary
  class filters, teacher scope, and manager detail boundaries.
- Typecheck and the full PostgreSQL regression suite are release gates.

## Boundaries

- No public/global leaderboard, cross-class comparison, seasons, resets, or XP decay is added.
- XP earned from attendance remains deferred until correction/reversal policy is approved.
