import { useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useRecipes } from '../api/hooks'
import type { RecipeInput } from '../api/types'
import { parseOrgRecipes } from '../lib/orgRecipes'
import { useToast } from './Toast'

const key = (title: string) => title.trim().toLowerCase()

/**
 * Reads an org file in the browser and creates its recipes through the normal API, because the
 * production database can't be reached from a laptop (S20). A title the app already has is skipped,
 * so it is safe to run again after the file has grown, and it never overwrites an edit made here.
 */
export function RecipeImport() {
  const { data: existing = [] } = useRecipes()
  const qc = useQueryClient()
  const toast = useToast()
  const [found, setFound] = useState<RecipeInput[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string[]>([])

  const have = new Set(existing.map((r) => key(r.title)))
  const fresh = found?.filter((r, i) => !have.has(key(r.title)) && found.findIndex((o) => key(o.title) === key(r.title)) === i) ?? []

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setFailed([])
    if (file) setFound(parseOrgRecipes(await file.text()))
  }

  const run = async () => {
    setBusy(true)
    const problems: string[] = []
    let added = 0
    for (const r of fresh) {
      try {
        await mutations.createRecipe(r)
        added++
      } catch (e) {
        problems.push(`${r.title}: ${(e as Error).message}`)
      }
    }
    await qc.invalidateQueries({ queryKey: ['recipes'] })
    setBusy(false)
    setFailed(problems)
    if (problems.length === 0) setFound(null)
    toast(`Imported ${added} recipe${added === 1 ? '' : 's'}`)
  }

  return (
    <div className="card">
      <h2>Import recipes</h2>
      <p className="muted small">Choose an org file with one recipe per top-level heading. Recipes already here are skipped, so nothing is overwritten.</p>
      <label className="field">
        <span>Org file</span>
        <input type="file" accept=".org,.txt,text/plain" onChange={choose} disabled={busy} />
      </label>
      {found && (
        <>
          <p className="small">
            {found.length} found: {fresh.length} new, {found.length - fresh.length} skipped.
          </p>
          {fresh.length > 0 && (
            <>
              <ul className="import-list">
                {fresh.map((r) => (
                  <li key={r.title}>{r.title}</li>
                ))}
              </ul>
              <button className="btn primary" type="button" onClick={run} disabled={busy}>
                {busy ? 'Importing…' : `Import ${fresh.length}`}
              </button>
            </>
          )}
        </>
      )}
      {failed.length > 0 && (
        <ul className="import-list danger">
          {failed.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
