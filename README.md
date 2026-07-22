# Time Translator

Time Translator turns your calendar into ready-to-review Jira worklogs. Connect Google Calendar (or upload an `.ics` file), and it matches your events to Jira tickets — using exact rules, learned mappings, and AI-assisted matching for anything it isn't sure about — so you can review, correct, and export or log time in minutes instead of doing it by hand.

**Live app:** [timetranslator.com.au](https://timetranslator.com.au)

## How it works

1. **Import** — Connect Google Calendar (read-only, date-range limited) or upload a calendar `.ics` export.
2. **Match** — Events are matched to your open Jira tickets via skip rules, previously learned mappings, and AI confidence scoring for anything ambiguous.
3. **Review** — Check and correct matches in a review table before anything is finalised.
4. **Export / Log** — Export reviewed time as CSV, or send it straight to Jira as worklogs.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Supabase](https://supabase.com) — auth, Postgres, storage
- [Stripe](https://stripe.com) — subscription billing
- [Upstash Redis](https://upstash.com) — durable rate limiting
- Google Calendar API + Atlassian (Jira) API — OAuth integrations
- Anthropic API — AI-assisted event-to-ticket matching
- Deployed on [Vercel](https://vercel.com)

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project
- API credentials for Google Cloud (Calendar OAuth), Atlassian (Jira OAuth), Stripe, Upstash, and Anthropic — see below

### Setup

```bash
npm install
cp .env.example .env.local   # fill in your own credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See [`.env.example`](.env.example) for the full list. You'll need credentials for:

- **Supabase** — project URL and anon key
- **Google** — OAuth client ID/secret for Calendar access
- **Atlassian** — OAuth client ID/secret for Jira, plus a token encryption key
- **Stripe** — secret key, webhook secret, and price IDs for each plan
- **Upstash Redis** — REST URL and token for rate limiting
- **Anthropic** — API key for AI-assisted matching

None of these are required to explore the codebase, but the app won't run end-to-end without them.

### Database

Schema and migrations live in [`supabase/migrations`](supabase/migrations). Apply them to your own Supabase project via the Supabase CLI or SQL editor before running the app against it.

## Security

- `npm run build` runs an automated check ([`scripts/security-check.mjs`](scripts/security-check.mjs)) that blocks client-side access to sensitive fields (e.g. Jira API tokens) and misuse of the Supabase service-role key.
- A weekly CodeQL scan and a weekly custom security report run via GitHub Actions.
- Found a vulnerability? Please report it privately rather than opening a public issue — see [SECURITY.md](SECURITY.md) (or contact details in your GitHub profile) for how to reach us.

## License

All rights reserved — see [LICENSE](LICENSE). This code is public for viewing/portfolio purposes; it is not open source.
