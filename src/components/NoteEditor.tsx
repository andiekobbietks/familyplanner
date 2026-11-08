import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations } from '../api/hooks'
import type { Note } from '../api/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

/** Adds a note when given none. The category offers the ones already in use, so notes group together. */
export function NoteEditor({ note, categories, onClose }: { note?: Note; categories: string[]; onClose: () => void }) {
  const [form, setForm] = useState({ title: note?.title ?? '', category: note?.category ?? '', body: note?.body ?? '' })
  const qc = useQueryClient()
  const toast = useToast()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const save = async () => {
    const body = { title: form.title.trim(), category: form.category.trim(), body: form.body }
    try {
      if (note) await mutations.patchNote(note.id, body)
      else await mutations.createNote(body)
      await qc.invalidateQueries({ queryKey: ['notes'] })
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const remove = async () => {
    if (!note || !confirm(`Delete ${note.title}?`)) return
    try {
      await mutations.deleteNote(note.id)
      await qc.invalidateQueries({ queryKey: ['notes'] })
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Modal
      title={note ? 'Edit note' : 'New note'}
      onClose={onClose}
      footer={
        <>
          {note && (
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
        <input type="text" value={form.title} onChange={set('title')} maxLength={200} placeholder="Washing machine" data-autofocus={note ? undefined : true} />
      </label>
      <label className="field">
        <span>Category</span>
        <input type="text" value={form.category} onChange={set('category')} maxLength={50} list="note-categories" placeholder="Appliances, Neighbours…" />
        <datalist id="note-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Note</span>
        <textarea rows={10} value={form.body} onChange={set('body')} maxLength={10000} placeholder="Model number, where the manual is, a web address…" />
      </label>
      <p className="muted small">Web addresses become links here. Notes also show on the kitchen display, so leave out anything you wouldn't pin to the fridge.</p>
    </Modal>
  )
}
