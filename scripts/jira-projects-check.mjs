// Behavioural checks for the Jira project search path.
//
// Standalone Node script rather than a test-runner suite, matching the
// scripts/billing-check.mjs precedent (Project_Model.md §6, 2026-08-05) — there
// is still no runner, and this is launch-checklist tooling.
//
// KNOWN LIMITATION, same as billing-check: searchProjects is TypeScript and this
// is JavaScript, so the response-mapping logic below is a hand-copied mirror of
// src/lib/jira-client.ts searchProjects (~line 270). If that mapping changes,
// change it here too. When a test runner lands, import the real module and
// delete the mirror. The mirror is deliberately tiny to limit drift surface.
//
// Run: node scripts/jira-projects-check.mjs

const failures = []
let assertions = 0

function check(name, actual, expected) {
  assertions++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) failures.push(`${name}\n    expected: ${e}\n    actual:   ${a}`)
}

// --- mirror of searchProjects' response mapping -----------------------------
function mapProjects(data) {
  return (data.values ?? [])
    .filter(p => typeof p.key === 'string' && p.key.length > 0)
    .map(p => ({
      key: p.key,
      name: typeof p.name === 'string' && p.name ? p.name : p.key,
    }))
}

// --- the keyless-project filter --------------------------------------------
// A project with no usable key would be saved as the user's default and then
// match nothing, so it must be dropped rather than rendered.
check('drops projects with no key',
  mapProjects({ values: [{ key: 'DEV', name: 'Dev' }, { name: 'Keyless' }] }),
  [{ key: 'DEV', name: 'Dev' }])

check('drops projects with an empty-string key',
  mapProjects({ values: [{ key: '', name: 'Empty' }, { key: 'OPS', name: 'Ops' }] }),
  [{ key: 'OPS', name: 'Ops' }])

check('drops projects with a non-string key',
  mapProjects({ values: [{ key: 123, name: 'Numeric' }, { key: 'CSD', name: 'Service Desk' }] }),
  [{ key: 'CSD', name: 'Service Desk' }])

check('falls back to the key when name is missing',
  mapProjects({ values: [{ key: 'DEV' }] }),
  [{ key: 'DEV', name: 'DEV' }])

check('falls back to the key when name is empty',
  mapProjects({ values: [{ key: 'DEV', name: '' }] }),
  [{ key: 'DEV', name: 'DEV' }])

check('handles a missing values array',
  mapProjects({}),
  [])

// --- query truncation -------------------------------------------------------
// Mirrors MAX_JIRA_PROJECT_QUERY_LENGTH in src/lib/security-limits.ts.
const MAX_JIRA_PROJECT_QUERY_LENGTH = 100

function normaliseQuery(raw) {
  return raw?.trim().slice(0, MAX_JIRA_PROJECT_QUERY_LENGTH) || undefined
}

check('truncates an over-long query', normaliseQuery('x'.repeat(5000))?.length, 100)
check('leaves a normal query intact', normaliseQuery('  billing  '), 'billing')
check('treats a whitespace-only query as absent', normaliseQuery('   '), undefined)
check('treats an empty query as absent', normaliseQuery(''), undefined)

if (failures.length) {
  console.error('Jira projects check failed:\n')
  for (const item of failures) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`Jira projects check passed (${assertions} assertions).`)
