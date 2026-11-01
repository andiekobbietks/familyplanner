import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { mutations, useLists, useMeals, usePlan, useSettings } from '../api/hooks'
import type { Meal, PlanEntry, Slot } from '../api/types'
import { Modal } from '../components/Modal'
import { Avatar, PersonChips, usePersonMap } from '../components/People'
import { useToast } from '../components/Toast'
import { addDays, fmtDay, fmtWeekday, mondayOf, relativeDay, todayISO, weekDays } from '../lib/dates'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export function MealPlan() {
  const today = todayISO()
  const [params, setParams] = useSearchParams()
  const week = params.get('week') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('week')!) ? mondayOf(params.get('week')!) : mondayOf(today)
  const { data: plan = [] } = usePlan(week)
  const { data: settings } = useSettings()
  const { data: lists = [] } = useLists()
  const { data: meals = [] } = useMeals()
  const people = usePersonMap()
  const qc = useQueryClient()
  const toast = useToast()
  const [picking, setPicking] = useState<{ date: string; slot: Slot } | null>(null)
  const [menuFor, setMenuFor] = useState<PlanEntry | null>(null)
  const [shopConfirm, setShopConfirm] = useState<{ mealIds?: string[]; week?: string; count: number } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    const pick = params.get('pick')
    if (pick) {
      const [date, slot] = pick.split(':')
      setPicking({ date, slot: slot as Slot })
      params.delete('pick')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const slots: Slot[] = settings?.breakfastEnabled ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
  const days = weekDays(week)
  const cells = useMemo(() => new Map(plan.map((p) => [`${p.date}:${p.slot}`, p])), [plan])
  const cell = (date: string, slot: Slot) => cells.get(`${date}:${slot}`)
  const mealById = new Map(meals.map((m) => [m.id, m]))
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['plan'] })
    void qc.invalidateQueries({ queryKey: ['meals'] })
  }

  const setWeek = (w: string) => setParams({ week: w })

  const move = async (from: PlanEntry, date: string, slot: Slot) => {
    if (from.date === date && from.slot === slot) return
    const target = cell(date, slot)
    const body = (p: PlanEntry) => ({ mealId: p.mealId, text: p.text, cook: p.cook, note: p.note })
    await mutations.setCell(date, slot, body(from))
    if (target) await mutations.setCell(from.date, from.slot, body(target))
    else await mutations.clearCell(from.date, from.slot)
    invalidate()
  }

  const shopMeals = (mealIds: string[]) => {
    const count = mealIds.reduce((n, id) => n + (mealById.get(id)?.ingredients.length ?? 0), 0)
    setShopConfirm({ mealIds, count })
  }
  const shopWeek = () => {
    const ids = plan.filter((p) => p.mealId).map((p) => p.mealId!)
    const count = ids.reduce((n, id) => n + (mealById.get(id)?.ingredients.length ?? 0), 0)
    setShopConfirm({ week, count })
  }

  const copyLastWeek = async () => {
    const { copied } = await mutations.copyWeek(week)
    invalidate()
    toast(copied ? `Copied ${copied} meal${copied === 1 ? '' : 's'} from last week` : 'Nothing to copy, or every cell was already filled')
  }

  const renderCell = (date: string, slot: Slot) => {
    const c = cell(date, slot)
    const key = `${date}:${slot}`
    return (
      <button
        type="button"
        className={`cell ${c ? '' : 'empty'} ${dragOver === key ? 'dragover' : ''}`}
        draggable={!!c}
        onDragStart={(e) => c && e.dataTransfer.setData('text/plain', c.id)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(key)
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(null)
          const from = plan.find((p) => p.id === e.dataTransfer.getData('text/plain'))
          if (from) void move(from, date, slot)
        }}
        onClick={() => (c ? setMenuFor(c) : setPicking({ date, slot }))}
        aria-label={`${cap(slot)} on ${fmtDay(date)}: ${c ? (c.mealName ?? c.text) : 'empty'}`}
      >
        {c ? (
          <>
            <span className={`name ${c.mealId ? '' : 'text'}`}>{c.mealName ?? c.text}</span>
            {(c.cook || c.note) && (
              <span className="extra">
                {c.cook && <Avatar person={people.get(c.cook)} size={16} />} {c.note}
              </span>
            )}
          </>
        ) : (
          `Plan ${slot}`
        )}
      </button>
    )
  }

  return (
    <>
      <div className="cal-head">
        <h1>{week === mondayOf(today) ? 'This week' : `Week of ${fmtDay(week)}`}</h1>
        <button className="btn sm" type="button" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
          ‹
        </button>
        <button className="btn sm" type="button" onClick={() => setWeek(mondayOf(today))}>
          Today
        </button>
        <button className="btn sm" type="button" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">
          ›
        </button>
      </div>
      <div className="row wrap" style={{ marginBottom: '0.75rem' }}>
        <button className="btn sm" type="button" onClick={copyLastWeek}>
          Copy last week
        </button>
        <button className="btn sm" type="button" onClick={shopWeek} disabled={!plan.some((p) => p.mealId)}>
          Shop this week
        </button>
        <Link className="btn sm" to="/meals/library">
          Meal library
        </Link>
      </div>

      <div className="plan-phone">
        {days.map((d) => (
          <section key={d} className={`plan-day ${d === today ? 'today' : ''}`}>
            <h2>{relativeDay(d) === fmtDay(d) ? fmtDay(d) : `${relativeDay(d)} · ${fmtDay(d)}`}</h2>
            {slots.map((s) => (
              <div className="plan-row" key={s}>
                <span className="slot">{s}</span>
                {renderCell(d, s)}
              </div>
            ))}
          </section>
        ))}
      </div>

      <div className="plan-desk">
        <div />
        {days.map((d) => (
          <div key={d} className={`hd ${d === today ? 'today' : ''}`}>
            {fmtWeekday(d)} {Number(d.slice(8))}
          </div>
        ))}
        {slots.map((s) => (
          <Fragment key={s}>
            <div className="slotname">
              {s}
            </div>
            {days.map((d) => (
              <div className="cellwrap" key={`${d}-${s}`}>
                {renderCell(d, s)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>

      {picking && (
        <MealPicker
          date={picking.date}
          slot={picking.slot}
          yesterday={cell(addDays(picking.date, -1), picking.slot)}
          onClose={() => setPicking(null)}
          onSaved={() => {
            setPicking(null)
            invalidate()
          }}
        />
      )}

      {menuFor && (
        <Modal title={menuFor.mealName ?? menuFor.text ?? ''} onClose={() => setMenuFor(null)}>
          <p className="muted small">
            {cap(menuFor.slot)} on {fmtDay(menuFor.date)}
            {menuFor.cook && <> · cook: {people.get(menuFor.cook)?.displayName}</>}
            {menuFor.note && <> · {menuFor.note}</>}
          </p>
          <div className="stack">
            {menuFor.mealId && (
              <button className="btn" type="button" style={{ width: '100%' }} onClick={() => (setMenuFor(null), shopMeals([menuFor.mealId!]))}>
                Add ingredients to list
              </button>
            )}
            <button className="btn" type="button" style={{ width: '100%' }} onClick={() => (setMenuFor(null), setPicking({ date: menuFor.date, slot: menuFor.slot }))}>
              Change
            </button>
            <label className="field">
              <span>Move to</span>
              <select
                defaultValue=""
                onChange={async (e) => {
                  const [d, s] = e.target.value.split(':')
                  if (!d) return
                  await move(menuFor, d, s as Slot)
                  setMenuFor(null)
                }}
              >
                <option value="">Choose a day…</option>
                {days.flatMap((d) => slots.map((s) => (
                  <option key={`${d}:${s}`} value={`${d}:${s}`} disabled={d === menuFor.date && s === menuFor.slot}>
                    {fmtDay(d)} {s}
                    {cell(d, s) ? ' (swap)' : ''}
                  </option>
                )))}
              </select>
            </label>
            <button
              className="btn danger"
              type="button"
              style={{ width: '100%' }}
              onClick={async () => {
                await mutations.clearCell(menuFor.date, menuFor.slot)
                setMenuFor(null)
                invalidate()
              }}
            >
              Clear
            </button>
          </div>
        </Modal>
      )}

      {shopConfirm && (
        <ShopConfirm
          count={shopConfirm.count}
          lists={lists}
          defaultListId={settings?.defaultListId ?? lists[0]?.id}
          onClose={() => setShopConfirm(null)}
          onConfirm={async (listId) => {
            const r = await mutations.shop({ listId, mealIds: shopConfirm.mealIds, week: shopConfirm.week })
            setShopConfirm(null)
            void qc.invalidateQueries({ queryKey: ['lists'] })
            void qc.invalidateQueries({ queryKey: ['items'] })
            toast(r.skipped ? `Added ${r.added}, skipped ${r.skipped} already on the list` : `Added ${r.added}`)
          }}
        />
      )}
    </>
  )
}

function ShopConfirm({ count, lists, defaultListId, onClose, onConfirm }: { count: number; lists: { id: string; name: string }[]; defaultListId?: string; onClose: () => void; onConfirm: (listId: string) => Promise<void> }) {
  const [listId, setListId] = useState(defaultListId ?? '')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="Add ingredients"
      onClose={onClose}
      footer={
        <button className="btn primary" type="button" disabled={!listId || busy} onClick={() => (setBusy(true), onConfirm(listId).finally(() => setBusy(false)))}>
          Add {count} item{count === 1 ? '' : 's'}
        </button>
      }
    >
      <p>
        {count} ingredient line{count === 1 ? '' : 's'} will be added. Lines already unchecked on the list are skipped.
      </p>
      <label className="field">
        <span>Shopping list</span>
        <select value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  )
}

/** Search the library (Lunch-tagged first for a lunch cell), "same as yesterday", free text, or create a meal inline. */
function MealPicker({ date, slot, yesterday, onClose, onSaved }: { date: string; slot: Slot; yesterday?: PlanEntry; onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState('')
  const { data: meals = [] } = useMeals(q)
  const [cook, setCook] = useState<string[]>([])
  const [note, setNote] = useState('')
  const toast = useToast()
  const tagFor = slot === 'lunch' ? 'Lunch' : slot === 'dinner' ? 'Dinner' : null
  const sorted = useMemo(() => {
    if (!tagFor) return meals
    return [...meals].sort((a, b) => Number(b.tags.includes(tagFor)) - Number(a.tags.includes(tagFor)))
  }, [meals, tagFor])
  const exact = meals.some((m) => m.name.toLowerCase() === q.trim().toLowerCase())

  const choose = async (body: { mealId?: string; text?: string }) => {
    try {
      await mutations.setCell(date, slot, { ...body, cook: cook[0] ?? null, note: note.trim() || undefined })
      onSaved()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const create = async () => {
    const m = await mutations.createMeal({ name: q.trim(), tags: tagFor ? [tagFor] : [] })
    await choose({ mealId: m.id })
  }

  return (
    <Modal title={`${cap(slot)} · ${fmtDay(date)}`} onClose={onClose}>
      <input type="search" placeholder="Search meals or type anything…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus maxLength={200} />
      <div className="row wrap" style={{ margin: '0.5rem 0' }}>
        {yesterday && (
          <button className="btn sm" type="button" onClick={() => choose(yesterday.mealId ? { mealId: yesterday.mealId } : { text: yesterday.text })}>
            Same as yesterday ({yesterday.mealName ?? yesterday.text})
          </button>
        )}
        {q.trim() && (
          <button className="btn sm" type="button" onClick={() => choose({ text: q.trim() })}>
            Use “{q.trim()}” as text
          </button>
        )}
        {q.trim() && !exact && (
          <button className="btn sm" type="button" onClick={create}>
            Create meal “{q.trim()}”
          </button>
        )}
      </div>
      <details style={{ marginBottom: '0.5rem' }}>
        <summary className="muted small" style={{ cursor: 'pointer' }}>
          Cook and note
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <PersonChips value={cook} onChange={setCook} single />
          <input type="text" placeholder="Note, e.g. start the slow cooker at 2pm" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} style={{ marginTop: '0.5rem' }} />
        </div>
      </details>
      <ul className="list mealpick">
        {sorted.map((m) => (
          <li key={m.id} className="clickable" onClick={() => choose({ mealId: m.id })}>
            <span className="title">
              {m.name}
              <span className="sub">
                {m.lastPlannedAt ? `Last planned ${fmtDay(m.lastPlannedAt)}` : 'Not planned yet'}
                {m.tags.length > 0 && ` · ${m.tags.join(', ')}`}
              </span>
            </span>
          </li>
        ))}
        {sorted.length === 0 && <li className="empty">No meals match.</li>}
      </ul>
    </Modal>
  )
}

export type { Meal }
