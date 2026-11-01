import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useMe, useTasks } from '../api/hooks'
import type { Task } from '../api/types'
import { Modal } from '../components/Modal'
import { Avatar, PersonChips, usePersonMap } from '../components/People'
import { useToast } from '../components/Toast'
import { fmtDay, relativeDay, todayISO } from '../lib/dates'

type View = 'mine' | 'all' | 'done'

export function Todos() {
  const [view, setView] = useState<View>('mine')
  const { data: tasks = [], isLoading } = useTasks(view)
  const { data: me } = useMe()
  const people = usePersonMap()
  const qc = useQueryClient()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [more, setMore] = useState(false)
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<string[]>([])
  const [editing, setEditing] = useState<Task | null>(null)
  const today = todayISO()

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['tasks'] })

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setTitle('')
    try {
      await mutations.createTask({ title: t, dueDate: due || null, assignee: assignee[0] ?? (view === 'mine' ? me?.id : null) })
      invalidate()
    } catch (err) {
      toast((err as Error).message)
    }
  }

  /** One tap completes; the toast offers undo for five seconds (section 5.5). */
  const setDone = async (task: Task, done: boolean) => {
    qc.setQueryData<Task[]>(['tasks', view], (old) => old?.filter((t) => t.id !== task.id))
    await mutations.patchTask(task.id, { done })
    invalidate()
    toast(done ? `Done: ${task.title}` : `Reopened: ${task.title}`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          await mutations.patchTask(task.id, { done: !done })
          invalidate()
        },
      },
    })
  }

  return (
    <>
      <h1>To-dos</h1>
      <div className="tabs" role="tablist">
        {(['mine', 'all', 'done'] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>
            {v === 'mine' ? 'Mine' : v === 'all' ? 'Everyone' : 'Done'}
          </button>
        ))}
      </div>

      {view !== 'done' && (
        <form className="card" onSubmit={add}>
          <div className="row">
            <input type="text" aria-label="New to-do" placeholder="Add a to-do…" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} enterKeyHint="done" />
            <button className="btn" type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} aria-label="More options">
              {more ? '▴' : '▾'}
            </button>
            <button className="btn primary" type="submit" disabled={!title.trim()}>
              Add
            </button>
          </div>
          {more && (
            <div style={{ marginTop: '0.75rem' }}>
              <label className="field">
                <span>Due</span>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
              <span className="field-label">Assign to</span>
              <PersonChips value={assignee} onChange={setAssignee} single />
            </div>
          )}
        </form>
      )}

      <div className="card">
        {isLoading && <p className="loading">Loading…</p>}
        {!isLoading && tasks.length === 0 && <p className="empty">{view === 'done' ? 'Nothing completed in the last 30 days.' : 'All clear.'}</p>}
        <ul className="list">
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? 'checked' : ''}>
              <input type="checkbox" checked={t.done} onChange={() => setDone(t, !t.done)} aria-label={`${t.done ? 'Reopen' : 'Complete'} ${t.title}`} />
              <span className="title clickable" onClick={() => setEditing(t)}>
                {t.title}
                {t.notes && <span className="sub">{t.notes}</span>}
                {t.done && t.completedAt && <span className="sub">Done {relativeDay(t.completedAt.slice(0, 10))}</span>}
              </span>
              {!t.done && t.dueDate && <span className={`due ${t.dueDate < today ? 'overdue' : t.dueDate === today ? 'today' : ''}`}>{relativeDay(t.dueDate)}</span>}
              {t.assignee && <Avatar person={people.get(t.assignee)} />}
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <TaskEditor
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            invalidate()
          }}
        />
      )}
    </>
  )
}

function TaskEditor({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [due, setDue] = useState(task.dueDate ?? '')
  const [assignee, setAssignee] = useState<string[]>(task.assignee ? [task.assignee] : [])
  const [notes, setNotes] = useState(task.notes ?? '')
  const toast = useToast()
  const save = async () => {
    try {
      await mutations.patchTask(task.id, { title: title.trim(), dueDate: due || null, assignee: assignee[0] ?? null, notes: notes.trim() })
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <Modal
      title="Edit to-do"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              if (!confirm('Delete this to-do?')) return
              await mutations.deleteTask(task.id)
              onSaved()
            }}
          >
            Delete
          </button>
          <button className="btn primary" type="button" onClick={save} disabled={!title.trim()}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </label>
      <label className="field">
        <span>Due {due && <em className="muted">({fmtDay(due)})</em>}</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <span className="field-label">Assign to</span>
      <PersonChips value={assignee} onChange={setAssignee} single />
      <label className="field" style={{ marginTop: '0.75rem' }}>
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </label>
    </Modal>
  )
}
