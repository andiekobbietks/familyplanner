import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useLists, useSettings } from '../api/hooks'
import { RecipeImport } from '../components/RecipeImport'
import { useToast } from '../components/Toast'
import { WeatherSetting } from '../components/WeatherSetting'

export function Settings() {
  const { data: settings } = useSettings()
  const { data: lists = [] } = useLists()
  const qc = useQueryClient()
  const toast = useToast()
  const [confirmText, setConfirmText] = useState('')
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['settings'] })

  const exportAll = async () => {
    const res = await fetch('/api/export', { credentials: 'same-origin' })
    if (!res.ok) return toast('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `familyplanner-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <h1>Settings</h1>
      <div className="card">
        <h2>Planning</h2>
        <label className="check">
          <input type="checkbox" checked={!!settings?.breakfastEnabled} onChange={async (e) => (await mutations.patchSettings({ breakfastEnabled: e.target.checked }), invalidate())} />
          Plan breakfast as well as lunch and dinner
        </label>
        <label className="field">
          <span>Default shopping list for quick add</span>
          <select value={settings?.defaultListId ?? ''} onChange={async (e) => (await mutations.patchSettings({ defaultListId: e.target.value || null }), invalidate())}>
            <option value="">First list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <WeatherSetting />

      <RecipeImport />

      <div className="card">
        <h2>Backup</h2>
        <p className="muted small">Downloads every record as one JSON file. Keep a copy somewhere safe at least monthly.</p>
        <button className="btn" type="button" onClick={exportAll}>
          Export all data
        </button>
      </div>

      <div className="card">
        <h2 className="danger">Delete everything</h2>
        <p className="muted small">Removes every event, list, task, plan and member for this family. Export first. Type DELETE to enable the button.</p>
        <div className="row">
          <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" style={{ maxWidth: 200 }} />
          <button
            className="btn danger"
            type="button"
            disabled={confirmText !== 'DELETE'}
            onClick={async () => {
              if (!confirm('This cannot be undone. Delete all family data?')) return
              await mutations.erase()
              window.location.assign('/')
            }}
          >
            Delete all data
          </button>
        </div>
      </div>
    </>
  )
}
