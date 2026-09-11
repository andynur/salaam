# Codex and VS Code Harness

This document defines a lightweight workflow for coding agents and maintainers.

## Context strategy

Keep persistent repository rules short. Read the relevant planning document only when a
task needs it. Treat source code, tests, migrations, and runtime behavior as the source
of truth; do not rely on chat history for permanent rules.

## Recommended workflow

1. Open only the repository root as the workspace.
2. Read `AGENTS.md` before editing.
3. Inspect the current Git status before a large task.
4. Use a branch or worktree for large features when the team workflow supports it.
5. State a short plan for non-trivial work.
6. Keep changes scoped and reviewable.
7. Run targeted tests, then the full test suite, typecheck, and build when relevant.
8. Update validation documentation when behavior or operational assumptions change.

## Model and tool guidance

Do not pin the repository to a fast-changing model name. Use low reasoning effort for
mechanical edits, medium for normal features, and high for migrations, security,
concurrency, architecture, or difficult debugging.

Do not weaken sandbox, approval, or access boundaries as part of setup. Prefer existing
repository tools and native Bun capabilities before adding dependencies.

## Task template

Every substantial task should state:

- Goal
- Context and files to read
- Scope
- Out-of-scope items
- Acceptance criteria
- Validation commands
- Constraints and relevant security invariants

## Delivery checklist

Before handoff, confirm the working tree, tests, typecheck, build, migration status,
documentation, and any unresolved operational limits. Never commit credentials,
generated output, local databases, or private school data.
