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

if (failures.length) {
  console.error('Security check failed:\n')
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log('Security check passed.')
