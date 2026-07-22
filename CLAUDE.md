# Time Translator — Claude Code Guidelines

## Push workflow — ALWAYS follow this sequence

1. Make the requested changes.
2. Summarise what was changed and ask: **"Should I push the changes?"**
3. Wait for Jasmine to say "Push".
4. Run `npm run build` — must pass clean.
5. Update `CHANGELOG.md` (see below).
6. `git commit && git push` — do not ask again, just do it.

Never push without asking first. Never leave changes uncommitted after Jasmine says Push.

## Migrations

Any time a DB migration is required, **explicitly tell Jasmine** and provide the full SQL script she must run manually in Supabase. Never assume it has been run.

## Changelog

**Always update `CHANGELOG.md` before committing.** Every push must include a changelog entry for that day's changes under a `## YYYY-MM-DD` heading (most recent first). If an entry for today already exists, append to it rather than creating a new heading.

Write entries as plain English bullets in the format:
- **Feature/fix name** — one sentence describing what changed and why it matters to the user

Group related small fixes under a single bullet rather than listing every micro-commit. Skip internal refactors that have no user-facing impact. Commit the changelog update in the same commit as the code change.
