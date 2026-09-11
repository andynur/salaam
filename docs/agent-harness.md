# Agent harness

How this repository supports coding agents, Claude Code and Codex, with one set of
instructions and a small always-loaded context. Read this when you change `AGENTS.md`,
`CLAUDE.md`, skills, or agent settings.

## Layout

| File | Loaded by | When |
| --- | --- | --- |
| `AGENTS.md` | Codex directly; Claude Code through `CLAUDE.md` | Every session |
| `CLAUDE.md` | Claude Code | Every session; `@AGENTS.md` imports the shared rules, then Claude-only notes follow |
| `src/web/AGENTS.md`, `database/AGENTS.md`, `tests/AGENTS.md` | Codex when started in or working under that directory, and through the routing table in `AGENTS.md`; Claude Code through the sibling `CLAUDE.md` when it reads files there | On demand |
| `.agents/skills/<name>/SKILL.md` | Codex natively; Claude Code through symlinks in `.claude/skills/` | Name and description always; body when used |
| `.claude/settings.json` | Claude Code | Shared permission rules |
| `DESIGN.md`, `docs/**` | Either agent, when the "Read on demand" table points there | On demand |

Personal, uncommitted files are ignored by git: `CLAUDE.local.md`,
`.claude/settings.local.json`, and `AGENTS.override.md`. Tool-level config and memory live
in each user's home directory.

## Skills

| Skill | Use |
| --- | --- |
| `deliver-phase` | Scope, build, validate, and document a roadmap phase |
| `add-migration` | Schema change with a down script and tests |
| `browser-qa` | Real-browser smoke test through headless Chrome |

Invoke a skill with `/name` in Claude Code or `$name` in Codex, or let the agent choose it
from its description. To add one:

```sh
mkdir -p .agents/skills/<name>          # write SKILL.md with name and description frontmatter
ln -s ../../.agents/skills/<name> .claude/skills/<name>
```

Keep the frontmatter to `name` and `description` so both tools accept it, write the
description as "what it does; use when…", and move long reference material into sibling
files linked from `SKILL.md`. On Windows, enable Git symlinks (`core.symlinks` with Developer
Mode) or copy the folder.

## Context budget

Always-loaded files cost tokens on every turn of every session.

- Keep root `AGENTS.md` under about 150 lines and nested `AGENTS.md` files under 40 lines.
  Codex stops reading instruction files after 32 KiB combined; Claude Code recommends
  staying under 200 lines per file.
- A rule belongs in an always-loaded file only if it applies to most tasks and an agent
  cannot cheaply learn it from the code. Directory rules go into nested files, procedures
  into skills, and reference material, history, and validation evidence into `docs/`.
- State each fact once and link to it. `README.md` is for people; agents are routed to the
  document they need instead.
- Prefer concrete, checkable instructions — a path, a command, a limit — over general
  advice, and delete rules the code no longer needs.

Check sizes with `wc -c AGENTS.md CLAUDE.md */AGENTS.md src/web/AGENTS.md`. In Claude Code,
`/context` lists the loaded memory files and skills.

## Where new knowledge goes

| Knowledge | Place |
| --- | --- |
| Convention for most tasks | `AGENTS.md` |
| Convention for one directory | That directory's `AGENTS.md` |
| Multi-step procedure | A skill in `.agents/skills/` |
| Claude Code–only behavior | `CLAUDE.md` |
| UI tokens, classes, components | `DESIGN.md` |
| Phase scope, API, evidence | `docs/phases/NN-*.md` |
| Personal preference | Local files or the tool's memory, not the repository |

## Model and effort

Don't pin a model in repository config; use the model chosen in the IDE or CLI. Use low
reasoning effort for mechanical edits, medium for normal features, and high for migrations,
security, concurrency, architecture, and hard debugging.

## Safety

Setup must not weaken sandbox or approval settings. `.claude/settings.json` only
pre-approves validation commands (`bun run typecheck`, `bun run build`, `bun test`) and
denies reading `.env`. Commands that change the application database, such as `db:migrate`
and `db:migrate:reset`, still ask for approval.

## Task prompt template

```md
## Goal
## Context          docs and files to read
## Scope
## Out of scope
## Acceptance criteria
## Validation       commands to run
## Constraints      security invariants, dependency limits
```

## Maintenance

- After every phase, complete the documentation step of `deliver-phase`.
- When an agent repeats a mistake, or a review catches something the rules should have
  covered, add one concrete line to the right file from the table above.
- When conventions change, review `AGENTS.md`, the nested files, and the skills for stale or
  contradicting rules.
