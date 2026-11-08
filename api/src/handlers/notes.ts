import { notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { noteIntakeSchema, notePatchSchema, noteSchema, parse } from '../lib/schemas'
import type { Note } from '../lib/types'
import { stamp, touch } from '../lib/util'

/** By category, uncategorised last, then by title. The wall reads this too, so it must stay read-only there. */
export const getNotes: Handler = async ({ store, caller }) => {
  const notes = await store.byType<Note>(caller.familyId, 'note')
  const cat = (n: Note) => n.category || '￿'
  notes.sort((a, b) => cat(a).localeCompare(cat(b)) || a.title.localeCompare(b.title))
  return { body: notes }
}

export const createNote: Handler = async ({ store, caller }, _p, _q, body) => {
  const data = parse(noteSchema, body)
  const saved = await store.upsert(stamp(caller, 'note', { body: '', ...data, category: data.category || undefined }))
  return { status: 201, body: saved }
}

export const patchNote: Handler = async ({ store, caller }, params, _q, body) => {
  const note = await store.get<Note>(caller.familyId, params.id, 'note')
  if (!note) throw notFound('Note not found')
  const patch = parse(notePatchSchema, body)
  // An emptied category takes the note out of its group rather than leaving an empty heading.
  if (patch.category === '') patch.category = undefined
  const saved = await store.upsert(touch(caller, note, patch))
  return { body: saved }
}

export const deleteNote: Handler = async ({ store, caller }, params) => {
  const note = await store.get<Note>(caller.familyId, params.id, 'note')
  if (!note) throw notFound('Note not found')
  await store.delete(caller.familyId, note.id)
  return { status: 204 }
}

/**
 * For Hermes, which reads the family notes org file daily, as it does recipes (section 5.11). It can add notes
 * and learn whether a title it sent already exists. It can't read, change or delete anything, so an edit made
 * in the app is never overwritten.
 */
export const intakeNotes: Handler = async ({ store, caller }, _p, _q, body) => {
  const { notes } = parse(noteIntakeSchema, body)
  const key = (title: string) => title.trim().toLowerCase()
  const have = new Set((await store.byType<Note>(caller.familyId, 'note')).map((n) => key(n.title)))
  const added: string[] = []
  const skipped: string[] = []
  const failed: { title: string; error: string }[] = []
  for (const raw of notes) {
    const result = noteSchema.safeParse(raw)
    if (!result.success) {
      const title = String((raw as { title?: unknown } | null)?.title ?? 'Untitled').slice(0, 200)
      const issue = result.error.issues[0]
      failed.push({ title, error: `${issue?.path.join('.')}: ${issue?.message}` })
    } else if (have.has(key(result.data.title))) {
      skipped.push(result.data.title)
    } else {
      await store.upsert(stamp(caller, 'note', { body: '', ...result.data, category: result.data.category || undefined }))
      have.add(key(result.data.title))
      added.push(result.data.title)
    }
  }
  return { body: { added, skipped, failed } }
}
