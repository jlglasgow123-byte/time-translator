import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function walk(dir, files = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const full = join(root, dir, entry)
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    if (statSync(full).isDirectory()) walk(relative(root, full), files)
    else files.push(relative(root, full).replaceAll('\\', '/'))
  }
  return files
}

function fail(message) {
  failures.push(message)
}

const sourceFiles = walk('src').filter(file => /\.(ts|tsx|js|jsx)$/.test(file))

for (const file of sourceFiles) {
  const text = read(file)
  if (text.includes("'use client'") || text.includes('"use client"')) {
    if (/from\(['"]jira_credentials['"]\)[\s\S]*select\([^)]*api_token/.test(text)) {
      fail(`${file}: client components must never select jira_credentials.api_token`)
    }
    if (/from\(['"]jira_credentials['"]\)[\s\S]*(insert|upsert|update)\(/.test(text)) {
      fail(`${file}: client components must save Jira credentials through a server API route`)
    }
  }

  if (/SUPABASE_SERVICE_ROLE_KEY/.test(text) && !file.includes('/lib/supabase/service.ts')) {
    fail(`${file}: service-role key should only be referenced by the central server helper`)
  }
}

if (existsSync(join(root, 'src/app/api/env-check/route.ts'))) {
  fail('src/app/api/env-check/route.ts: remove public environment debugging endpoints')
}

const middlewarePath = 'src/middleware.ts'
if (existsSync(join(root, middlewarePath)) && read(middlewarePath).includes('api/env-check')) {
  fail(`${middlewarePath}: env-check must not bypass auth middleware`)
}

const callbackPath = 'src/app/auth/callback/route.ts'
if (existsSync(join(root, callbackPath))) {
  const callback = read(callbackPath)
  if (!callback.includes("startsWith('/')") || !callback.includes("!requestedNext.startsWith('//')")) {
    fail(`${callbackPath}: callback next redirects must be constrained to same-origin relative paths`)
  }
}

// The Jira typeahead routes hit the user's own Jira on every keystroke, so each
// must gate on auth *and* rate limit. Both previously wrapped the limit in
// `if (user)`, which read as optional and would have become a real bypass if
// getJiraCreds ever gained a service-client path. Enforce the shape instead.
for (const lookupRoute of ['src/app/api/jira/search/route.ts', 'src/app/api/jira/projects/route.ts']) {
  if (!existsSync(join(root, lookupRoute))) continue
  const text = read(lookupRoute)
  if (!text.includes('isCredsError(creds)')) {
    fail(`${lookupRoute}: Jira lookup routes must reject unauthenticated callers via getJiraCreds`)
  }
  if (!text.includes('guardJiraLookup')) {
    fail(`${lookupRoute}: Jira lookup routes must rate limit via guardJiraLookup`)
  }
  if (/if \(user\) \{/.test(text)) {
    fail(`${lookupRoute}: rate limiting must not be conditional on a separately-fetched user`)
  }
}

// Rate limiting fails closed (Project_Model.md §6, 2026-08-05). checkRateLimit
// throws when Upstash is unreachable; callers must use the Safe variant so the
// outage becomes a logged 503 rather than a bare unlogged 500.
const failClosedCallers = ['src/middleware.ts', 'src/lib/jira-lookup-guard.ts']
for (const caller of failClosedCallers) {
  if (!existsSync(join(root, caller))) continue
  const text = read(caller)
  if (/[^eS]checkRateLimit\(/.test(text)) {
    fail(`${caller}: use checkRateLimitSafe so an Upstash outage fails closed with a logged 503`)
  }
}

if (failures.length) {
  console.error('Security check failed:\n')
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log('Security check passed.')
