import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { mutations, useMe, useMeals } from '../api/hooks'
import { CATEGORIES, MEAL_TAGS, type Category, type Ingredient, type Meal, type MealTag } from '../api/types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { fmtDay } from '../lib/dates'

export function MealLibrary() {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const { data: meals = [], isLoading } = useMeals(q, tag)
  const { data: me } = useMe()
  const [editing, setEditing] = useState<Meal | 'new' | null>(null)
  const qc = useQueryClient()

  return (
    <>
      <div className="row between">
        <h1>Meal library</h1>
        <div className="row">
          <Link className="btn sm" to="/meals">
            Week plan
          </Link>
          <button className="btn primary sm" type="button" onClick={() => setEditing('new')}>
            + Meal
          </button>
        </div>
      </div>
      <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: '0.5rem' }} />
      <div className="chips" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`chip ${tag === '' ? 'on' : ''}`} onClick={() => setTag('')}>
          All
        </button>
        {MEAL_TAGS.map((t) => (
          <button key={t} type="button" className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="card">
        {isLoading && <p className="loading">Loading…</p>}
        {!isLoading && meals.length === 0 && <p className="empty">No meals yet.</p>}
        <ul className="list">
          {meals.map((m) => (
            <li key={m.id} className="clickable" onClick={() => setEditing(m)}>
              <span className="title">
                {m.name}
                <span className="sub">
                  {m.ingredients.length} ingredient{m.ingredients.length === 1 ? '' : 's'}
                  {m.lastPlannedAt && ` · last planned ${fmtDay(m.lastPlannedAt)}`}
                </span>
              </span>
              <span className="tagline">
                {m.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {editing && (
        <MealEditor
          meal={editing === 'new' ? undefined : editing}
          isAdmin={me?.role === 'admin'}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void qc.invalidateQueries({ queryKey: ['meals'] })
            void qc.invalidateQueries({ queryKey: ['plan'] })
          }}
        />
      )}
    </>
  )
}

function MealEditor({ meal, isAdmin, onClose, onSaved }: { meal?: Meal; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(meal?.name ?? '')
  const [tags, setTags] = useState<MealTag[]>(meal?.tags ?? [])
  const [ingredients, setIngredients] = useState<Ingredient[]>(meal?.ingredients.length ? meal.ingredients : [{ text: '' }])
  const [link, setLink] = useState(meal?.link ?? '')
  const [notes, setNotes] = useState(meal?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const setIng = (i: number, patch: Partial<Ingredient>) => setIngredients((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    setBusy(true)
    const body = {
      name: name.trim(),
      tags,
      ingredients: ingredients.map((i) => ({ text: i.text.trim(), category: i.category || undefined })).filter((i) => i.text),
      link: link.trim(),
      notes: notes.trim(),
    }
    try {
      if (meal) await mutations.patchMeal(meal.id, body)
      else await mutations.createMeal(body)
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={meal ? 'Edit meal' : 'New meal'}
      onClose={onClose}
      footer={
        <>
          {meal && isAdmin && (
            <button
              className="btn danger"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirm(`Remove "${meal.name}" from the library? Past plans keep the name.`)) return
                await mutations.archiveMeal(meal.id)
                onSaved()
              }}
            >
              Remove
            </button>
          )}
          <button className="btn primary" type="button" onClick={save} disabled={busy || !name.trim()}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus={!meal} />
      </label>
      <span className="field-label">Tags</span>
      <div className="chips" style={{ marginBottom: '0.75rem' }}>
        {MEAL_TAGS.map((t) => {
          const on = tags.includes(t)
          return (
            <button key={t} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}>
              {t}
            </button>
          )
        })}
      </div>
      <span className="field-label">Ingredients (one per line, with an optional shopping category)</span>
      {ingredients.map((ing, i) => (
        <div className="ingredient-row" key={i}>
          <input type="text" value={ing.text} placeholder="500 g mince" maxLength={200} onChange={(e) => setIng(i, { text: e.target.value })} aria-label={`Ingredient ${i + 1}`} />
          <select value={ing.category ?? ''} onChange={(e) => setIng(i, { category: (e.target.value || undefined) as Category | undefined })} aria-label="Category">
            <option value="">Category</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button type="button" className="icon-btn" aria-label="Remove ingredient" onClick={() => setIngredients((l) => l.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={() => setIngredients((l) => [...l, { text: '' }])} style={{ marginBottom: '0.75rem' }}>
        + Ingredient
      </button>
      <label className="field">
        <span>Recipe link</span>
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" maxLength={2000} />
        {meal?.link && (
          <a href={meal.link} target="_blank" rel="noopener noreferrer" className="small">
            Open recipe ↗
          </a>
        )}
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </label>
    </Modal>
  )
}
