import { useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useLists, useMe, useSettings } from '../api/hooks'
import { Icon } from './Icons'
import { Modal } from './Modal'

type Kind = 'shopping' | 'task'
const KEY = 'fp.quickadd.kind'
const KINDS: { kind: Kind; label: string; placeholder: string }[] = [
  { kind: 'shopping', label: 'Shopping', placeholder: 'Milk, bin bags…' },
  { kind: 'task', label: 'To-do', placeholder: 'Book the dentist…' },
]

/** A button in thumb reach that opens a sheet. Stays open after adding, because shopping items tend to come in runs. Remembers the last type used (section 5.2). */
export function QuickAdd() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="fab" aria-label="Add something" onClick={() => setOpen(true)}>
        <Icon name="plus" size={26} />
      </button>
      {open && <QuickAddSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(() => {
    try {
      return localStorage.getItem(KEY) === 'task' ? 'task' : 'shopping'
    } catch {
      return 'shopping'
    }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // The sheet sits above toasts, so results are reported inside it.
  const [status, setStatus] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const { data: lists } = useLists()
  const { data: settings } = useSettings()
  const { data: me } = useMe()
  const qc = useQueryClient()

  const choose = (k: Kind) => {
    setKind(k)
    setStatus('')
    input.current?.focus()
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
        setStatus(`Added ${title} to ${lists?.find((l) => l.id === listId)?.name ?? 'the list'}`)
      } else {
        await mutations.createTask({ title, assignee: me?.id })
        void qc.invalidateQueries({ queryKey: ['tasks'] })
        setStatus(`To-do added: ${title}`)
      }
      setText('')
    } catch (err) {
      setStatus((err as Error).message)
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  return (
    <Modal title="Add" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="seg" role="group" aria-label="Type">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => choose(k.kind)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="row">
          <input ref={input} data-autofocus type="text" aria-label="What to add" placeholder={KINDS.find((k) => k.kind === kind)!.placeholder} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" enterKeyHint="done" />
          <button className="btn primary" type="submit" disabled={busy || !text.trim()}>
            Add
          </button>
        </div>
        <p className="quick-status small" role="status">
          {status}
        </p>
      </form>
    </Modal>
  )
}
