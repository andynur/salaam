# Codex + VS Code Harness

Tujuan dokumen ini adalah membuat Codex bekerja efektif tanpa membuang context/token pada informasi yang tidak relevan.

## 1. Core principle

**Persistent context kecil, task context spesifik, dokumentasi besar dibaca on-demand.**

Jangan memasukkan seluruh roadmap ke `AGENTS.md`.

Gunakan:

```text
AGENTS.md              permanent repo rules
docs/                  architecture/product detail
task prompt            goal + scope + acceptance criteria
code/tests             source of truth
```

## 2. Recommended VS Code workflow

1. Buka **hanya root project** sebagai workspace saat mengerjakan HSI Learning OS.
2. Gunakan Codex IDE extension resmi.
3. Pastikan repo Git bersih sebelum task besar.
4. Untuk feature besar, buat branch/worktree terpisah bila workflow Anda mendukungnya.
5. Jalankan `/init` bila ingin membuat scaffold instruction awal, lalu **review dan ringkas** hasilnya.
6. Keep terminal, test, and database commands reproducible through `package.json` scripts.
7. Jangan mengandalkan chat history untuk aturan penting; pindahkan aturan permanen ke `AGENTS.md` atau docs.

## 3. AGENTS.md strategy

Root `AGENTS.md` hanya memuat:

- product identity satu paragraf,
- stack,
- architecture constraints,
- commands,
- coding conventions penting,
- security invariants,
- workflow/Definition of Done,
- map dokumen.

Target: cukup pendek agar dibaca setiap task tanpa membebani context.

Untuk area yang sangat khusus, scoped instruction dapat dibuat dekat module **hanya jika benar-benar perlu**.

Contoh yang mungkin layak:

```text
src/modules/assessment/AGENTS.md
```

berisi invariant exam/autosave.

Jangan membuat AGENTS di setiap folder.

## 4. Token-efficient prompting

Gunakan pola seperti GitHub issue.

### Template

```md
## Goal
Implement [one concrete outcome].

## Context
Read:
- docs/...
- src/modules/.../...

## Scope
- ...
- ...

## Out of scope
- ...
- ...

## Acceptance criteria
- ...
- ...
- bun test passes
- bun run typecheck passes

## Constraints
- Do not add dependency unless justified.
- Reuse existing patterns.
- Keep migrations backward-safe.
```

Ini lebih efektif daripada:

> "Buat fitur attendance yang lengkap dan bagus."

## 5. Ask Codex to inspect, not ingest everything

Bad:

```text
Read every file in the repository before starting.
```

Better:

```text
Inspect the repository structure, read AGENTS.md, then open only the files and docs relevant to this task. Search for existing patterns before adding new abstractions.
```

## 6. Model/reasoning usage

Do **not** permanently pin this repository to a fast-changing model name.

In Codex UI/extension, use the current recommended coding model.

Reasoning guideline if selectable:

- **low**: rename, copy changes, obvious UI text, small tests.
- **medium**: normal feature work, default.
- **high**: architecture, migrations, race conditions, security, exam sync, hard debugging.
- highest modes only when justified.

Higher reasoning is not automatically better for routine changes.

## 7. Output discipline

Tell Codex:

- do the work, not only propose it;
- keep updates short;
- avoid narrating trivial file reads;
- report changed files;
- report tests executed;
- report unresolved risk;
- do not dump entire source files in chat unless requested.

This reduces output-token waste.

## 8. Search-before-create rule

Before Codex adds:

- component,
- helper,
- repository,
- validation function,
- design token,
- database abstraction,

it should search for an existing equivalent.

This prevents duplicate patterns and context growth.

## 9. Dependency discipline

Codex must not run install for a new package just because a task is easier with it.

Required sequence:

1. check Bun/browser/PostgreSQL native support;
2. inspect existing dependencies;
3. implement using existing stack when sensible;
4. if new package is materially safer/better, state reason before adding it.

## 10. Database discipline

For schema changes Codex must:

1. inspect current schema/migrations;
2. create new migration;
3. never edit an already-applied production migration unless project is explicitly pre-production and instruction says so;
4. add constraints/indexes deliberately;
5. add repository/service tests.

## 11. Test harness

Keep canonical commands stable, for example:

```bash
bun test
bun run typecheck
bun run build
bun run db:migrate
```

Codex performs targeted test first, then broader tests before completion.

## 12. Context reset strategy

Start a new Codex task/thread when:

- moving to a different domain,
- old conversation contains large obsolete implementation context,
- task objective changes substantially.

Keep same thread when:

- fixing the feature just implemented,
- reviewing test failures from same change,
- small follow-up tightly linked to same files.

## 13. Documentation loading map

Prompt only what task needs:

### Course feature

Read:

- `01_PRODUCT_VISION_AND_SCOPE.md`
- relevant section of `04_MODULE_AND_DOMAIN_PLAN.md`
- course module source.

### Exam feature

Read:

- Activity + Assessment sections,
- `05_DATA_SECURITY_RELIABILITY.md`,
- relevant tests/source.

### UI feature

Read:

- `06_UI_UX_DESIGN_SYSTEM.md`,
- existing components and target page.

### Deployment

Read:

- `07_DEPLOYMENT_AND_OPERATIONS.md`.

Do not load every document for every task.

## 14. MCP/tool restraint

Do not add MCP servers merely because they exist.

Use external tools only when they materially reduce uncertainty or automate a real workflow. Every MCP/tool expands the agent surface and can add context/tool overhead.

For this project, local repo + terminal + Git + database commands are sufficient for most development.

## 15. Suggested task size

Best unit:

- one feature slice,
- one bug,
- one migration + feature,
- one refactor with explicit boundary.

Avoid one prompt like:

> "Build Phase 1 to Phase 10."

A good Codex session should end with a reviewable commit-sized change.

## 16. Reference notes

OpenAI guidance supports:

- using `AGENTS.md` as persistent repository context;
- structuring Codex tasks similarly to a GitHub issue;
- keeping sandbox/approval boundaries explicit;
- selecting stronger reasoning only when task complexity benefits.

Because Codex evolves quickly, treat UI/model-specific settings as adjustable rather than permanent repo requirements.
