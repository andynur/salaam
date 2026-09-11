@AGENTS.md

## Claude Code

- `src/web/`, `database/`, and `tests/` each have a `CLAUDE.md` that imports the local
  `AGENTS.md`; it loads when you read files in that directory.
- Project skills are symlinks from `.claude/skills/` to `.agents/skills/`:
  `/deliver-phase`, `/add-migration`, `/browser-qa`.
- `.claude/settings.json` pre-approves `bun run typecheck`, `bun run build`, and
  `bun test`, and denies reading `.env`.
- Use plan mode for phase-sized or migration work.
