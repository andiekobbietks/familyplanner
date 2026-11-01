import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useLists, useMe, useSettings } from '../api/hooks'
import { localTz, todayISO } from '../lib/dates'
import { useToast } from './Toast'

type Kind = 'event' | 'shopping' | 'task'
const KEY = 'fp.quickadd.kind'

/** Type text, choose a type, submit. Remembers the last type used (section 5.2). */
export function QuickAdd() {
  const [kind, setKind] = useState<Kind>(() => {
    try {
      return (localStorage.getItem(KEY) as Kind) || 'shopping'
    } catch {
      return 'shopping'
    }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: lists } = useLists()
  const { data: settings } = useSettings()
  const { data: me } = useMe()
  const qc = useQueryClient()
  const toast = useToast()

  const choose = (k: Kind) => {
    setKind(k)
    try {
      localStorage.setItem(KEY, k)
    } catch {
      /* ignore */
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const title = text.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      if (kind === 'shopping') {
        const listId = settings?.defaultListId ?? lists?.[0]?.id
        if (!listId) throw new Error('No shopping list yet')
        await mutations.addItem(listId, { name: title })
        void qc.invalidateQueries({ queryKey: ['lists'] })
        void qc.invalidateQueries({ queryKey: ['items'] })
        toast(`Added "${title}" to ${lists?.find((l) => l.id === listId)?.name ?? 'the list'}`)
      } else if (kind === 'task') {
        await mutations.createTask({ title, assignee: me?.id })
        void qc.invalidateQueries({ queryKey: ['tasks'] })
        toast(`Task added: ${title}`)
      } else {
        const today = todayISO()
        await mutations.createEvent({ title, allDay: true, start: today, end: today, tz: localTz(), assignees: me ? [me.id] : [] })
        void qc.invalidateQueries({ queryKey: ['events'] })
        toast(`Event added today: ${title}`)
      }
      setText('')
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="quickadd" onSubmit={submit}>
      <input
        type="text"
        aria-label="Quick add"
        placeholder={kind === 'shopping' ? 'Add to shopping…' : kind === 'task' ? 'Add a to-do…' : 'Add an event for today…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
      />
      <select aria-label="Type" value={kind} onChange={(e) => choose(e.target.value as Kind)}>
        <option value="shopping">Shopping</option>
        <option value="task">To-do</option>
        <option value="event">Event</option>
      </select>
      <button className="btn primary" type="submit" disabled={busy || !text.trim()}>
        Add
      </button>
    </form>
  )
}
