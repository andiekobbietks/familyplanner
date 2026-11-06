import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { mutations, useLists, usePlan, useRecipes, useSettings } from '../api/hooks'
import type { Recipe, Slot } from '../api/types'
import { Icon } from '../components/Icons'
import { useSetCell } from '../components/MealInput'
import { Modal } from '../components/Modal'
import { RecipeEditor } from '../components/RecipeEditor'
import { useToast } from '../components/Toast'
import { fmtDay, mondayOf, todayISO } from '../lib/dates'
import { RecipeText } from '../components/RecipeText'
import { sourceUrl, textBlocks } from '../lib/recipes'

export function RecipeDetail() {
  const { id } = useParams()
  const { data: recipes, isLoading } = useRecipes()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState<'shop' | 'plan' | 'edit' | null>(null)
  const recipe = recipes?.find((r) => r.id === id)
  const close = () => setSheet(null)

  const back = (
    <Link className="back-link" to="/meals/recipes">
      <Icon name="left" size={18} />
      Recipes
    </Link>
  )
  if (isLoading) return <p className="loading">Loading…</p>
  if (!recipe) {
    return (
      <>
        {back}
        <p className="empty">This recipe has gone.</p>
      </>
    )
  }

  const url = sourceUrl(recipe.source)
  const meta = [recipe.serves && `Serves ${recipe.serves}`, recipe.time].filter(Boolean).join(' · ')
  return (
    <>
      {back}
      <header className="recipe-head">
        <h1>{recipe.title}</h1>
        {meta && <p className="muted recipe-meta">{meta}</p>}
        {recipe.summary && <p>{recipe.summary}</p>}
        {recipe.tags.length > 0 && (
          <div className="recipe-tags">
            {recipe.tags.map((t) => (
              <span key={t} className="pill grey">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="recipe-actions">
        {recipe.ingredients && (
          <button className="btn sm" type="button" onClick={() => setSheet('shop')}>
            <Icon name="basket" size={18} />
            Add to shopping
          </button>
        )}
        <button className="btn sm" type="button" onClick={() => setSheet('plan')}>
          <Icon name="calendar" size={18} />
          Put on the plan
        </button>
        <button className="btn sm" type="button" onClick={() => setSheet('edit')}>
          <Icon name="edit" size={18} />
          Edit
        </button>
      </div>

      {(recipe.ingredients || recipe.method || recipe.notes) && (
        <div className="card recipe-body">
          {recipe.ingredients && <RecipeText title="Ingredients" text={recipe.ingredients} />}
          {recipe.method && <RecipeText title="Method" text={recipe.method} numbered />}
          {recipe.notes && <RecipeText title="Notes" text={recipe.notes} className="recipe-notes" />}
        </div>
      )}

      {recipe.source && (
        <p className="muted small">
          Source:{' '}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              {recipe.source}
            </a>
          ) : (
            recipe.source
          )}
        </p>
      )}

      {sheet === 'shop' && <AddToShopping recipe={recipe} onClose={close} />}
      {sheet === 'plan' && <PutOnPlan recipe={recipe} onClose={close} />}
      {sheet === 'edit' && <RecipeEditor recipe={recipe} onClose={close} onSaved={close} onDeleted={() => navigate('/meals/recipes', { replace: true })} />}
    </>
  )
}

/** Every ingredient starts ticked, so the job is to untick what's already in the cupboard. */
function AddToShopping({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const blocks = textBlocks(recipe.ingredients)
  const { data: lists = [] } = useLists()
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [chosen, setChosen] = useState<string>()
  const [busy, setBusy] = useState(false)

  const listId = chosen ?? settings?.defaultListId ?? lists[0]?.id
  const keyOf = (i: number, j: number) => `${i}:${j}`
  const picked = blocks.flatMap((b, i) => b.lines.filter((_, j) => !unticked.has(keyOf(i, j))))

  const toggle = (key: string) => {
    const next = new Set(unticked)
    if (!next.delete(key)) next.add(key)
    setUnticked(next)
  }

  const add = async () => {
    if (!listId) return
    setBusy(true)
    let added = 0
    try {
      // In turn, because each add also rewrites the list's recent names.
      for (const line of picked) {
        await mutations.addItem(listId, { name: line.slice(0, 200) })
        added++
      }
      toast(`Added ${added} to ${lists.find((l) => l.id === listId)?.name ?? 'the list'}`)
      onClose()
    } catch (e) {
      toast(`Added ${added} of ${picked.length}. ${(e as Error).message}`)
      setBusy(false)
    }
    void qc.invalidateQueries({ queryKey: ['lists'] })
    void qc.invalidateQueries({ queryKey: ['items'] })
  }

  return (
    <Modal
      title="Add to shopping"
      onClose={onClose}
      footer={
        <button className="btn primary" type="button" onClick={add} disabled={busy || !listId || picked.length === 0}>
          Add {picked.length}
        </button>
      }
    >
      {lists.length === 0 && <p className="empty">There are no shopping lists yet.</p>}
      {lists.length > 1 && (
        <label className="field">
          <span>List</span>
          <select value={listId} onChange={(e) => setChosen(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {blocks.map((b, i) => (
        <div key={i} className="pick-group">
          {b.heading && <h3>{b.heading}</h3>}
          {b.lines.map((l, j) => (
            <label className="check" key={j}>
              <input type="checkbox" checked={!unticked.has(keyOf(i, j))} onChange={() => toggle(keyOf(i, j))} />
              {l}
            </label>
          ))}
        </div>
      ))}
    </Modal>
  )
}

function PutOnPlan({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [slot, setSlot] = useState<Slot>('dinner')
  const { data: settings } = useSettings()
  const { data: plan = [] } = usePlan(mondayOf(date || todayISO()))
  const setCell = useSetCell()
  const toast = useToast()
  const slots: Slot[] = settings?.breakfastEnabled ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
  const existing = plan.find((p) => p.date === date && p.slot === slot)?.text
  const already = existing?.toLowerCase() === recipe.title.toLowerCase()

  return (
    <Modal
      title="Put on the plan"
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          type="button"
          disabled={!date || already}
          onClick={async () => {
            await setCell(date, slot, recipe.title)
            toast(`${recipe.title}: ${slot} on ${fmtDay(date)}`)
            onClose()
          }}
        >
          {existing && !already ? 'Replace' : 'Add'}
        </button>
      }
    >
      <label className="field">
        <span>Day</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Meal</span>
        <select value={slot} onChange={(e) => setSlot(e.target.value as Slot)}>
          {slots.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {existing && <p className="notice">{already ? 'Already planned for this meal.' : `This replaces ${existing}.`}</p>}
    </Modal>
  )
}
