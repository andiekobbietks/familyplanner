import { useRef, useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useNotePhoto } from '../api/hooks'
import type { DocPageImage, Note } from '../api/types'
import { dataUrl, preparePhoto } from '../lib/images'
import { Icon } from './Icons'
import { Modal } from './Modal'
import { useToast } from './Toast'

/**
 * Adds a note when given none. The category offers the ones already in use, so notes group together.
 * A note can have one photo, shrunk in the browser as a document page is, and saved after the note's text.
 */
export function NoteEditor({ note, categories, onClose }: { note?: Note; categories: string[]; onClose: () => void }) {
  const [form, setForm] = useState({ title: note?.title ?? '', category: note?.category ?? '', body: note?.body ?? '' })
  // Undefined leaves the photo as it is, null removes it, and an image replaces it.
  const [photo, setPhoto] = useState<DocPageImage | null>()
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)
  const current = useNotePhoto(note ?? ({ id: '', title: '', body: '', updatedAt: '' } as Note))
  const input = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const shown = photo === undefined ? (note?.photoId ? current.data : undefined) : (photo ?? undefined)
  const hasPhoto = photo === undefined ? !!note?.photoId : !!photo

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPreparing(true)
    try {
      setPhoto((await preparePhoto(file)).page)
    } catch (err) {
      toast(`${file.name}: ${(err as Error).message}`)
    } finally {
      setPreparing(false)
    }
  }

  const save = async () => {
    const body = { title: form.title.trim(), category: form.category.trim(), body: form.body }
    setSaving(true)
    try {
      const saved = note ? await mutations.patchNote(note.id, body) : await mutations.createNote(body)
      try {
        if (photo) await mutations.setNotePhoto(saved.id, photo)
        else if (photo === null && note?.photoId) await mutations.deleteNotePhoto(saved.id)
      } catch (e) {
        await qc.invalidateQueries({ queryKey: ['notes'] })
        toast(`The note is saved, but its photo isn't (${(e as Error).message}). Try adding it again.`)
        onClose()
        return
      }
      await qc.invalidateQueries({ queryKey: ['notes'] })
      onClose()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setSaving(false)
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
          <button className="btn primary" type="button" onClick={save} disabled={!form.title.trim() || preparing || saving}>
            {saving ? 'Saving…' : 'Save'}
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
      <div className="field">
        <span>Photo</span>
        <input ref={input} type="file" accept="image/*" hidden onChange={choose} />
        {hasPhoto && (
          <div className="note-photo-edit">
            {shown ? <img src={dataUrl(shown)} alt="The note's photo" /> : <p className="muted small">Loading photo…</p>}
          </div>
        )}
        <div className="note-photo-actions">
          <button className="btn sm" type="button" onClick={() => input.current?.click()} disabled={preparing || saving}>
            <Icon name="camera" size={18} />
            {preparing ? 'Preparing…' : hasPhoto ? 'Replace photo' : 'Add a photo'}
          </button>
          {hasPhoto && (
            <button className="btn sm" type="button" onClick={() => setPhoto(null)} disabled={preparing || saving}>
              Remove photo
            </button>
          )}
        </div>
      </div>
      <p className="muted small">Web addresses become links here. Notes also show on the kitchen display, so leave out anything you wouldn't pin to the fridge.</p>
    </Modal>
  )
}
