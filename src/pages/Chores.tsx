import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { mutations, useChores } from '../api/hooks'
import type { Chore, ChoreSchedule } from '../api/types'
import { Icon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { PersonChips } from '../components/People'
import { useToast } from '../components/Toast'
import { WeekNav } from '../components/WeekNav'
import { mondayOf, todayISO } from '../lib/dates'

/** Who has which chore, week by week. It only shows the schedule: there is nothing to tick off, and no one assigned means anyone. */
export function Chores() {
  const [params, setParams] = useSearchParams()
  const week = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? mondayOf(params.get('week')!) : mondayOf(todayISO())
  const { data, isLoading } = useChores(week)
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Chore | null>(null)

  const refresh = () => void qc.invalidateQueries({ queryKey: ['chores'] })
  const chores = data?.chores ?? []
  const assignments = data?.assignments ?? []

  const assign = async (choreId: string, memberId: string | undefined) => {
    qc.setQueryData<ChoreSchedule>(['chores', week], (old) =>
      old && { ...old, assignments: [...old.assignments.filter((a) => a.choreId !== choreId), ...(memberId ? [{ choreId, memberId }] : [])] },
    )
    try {
      if (memberId) await mutations.assignChore(choreId, week, memberId)
      else await mutations.unassignChore(choreId, week)
    } catch (e) {
      toast((e as Error).message)
    }
    refresh()
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setName('')
    try {
      await mutations.createChore(n)
      refresh()
    } catch (err) {
      toast((err as Error).message)
    }
  }

  const copyLastWeek = async () => {
    const { copied } = await mutations.copyChoreWeek(week)
    refresh()
    toast(copied ? `Copied ${copied} from last week` : 'Nothing to copy, or every chore was already assigned')
  }

  return (
    <>
      <WeekNav week={week} onChange={(w) => setParams({ view: 'chores', week: w })} />

      <div className="card">
        {isLoading && <p className="loading">Loading…</p>}
        {!isLoading && chores.length === 0 && <p className="empty">No chores yet. Add the first one below.</p>}
        {chores.map((c) => (
          <div className="chore" key={c.id}>
            <div className="chore-name">
              <span className="grow">{c.name}</span>
              <button className="icon-btn" type="button" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                <Icon name="edit" size={18} />
              </button>
            </div>
            <PersonChips value={assignments.filter((a) => a.choreId === c.id).map((a) => a.memberId)} onChange={(v) => void assign(c.id, v[0])} single />
          </div>
        ))}
      </div>

      <form className="card row" onSubmit={add}>
        <input type="text" aria-label="New chore" placeholder="Add a chore…" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} enterKeyHint="done" />
        <button className="btn primary" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>

      {chores.length > 0 && (
        <button className="btn sm" type="button" onClick={copyLastWeek}>
          Copy last week
        </button>
      )}

      {editing && (
        <ChoreEditor
          key={editing.id}
          chore={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </>
  )
}

function ChoreEditor({ chore, onClose, onSaved }: { chore: Chore; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(chore.name)
  const toast = useToast()
  const save = async () => {
    try {
      await mutations.renameChore(chore.id, name.trim())
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <Modal
      title="Edit chore"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              if (!confirm(`Delete ${chore.name} from every week?`)) return
              await mutations.deleteChore(chore.id)
              onSaved()
            }}
          >
            Delete
          </button>
          <button className="btn primary" type="button" onClick={save} disabled={!name.trim()}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} data-autofocus />
      </label>
    </Modal>
  )
}
