# Time Translator — Claude Code Guidelines

## Source of truth

`PRD.md` (product intent) and `Project_Model.md` (process, scope, standards, decisions) are the shared source of truth. Read them before non-trivial work. Every accepted decision must be recorded in `Project_Model.md` — an accepted decision that isn't recorded doesn't count as done.

## Agents

Three agents own the workflow: **product-manager** (requirements/scope), **software-developer** (implementation/tests), **technical-reviewer** (quality + security review — this is the single reviewer; the older Codex `AGENTS.md` flow is deprecated).

## Update workflow — every time changes are made to the code ALWAYS follow this sequence

1. Make the requested changes.
2. Summarise what was changed and ask: **"Do you want the technical-reviewer agent to review these changes?"** Ask this on its own — do not combine it with the push question.
3. **If Yes:** run the full review process before anything else:
   a. Run the technical-reviewer agent on the changes.
   b. Present its report to Jasmine, findings grouped by severity.
   c. Jasmine decides which findings to act on.
   d. Make any changes she accepts, and summarise what was changed.
   Only when the review cycle is finished, move to step 4.
   **If No:** go straight to step 4.
4. Ask: **"Should I push the changes?"** and wait for Jasmine to say "Push".
5. Run `npm run build` — must pass clean.
6. Update `CHANGELOG.md` (see below).
7. `git commit && git push` — do not ask again, just do it.

Never push without asking first. Never leave changes uncommitted after Jasmine says Push.

## Migrations

Any time a DB migration is required, **explicitly tell Jasmine** and provide the full SQL script she must run manually in Supabase. Never assume it has been run.

## Changelog

**Always update `CHANGELOG.md` before committing.** Every push must include a changelog entry for that day's changes under a `## YYYY-MM-DD` heading (most recent first). If an entry for today already exists, append to it rather than creating a new heading.

Write entries as plain English bullets in the format:
- **Feature/fix name** — one sentence describing what changed and why it matters to the user

Group related small fixes under a single bullet rather than listing every micro-commit. Skip internal refactors that have no user-facing impact. Commit the changelog update in the same commit as the code change.
