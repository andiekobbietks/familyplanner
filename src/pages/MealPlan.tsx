import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { mutations, usePlan, useSettings } from '../api/hooks'
import type { PlanEntry, Slot } from '../api/types'
import { Icon } from '../components/Icons'
import { MealInput, useSetCell } from '../components/MealInput'
import { Modal } from '../components/Modal'
import { PageTabs } from '../components/PageTabs'
import { useToast } from '../components/Toast'
import { WeekNav } from '../components/WeekNav'
import { fmtDay, fmtWeekday, mondayOf, todayISO, weekDays } from '../lib/dates'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export const MEAL_TABS = [
  { to: '/meals', label: 'Plan', end: true },
  { to: '/meals/recipes', label: 'Recipes' },
]

export function MealPlan() {
  const today = todayISO()
  const [params, setParams] = useSearchParams()
  const week = params.get('week') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('week')!) ? mondayOf(params.get('week')!) : mondayOf(today)
  const { data: plan = [] } = usePlan(week)
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const setCell = useSetCell()
  const [moving, setMoving] = useState<PlanEntry | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const slots: Slot[] = settings?.breakfastEnabled ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
  const days = weekDays(week)
  const cell = (date: string, slot: Slot) => plan.find((p) => p.date === date && p.slot === slot)
  const setWeek = (w: string) => setParams({ week: w })

  /** Moving onto a filled cell swaps the two. */
  const move = async (from: PlanEntry, date: string, slot: Slot) => {
    if (from.date === date && from.slot === slot) return
    const target = cell(date, slot)
    await setCell(date, slot, from.text)
    await setCell(from.date, from.slot, target?.text ?? '')
  }

  const copyLastWeek = async () => {
    const { copied } = await mutations.copyWeek(week)
    void qc.invalidateQueries({ queryKey: ['plan'] })
    toast(copied ? `Copied ${copied} meal${copied === 1 ? '' : 's'} from last week` : 'Nothing to copy, or every cell was already filled')
  }

  return (
    <>
      <PageTabs tabs={MEAL_TABS} />
      <WeekNav week={week} onChange={setWeek} />

      <div className="plan">
        {days.map((d) => (
          <section key={d} className={`plan-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}>
            <h2 className="plan-date" aria-label={fmtDay(d)}>
              <span>{fmtWeekday(d)}</span>
              <b>{Number(d.slice(8))}</b>
            </h2>
            <div className="plan-rows">
              {slots.map((s) => {
                const c = cell(d, s)
                const key = `${d}:${s}`
                return (
                  <div
                    key={s}
                    className={`plan-row ${dragOver === key ? 'dragover' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(key)
                    }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(null)
                      const from = plan.find((p) => p.id === e.dataTransfer.getData('text/plain'))
                      if (from) void move(from, d, s)
                    }}
                  >
                    <span className="slot">{cap(s)}</span>
                    <MealInput date={d} slot={s} saved={c?.text} />
                    {c && (
                      <button type="button" className="icon-btn move" draggable aria-label={`Move ${c.text}`} title="Tap to move, or drag" onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} onClick={() => setMoving(c)}>
                        <Icon name="move" size={18} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <button className="btn sm plan-copy" type="button" onClick={copyLastWeek}>
        Copy last week
      </button>

      {moving && (
        <Modal title={`Move ${moving.text}`} onClose={() => setMoving(null)}>
          <p className="muted small">
            {cap(moving.slot)} on {fmtDay(moving.date)}
          </p>
          <label className="field">
            <span>Move to</span>
            <select
              defaultValue=""
              onChange={async (e) => {
                const [d, s] = e.target.value.split(':')
                if (!d) return
                const from = moving
                setMoving(null)
                await move(from, d, s as Slot)
              }}
            >
              <option value="">Choose a day…</option>
              {days.flatMap((d) =>
                slots.map((s) => (
                  <option key={`${d}:${s}`} value={`${d}:${s}`} disabled={d === moving.date && s === moving.slot}>
                    {fmtDay(d)} {s}
                    {cell(d, s) ? ' (swap)' : ''}
                  </option>
                )),
              )}
            </select>
          </label>
          <button
            className="btn danger block"
            type="button"
            onClick={() => {
              const { date, slot } = moving
              setMoving(null)
              void setCell(date, slot, '')
            }}
          >
            Clear
          </button>
        </Modal>
      )}
    </>
  )
}
