# Time Translator — Claude Code Guidelines

## NEVER publish Claude Artifacts for this project

**Do not use the Claude Artifact tool (the Artifacts gallery that lives in the Claude account) for anything in this project — ever.** This repo is linked to a *work* Claude account (Cordel), and a Time Translator artifact published there lands in the wrong account's gallery. The only artifacts that belong in that account are Cordel-related.

**This is not a ban on HTML or rendered documents.** When a shareable or rendered document is wanted (a plan, a report, a branded page, a mockup), **write it as a file in this repo** (e.g. `LAUNCH_PLAN.html`) with the `Write` tool — a self-contained file the user opens in a browser. That is always allowed. What is forbidden is calling the Artifact/publish tool that hosts it under the Claude account. No exceptions.

## Referencing HTML / render-first files

When pointing Jasmine to an HTML file (or any file whose value is in its rendering), give the **full absolute path as plain text** — e.g. `c:\DEV\PERSO\time-translator\LAUNCH_PLAN.html` — **not** a clickable markdown `[link](path)`. In her VS Code, a markdown link opens the file in text-edit mode showing raw source, which makes styled HTML useless. Plain-text full paths let her open it in a browser. Clickable `[file](path)` links are still fine for source files meant to be read as code/text (`.ts`, `.md` source, etc.).

## Put things where they already belong — don't create new files by default

Before creating any new file, **look for the existing home first.** If Jasmine says "add to the backlog," "add to the changelog," "record this decision," etc., she means the **existing file** that already serves that purpose — not a brand-new document. Only create a new file when there is genuinely no existing place for it, and say so when you do. Consolidate into the central files that already hold rules, decisions, and history.

**The canonical homes (each holds one kind of thing — do not duplicate across them):**

| Info | Home | Notes |
| --- | --- | --- |
| **Technical** work items — fixes, testing, engineering tasks (outstanding + done) | `Logs/backlog.md` | **Technical only — no marketing.** Local/untracked by design (stripped from the public repo). |
| **All pre-launch activities** — technical *and* marketing *and* testing, sequenced by week + GTM/strategy | `LAUNCH_PLAN.md` | For technical items, **reference the backlog** rather than restating status, so status lives in one place. Marketing/GTM lives here, not in the backlog. |
| **Accepted decisions** (what we chose + why) | `Project_Model.md` §6 | Decision log, not a task list. |
| **Dated change history** (what shipped) | `CHANGELOG.md` | User-facing bullets per push. |
| **Working rules / process** | this file (`CLAUDE.md`) | Central instructions. |

When the launch plan and the backlog both touch a technical task, the **backlog owns the status** and the plan points to it — never maintain the same task status in two files.

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
