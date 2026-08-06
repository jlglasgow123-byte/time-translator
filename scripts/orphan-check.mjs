#!/usr/bin/env node
/**
 * Orphan check — finds API routes and pages that nothing in the codebase links to.
 *
 *   node scripts/orphan-check.mjs
 *   npm run orphan:check
 *
 * WHY THIS EXISTS: /api/match-events, /api/parse-ics and /api/jira/tickets were all
 * left behind by the 8 May 2026 refactor that folded parsing and matching into
 * /api/process. They survived the July public release and two security-hardening
 * passes because nothing imports a Next.js route — the filesystem IS the router, so a
 * dead route stays live and deployable forever with no compiler error. One of them
 * still charged AI quota incorrectly. Deleted 2026-08-06; see Project_Model.md §6.
 *
 * THIS IS A HINT GENERATOR, NOT A VERDICT. Read the caveats it prints. Never delete
 * anything on this script's word alone — confirm the route has no external caller
 * first. Exits 0 always, so it can never block a build on a false positive.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'src', 'app')

// Called from outside the codebase, so "no caller in src/" is expected and correct.
// Keep this list short and justified — every entry is a check deliberately skipped.
const EXTERNALLY_CALLED = {
  '/api/stripe/webhook': 'called by Stripe, not by our code',
  '/api/admin/atlassian-report': 'cron — see vercel.json',
  '/api/admin/error-alerts': 'cron — see vercel.json',
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

if (!existsSync(APP)) {
  console.error('src/app not found — run this from the repo root.')
  process.exit(0)
}

const allFiles = walk(APP)

// Every .ts/.tsx file that could contain a reference, plus config that can name routes.
const searchable = [
  ...walk(join(ROOT, 'src')).filter(f => /\.(ts|tsx)$/.test(f)),
  ...['next.config.ts', 'vercel.json', 'middleware.ts', 'src/middleware.ts']
    .map(f => join(ROOT, f))
    .filter(f => existsSync(f) && statSync(f).isFile()),
]

const sources = new Map()
for (const f of searchable) sources.set(f, readFileSync(f, 'utf8'))

// A route's URL path is its directory, minus src/app, minus the /route.ts filename.
// Dynamic segments ([id], [...slug]) are stripped to a prefix, because callers build
// those URLs with template strings — `/api/admin/users/${id}/suspend` never contains
// the literal "[userId]", so matching on the literal path would report a false orphan.
function urlFor(routeFile) {
  const rel = relative(APP, dirname(routeFile)).split(sep).join('/')
  return '/' + rel.replace(/\/?\(.*?\)/g, '')   // strip (route groups)
}

// The searchable substring: everything up to the first dynamic segment.
function searchKey(url) {
  const i = url.search(/\/\[/)
  return i === -1 ? url : url.slice(0, i)
}

const routes = allFiles.filter(f => /[/\\]route\.tsx?$/.test(f))
const pages = allFiles.filter(f => /[/\\]page\.tsx?$/.test(f))

const orphans = []
const skipped = []

for (const file of routes) {
  const url = urlFor(file)
  if (EXTERNALLY_CALLED[url]) {
    skipped.push([url, EXTERNALLY_CALLED[url]])
    continue
  }
  const key = searchKey(url)
  const callers = []
  for (const [src, text] of sources) {
    if (src === file) continue
    if (dirname(src).startsWith(dirname(file))) continue   // its own subtree
    if (text.includes(key)) callers.push(relative(ROOT, src))
  }
  if (callers.length === 0) orphans.push({ url, file, kind: 'API route' })
}

// Pages are reachable by URL, so a page with no internal link is not dead — a user can
// still navigate to it. Only reported as "unlinked", separately and without alarm.
const unlinkedPages = []
for (const file of pages) {
  const url = urlFor(file) || '/'
  if (url === '/') continue
  const key = searchKey(url)
  let linked = false
  for (const [src, text] of sources) {
    if (src === file) continue
    if (dirname(src).startsWith(dirname(file))) continue
    if (text.includes(key)) { linked = true; break }
  }
  if (!linked) unlinkedPages.push(url)
}

console.log(`\nScanned ${routes.length} API routes and ${pages.length} pages.\n`)

if (orphans.length === 0) {
  console.log('  No API routes without an in-repo caller.')
} else {
  console.log(`  ${orphans.length} API route(s) with NO caller anywhere in src/:\n`)
  for (const o of orphans) {
    console.log(`    ${o.url}`)
    console.log(`      ${relative(ROOT, o.file).split(sep).join('/')}`)
  }
  console.log(`
  A Next.js route needs no import to stay live, so these deploy and accept requests
  with no compiler error. Before deleting any of them, confirm nothing OUTSIDE this
  repo calls it — a cron job, an external integration, a saved request, a webhook
  registered with a third party. This script cannot see any of those.`)
}

if (unlinkedPages.length) {
  console.log(`\n  ${unlinkedPages.length} page(s) with no in-repo link (reachable by URL, so not necessarily dead):`)
  for (const p of unlinkedPages) console.log(`    ${p}`)
}

if (skipped.length) {
  console.log(`\n  Skipped ${skipped.length} route(s) known to be called externally:`)
  for (const [url, why] of skipped) console.log(`    ${url} — ${why}`)
}

console.log(`
  LIMITS OF THIS CHECK — read before acting on it:
    - Only finds routes and pages. Unused exports, functions, types, components and
      dependencies are NOT covered; that needs a tool like knip or ts-prune.
    - A route referenced only in a comment or a string counts as "called".
    - Dynamic segments are matched on their static prefix, so a route whose only
      caller builds the URL in an unusual way may still be reported.
    - Always exits 0. It reports; it never blocks a build.
`)
