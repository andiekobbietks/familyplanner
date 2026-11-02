import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations } from '../api/hooks'
import type { Recipe, RecipeInput } from '../api/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

const parseTags = (text: string) => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]

/** Adds a recipe when given none. Everything is plain text, so one box per block is all it needs. */
export function RecipeEditor({ recipe, onClose, onSaved, onDeleted }: { recipe?: Recipe; onClose: () => void; onSaved: (r: Recipe) => void; onDeleted?: () => void }) {
  const [form, setForm] = useState({
    title: recipe?.title ?? '',
    summary: recipe?.summary ?? '',
    serves: recipe?.serves ?? '',
    time: recipe?.time ?? '',
    source: recipe?.source ?? '',
    tags: recipe?.tags.join(', ') ?? '',
    ingredients: recipe?.ingredients ?? '',
    method: recipe?.method ?? '',
    notes: recipe?.notes ?? '',
  })
  const qc = useQueryClient()
  const toast = useToast()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const save = async () => {
    const body: RecipeInput = { ...form, title: form.title.trim(), tags: parseTags(form.tags) }
    try {
      const saved = recipe ? await mutations.patchRecipe(recipe.id, body) : await mutations.createRecipe(body)
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      onSaved(saved)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const remove = async () => {
    if (!recipe || !confirm(`Delete ${recipe.title}?`)) return
    try {
      await mutations.deleteRecipe(recipe.id)
      onDeleted?.()
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Modal
      title={recipe ? 'Edit recipe' : 'New recipe'}
      onClose={onClose}
      footer={
        <>
          {recipe && (
            <button className="btn danger" type="button" onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn primary" type="button" onClick={save} disabled={!form.title.trim()}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Title</span>
        <input type="text" value={form.title} onChange={set('title')} maxLength={200} data-autofocus={recipe ? undefined : true} />
      </label>
      <label className="field">
        <span>Summary</span>
        <textarea value={form.summary} onChange={set('summary')} maxLength={2000} />
      </label>
      <div className="row">
        <label className="field grow">
          <span>Serves</span>
          <input type="text" value={form.serves} onChange={set('serves')} maxLength={200} />
        </label>
        <label className="field grow">
          <span>Time</span>
          <input type="text" value={form.time} onChange={set('time')} maxLength={200} />
        </label>
      </div>
      <label className="field">
        <span>Tags, separated by commas</span>
        <input type="text" value={form.tags} onChange={set('tags')} autoCapitalize="none" />
      </label>
      <p className="muted small">One entry per line. End a line with a colon to make it a subheading.</p>
      <label className="field">
        <span>Ingredients</span>
        <textarea rows={8} value={form.ingredients} onChange={set('ingredients')} maxLength={10000} />
      </label>
      <label className="field">
        <span>Method</span>
        <textarea rows={8} value={form.method} onChange={set('method')} maxLength={10000} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea rows={4} value={form.notes} onChange={set('notes')} maxLength={10000} />
      </label>
      <label className="field">
        <span>Source or web address</span>
        <input type="text" value={form.source} onChange={set('source')} maxLength={200} />
      </label>
    </Modal>
  )
}
