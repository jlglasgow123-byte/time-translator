'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface JiraProject {
  key: string
  name: string
}

interface Props {
  /** Currently saved default, so the matching row can be marked as selected. */
  currentKey?: string
  onSelect: (key: string) => void
  onClose: () => void
}

/**
 * Prompts the user to pick their default Jira project by searching their own
 * Jira. Shown straight after a successful Jira OAuth connect, because until a
 * default is set nothing can be AI-matched.
 */
export function DefaultProjectModal({ currentKey, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<JiraProject[]>([])
  // Only true for the very first load. Later searches keep the previous results on
  // screen until the new ones arrive, so the list doesn't blank out per keystroke.
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState(currentKey ?? '')

  // Debounced server-side search — Jira does the filtering so large instances
  // don't need the whole project list pulled down.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/jira/projects?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? 'Could not load your Jira projects.')
          setProjects([])
        } else {
          setError(null)
          setProjects(data.projects ?? [])
        }
      } catch {
        if (!cancelled) setError('Could not load your Jira projects.')
      } finally {
        if (!cancelled) { setLoading(false); setSearching(false) }
      }
    }, query ? 300 : 0)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-xl">
        <h2 className="text-lg font-extrabold text-[#26333A]">Choose your default Jira project</h2>
        <p className="mt-1 text-sm text-[#66747A]">
          Calendar events without a Jira key in the title are matched against this project. You can
          change it any time in Settings.
        </p>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={searching ? 'Searching…' : 'Search your Jira projects…'}
          autoFocus
          className="mt-4 w-full rounded-2xl border border-[#DCEEF5] bg-white px-4 py-2.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
        />

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-[#DCEEF5]">
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-[#66747A]">Loading projects…</p>
          ) : projects.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#66747A]">
              {query ? 'No projects match that search.' : 'No Jira projects found for your account.'}
            </p>
          ) : (
            <ul>
              {projects.map(project => (
                <li key={project.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(project.key)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selected === project.key ? 'bg-[#DCEEF5]' : 'hover:bg-[#FBFBF8]'
                    }`}
                  >
                    <span className="rounded-md bg-[#3F7C85] px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {project.key}
                    </span>
                    <span className="text-sm text-[#26333A]">{project.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Skip for now</Button>
          <Button onClick={() => onSelect(selected)} disabled={!selected}>
            Set as default
          </Button>
        </div>
      </div>
    </div>
  )
}
