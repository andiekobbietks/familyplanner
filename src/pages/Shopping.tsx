import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { mutations, useItems, useLists, useMe } from '../api/hooks'
import { CATEGORIES, type Category, type Item } from '../api/types'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'

/** Plain-text form of the unchecked items, grouped by category when any are categorised (section 5.4). */
export function itemsToText(items: Item[]): string {
  const open = items.filter((i) => !i.checked)
  const line = (i: Item) => (i.note ? `${i.name} ${i.note}` : i.name)
  if (!open.some((i) => i.category)) return open.map(line).join('\n')
  const groups = new Map<string, Item[]>()
  for (const i of open) {
    const k = i.category ?? ''
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(i)
  }
  const order = ['', ...CATEGORIES].filter((c) => groups.has(c))
  return order.map((c) => (c ? `${c}\n` : '') + groups.get(c)!.map(line).join('\n')).join('\n\n')
}

export function Shopping() {
  const [params, setParams] = useSearchParams()
  const { data: lists } = useLists()
  const { data: me } = useMe()
  const listId = params.get('list') ?? lists?.[0]?.id
  const list = lists?.find((l) => l.id === listId)
  const { data: items = [], isLoading } = useItems(listId, true)
  const qc = useQueryClient()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null)
  const [newList, setNewList] = useState(false)

  useEffect(() => {
    if (!params.get('list') && lists?.[0]) setParams({ list: lists[0].id }, { replace: true })
  }, [lists, params, setParams])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['items', listId] })
    void qc.invalidateQueries({ queryKey: ['lists'] })
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || !listId) return
    setName('')
    inputRef.current?.focus()
    try {
      await mutations.addItem(listId, { name: n })
      invalidate()
    } catch (err) {
      toast((err as Error).message)
    }
  }

  const toggle = async (item: Item) => {
    qc.setQueryData<Item[]>(['items', listId], (old) => old?.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)))
    try {
      await mutations.patchItem(item.id, { checked: !item.checked })
    } finally {
      invalidate()
    }
  }

  const clearDone = async () => {
    if (!listId || !confirm('Delete all checked items?')) return
    const { removed } = await mutations.clearChecked(listId)
    invalidate()
    toast(`Cleared ${removed} item${removed === 1 ? '' : 's'}`)
  }

  const copy = async () => {
    const text = itemsToText(items)
    const count = items.filter((i) => !i.checked).length
    try {
      await navigator.clipboard.writeText(text)
      toast(`Copied ${count} item${count === 1 ? '' : 's'}`)
    } catch {
      setCopyFallback(text)
    }
  }

  const grouped = useMemo(() => {
    const open = items.filter((i) => !i.checked)
    const groups: { key: string; items: Item[] }[] = [{ key: '', items: open.filter((i) => !i.category) }]
    for (const c of CATEGORIES) {
      const g = open.filter((i) => i.category === c)
      if (g.length) groups.push({ key: c, items: g })
    }
    return groups.filter((g) => g.items.length)
  }, [items])
  const done = items.filter((i) => i.checked)
  const anyCategory = items.some((i) => !i.checked && i.category)

  return (
    <>
      <div className="row between">
        <h1>Shopping</h1>
        {me?.role === 'admin' && (
          <button className="btn sm" type="button" onClick={() => setNewList(true)}>
            + New list
          </button>
        )}
      </div>
      <div className="listtabs" role="tablist">
        {(lists ?? []).map((l) => (
          <button key={l.id} role="tab" aria-selected={l.id === listId} className={`chip ${l.id === listId ? 'on' : ''}`} onClick={() => setParams({ list: l.id })}>
            {l.name} {l.uncheckedCount > 0 && <span>({l.uncheckedCount})</span>}
          </button>
        ))}
      </div>

      {list && (
        <div className="card">
          <form className="row" onSubmit={add}>
            <input ref={inputRef} type="text" aria-label={`Add to ${list.name}`} placeholder={`Add to ${list.name}…`} value={name} onChange={(e) => setName(e.target.value)} list="recent-names" maxLength={200} autoComplete="off" enterKeyHint="done" />
            <datalist id="recent-names">
              {list.recentNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button className="btn primary" type="submit" disabled={!name.trim()}>
              Add
            </button>
          </form>
          <div className="row wrap" style={{ marginTop: '0.75rem' }}>
            <button className="btn sm" type="button" onClick={copy} disabled={!items.some((i) => !i.checked)}>
              Copy list
            </button>
            {me?.role === 'admin' && (
              <button
                className="btn sm danger"
                type="button"
                onClick={async () => {
                  if (!confirm(`Delete the list "${list.name}" and everything on it?`)) return
                  await mutations.deleteList(list.id)
                  setParams({})
                  invalidate()
                }}
              >
                Delete list
              </button>
            )}
          </div>

          {isLoading && <p className="loading">Loading…</p>}
          {!isLoading && grouped.length === 0 && <p className="empty">Nothing to buy. Add something above.</p>}
          {grouped.map((g) => (
            <div className="catgroup" key={g.key || 'none'}>
              {anyCategory && g.key && <h3>{g.key}</h3>}
              <ul className="list">
                {g.items.map((i) => (
                  <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onEdit={() => setEditing(i)} />
                ))}
              </ul>
            </div>
          ))}
          {done.length > 0 && (
            <details className="done">
              <summary>Done ({done.length})</summary>
              <ul className="list">
                {done.map((i) => (
                  <ItemRow key={i.id} item={i} onToggle={() => toggle(i)} onEdit={() => setEditing(i)} />
                ))}
              </ul>
              <button className="btn sm" type="button" onClick={clearDone}>
                Clear done
              </button>
            </details>
          )}
        </div>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            invalidate()
          }}
        />
      )}
      {copyFallback !== null && (
        <Modal title="Copy the list" onClose={() => setCopyFallback(null)}>
          <p className="muted small">Clipboard access was blocked. Select the text below and copy it.</p>
          <textarea className="copybox" readOnly value={copyFallback} onFocus={(e) => e.target.select()} />
        </Modal>
      )}
      {newList && (
        <NewList
          onClose={() => setNewList(false)}
          onCreated={(id) => {
            setNewList(false)
            invalidate()
            setParams({ list: id })
          }}
        />
      )}
    </>
  )
}

function ItemRow({ item, onToggle, onEdit }: { item: Item; onToggle: () => void; onEdit: () => void }) {
  return (
    <li className={item.checked ? 'checked' : ''}>
      <input type="checkbox" checked={item.checked} onChange={onToggle} aria-label={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`} />
      <span className="title" onClick={onToggle}>
        {item.name}
        {item.note && <span className="sub">{item.note}</span>}
      </span>
      <button className="icon-btn" type="button" aria-label={`Edit ${item.name}`} onClick={onEdit}>
        ✎
      </button>
    </li>
  )
}

function ItemEditor({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item.name)
  const [note, setNote] = useState(item.note ?? '')
  const [category, setCategory] = useState<Category | ''>(item.category ?? '')
  const toast = useToast()
  const save = async () => {
    try {
      await mutations.patchItem(item.id, { name: name.trim(), note: note.trim(), category: category || undefined })
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <Modal
      title="Edit item"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            type="button"
            onClick={async () => {
              await mutations.deleteItem(item.id)
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
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </label>
      <label className="field">
        <span>Quantity or note</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="2 kg" maxLength={200} />
      </label>
      <label className="field">
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
          <option value="">None</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
    </Modal>
  )
}

function NewList({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const toast = useToast()
  return (
    <Modal
      title="New list"
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          type="button"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              const l = await mutations.createList(name.trim())
              onCreated(l.id)
            } catch (e) {
              toast((e as Error).message)
            }
          }}
        >
          Create
        </button>
      }
    >
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Christmas" maxLength={200} autoFocus />
      </label>
    </Modal>
  )
}
