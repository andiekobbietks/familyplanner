import { useState } from 'react'
import { useNotes } from '../api/hooks'
import type { Note } from '../api/types'
import { Icon } from '../components/Icons'
import { NoteEditor } from '../components/NoteEditor'
import { groupNotes, linkParts, matchesNote, noteCategories } from '../lib/notes'

/** A note's text as written, line breaks kept, with http(s) addresses as links and nothing else (S14). */
export function NoteText({ text }: { text: string }) {
  return (
    <p className="note-body">
      {linkParts(text).map((p, i) =>
        p.url ? (
          <a key={i} href={p.url} target="_blank" rel="noreferrer">
            {p.text}
          </a>
        ) : (
          p.text
        ),
      )}
    </p>
  )
}

/** Family notes: the neighbours, appliances and manuals, and anything else worth having to hand. Any member can edit. */
export function Notes() {
  const { data: notes = [], isLoading } = useNotes()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Note | 'new'>()
  const groups = groupNotes(notes.filter((n) => matchesNote(n, search)))

  return (
    <>
      <div className="page-head">
        <h1 className="grow">Family notes</h1>
        <button className="btn sm primary" type="button" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} />
          New
        </button>
      </div>

      {notes.length > 0 && (
        <input className="recipe-search notes-search" type="search" aria-label="Search notes" placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}

      {isLoading && <p className="loading">Loading…</p>}
      {!isLoading && notes.length === 0 && (
        <div className="card">
          <p className="empty">No notes yet. Add the neighbours' names, appliance model numbers, where the manuals are, or anything else the family should have to hand.</p>
        </div>
      )}
      {!isLoading && notes.length > 0 && groups.length === 0 && (
        <div className="card">
          <p className="empty">Nothing matches.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.category} aria-label={g.category}>
          <h2 className="section-title">{g.category}</h2>
          <div className="card">
            {g.notes.map((n) => (
              <article key={n.id} className="note">
                <div className="note-head">
                  <h3 className="grow">{n.title}</h3>
                  <button type="button" className="icon-btn" aria-label={`Edit ${n.title}`} onClick={() => setEditing(n)}>
                    <Icon name="edit" size={20} />
                  </button>
                </div>
                {n.body.trim() && <NoteText text={n.body} />}
              </article>
            ))}
          </div>
        </section>
      ))}

      {editing && <NoteEditor note={editing === 'new' ? undefined : editing} categories={noteCategories(notes)} onClose={() => setEditing(undefined)} />}
    </>
  )
}
