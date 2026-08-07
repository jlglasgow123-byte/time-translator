# Time Translator — Claude Code Guidelines

## P0 — NEVER, EVER PUT "CORDEL" ANYWHERE IN THIS PROJECT

**This is Jasmine's personal hobby project, fully separate from her employer. This is the single highest-priority rule in this file — it overrides everything else.** The word "Cordel" (or any other reference to that employer) must never appear anywhere in this repository or on the live site — not in code, comments, database migrations, documentation, commit messages, the changelog, the license, brand materials, or anything said in conversation about this project. If a reference to "a work account," "an employer," or similar is ever needed for context (e.g. explaining why the Claude Artifact tool is off-limits here), describe it generically and never name it. If you ever encounter an existing reference to Cordel in this project, remove it immediately without waiting to be asked.

## NEVER publish Claude Artifacts for this project

**Do not use the Claude Artifact tool (the Artifacts gallery that lives in the Claude account) for anything in this project — ever.** This repo is linked to a *work* Claude account, and a Time Translator artifact published there lands in the wrong account's gallery. That account's gallery is reserved for work-related artifacts only.

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

## Communication style — plain English, no code jargon

Jasmine did not write any of the code in this project and doesn't know what a `.ts`, `.mjs`, file diff, or function name means. This is not limited to summaries or changelists — **it governs ALL communication with her, every response, in every context**: explanations, status updates, answers to questions, error descriptions, plans, anything said out loud in the conversation.

**Never describe anything in terms of code artifacts** (file names, line counts, function/variable names, framework/library terms, diff stats) unless she's specifically asking about code structure itself. Instead, describe everything in **real-world, plain-English prose**: what it means for a user or for the business, what problem it fixes or causes, what to watch out for. Write it the way you'd explain it to a smart non-technical colleague — in every message, not just recaps.

- Bad: `Stripe: webhook (+159), checkout (+89), portal (+83)`
- Good: `Fixed a silent bug where a customer could pay but never get upgraded (or cancel but keep access forever), with no record of it happening.`

## Source of truth

`PRD.md` (product intent) and `Project_Model.md` (process, scope, standards, decisions) are the shared source of truth. Read them before non-trivial work. Every accepted decision must be recorded in `Project_Model.md` — an accepted decision that isn't recorded doesn't count as done.

## Agents

Three agents own the workflow: **product-manager** (requirements/scope), **software-developer** (implementation/tests), **technical-reviewer** (quality + security review — this is the single reviewer; the older Codex `AGENTS.md` flow is deprecated).

## Update workflow — every time changes are made to the code ALWAYS follow this sequence

1. Make the requested changes.
2. Summarise what was changed and ask: **"Do you want the technical-reviewer agent to review these changes?"** Ask this on its own — do not combine it with the push question.
3. **If Yes:** run the technical-reviewer agent, then sort every finding into exactly one of two buckets — never a flat list:
   - **Fix now (critical)** — actively broken, unsafe, or would ship a bug. Present these to Jasmine plainly; if she agrees, fix and fold into the same commit before moving on.
   - **Handover (everything else)** — not urgent enough to hold up this push. Do **not** fix these in this thread. Instead write them to `Logs/review-handover.md` (overwrite the file each time — it always holds only the latest review's leftovers, not an accumulating history), with each item structured as:
     - **What was reviewed** — the body of work this finding is about
     - **Issue** — plain-English description of the problem
     - **Priority** — P1 (do soon) through P5 (nice to have)
     - **Recommended fix** — concrete enough that a brand-new conversation with no memory of this one could act on it immediately
   Print the full handover list on screen in the same message (same structure as above, per item) — do not just say the file was written and leave it there. The file is for reopening in a fresh conversation later; the on-screen version is so Jasmine can read it right now without opening anything.
   **If No:** go straight to step 4.
4. Ask: **"Should I push the changes?"** and wait for Jasmine to say "Push".
5. Run `npm run build` — must pass clean.
6. Update `CHANGELOG.md` (see below).
7. `git commit && git push` — do not ask again, just do it.

Never push without asking first. Never leave changes uncommitted after Jasmine says Push. Never let non-critical review findings delay a push — they go to the handover file, not into this thread's fix list.

## Migrations

Any time a DB migration is required, **explicitly tell Jasmine** and provide the full SQL script she must run manually in Supabase. Never assume it has been run.

## Changelog

**Always update `CHANGELOG.md` before committing.** Every push must include a changelog entry for that day's changes under a `## YYYY-MM-DD` heading (most recent first). If an entry for today already exists, append to it rather than creating a new heading.

Write entries as plain English bullets in the format:
- **Feature/fix name** — one sentence describing what changed and why it matters to the user

Group related small fixes under a single bullet rather than listing every micro-commit. Skip internal refactors that have no user-facing impact. Commit the changelog update in the same commit as the code change.
