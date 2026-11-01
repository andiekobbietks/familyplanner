import { Link } from 'react-router-dom'
import { useEvents, useLists, useMe, usePlan, useSettings, useTasks } from '../api/hooks'
import type { Occurrence, PlanEntry, Slot } from '../api/types'
import { QuickAdd } from '../components/QuickAdd'
import { Avatars } from '../components/People'
import { addDays, dateOfInstant, fmtDayLong, fmtTime, mondayOf, relativeDay, todayISO } from '../lib/dates'

function slotsFor(breakfast: boolean): Slot[] {
  return breakfast ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
}

export function Home() {
  const today = todayISO()
  const tomorrow = addDays(today, 1)
  const { data: me } = useMe()
  const { data: events } = useEvents(today, addDays(today, 6))
  const { data: lists } = useLists()
  const { data: tasks } = useTasks('mine')
  const { data: settings } = useSettings()
  const thisWeek = usePlan(mondayOf(today))
  const nextWeek = usePlan(mondayOf(tomorrow))
  const afterThree = new Date().getHours() >= 15

  const byDay = new Map<string, Occurrence[]>()
  for (const e of events ?? []) {
    const d = e.allDay ? e.start : dateOfInstant(e.start)
    // A multi-day all-day event shows on each day it covers.
    const last = e.allDay ? e.end : dateOfInstant(e.end)
    for (let day = d < today ? today : d; day <= last && day <= addDays(today, 6); day = addDays(day, 1)) {
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day)!.push(e)
    }
  }
  const days = [...byDay.keys()].sort()

  const dueTasks = (tasks ?? []).filter((t) => t.dueDate && t.dueDate <= today)
  const planFor = (date: string) => (mondayOf(date) === mondayOf(today) ? thisWeek.data : nextWeek.data) ?? []
  const cell = (date: string, slot: Slot): PlanEntry | undefined => planFor(date).find((p) => p.date === date && p.slot === slot)

  const mealLine = (date: string, slot: Slot) => {
    const c = cell(date, slot)
    const label = slot[0].toUpperCase() + slot.slice(1)
    return (
      <div className="mealline" key={`${date}-${slot}`}>
        <span className="slot">{label}</span>
        {c ? (
          <span className="grow">
            {c.mealName ?? c.text}
            {c.note && <span className="muted small"> · {c.note}</span>}
          </span>
        ) : (
          <Link className="grow" to={`/meals?week=${mondayOf(date)}&pick=${date}:${slot}`}>
            Plan {slot}
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      <h1>{fmtDayLong(today)}</h1>
      <QuickAdd />
      <div className="dash">
        <section className="card span2">
          <div className="row between">
            <h2>Next seven days</h2>
            <Link to="/calendar" className="small">
              Calendar
            </Link>
          </div>
          {days.length === 0 && <p className="empty">Nothing on the calendar this week.</p>}
          {days.map((d) => (
            <div className="daygroup" key={d}>
              <h3>{relativeDay(d)}</h3>
              <ul className="list">
                {byDay.get(d)!.map((e) => (
                  <li key={`${e.id}-${e.occurrenceDate}`}>
                    <span className="due">{e.allDay ? 'All day' : fmtTime(e.start)}</span>
                    <span className="title">
                      {e.title}
                      {e.location && <span className="sub">{e.location}</span>}
                    </span>
                    <Avatars ids={e.assignees} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="row between">
            <h2>Meals</h2>
            <Link to="/meals" className="small">
              This week
            </Link>
          </div>
          {slotsFor(!!settings?.breakfastEnabled).map((s) => mealLine(today, s))}
          {afterThree && (
            <>
              <h3 style={{ marginTop: '0.5rem' }}>Tomorrow</h3>
              {mealLine(tomorrow, 'lunch')}
            </>
          )}
        </section>

        <section className="card">
          <div className="row between">
            <h2>Shopping</h2>
            <Link to="/shopping" className="small">
              All lists
            </Link>
          </div>
          {(lists ?? []).length === 0 && <p className="empty">No lists yet.</p>}
          <ul className="list">
            {(lists ?? []).map((l) => (
              <li key={l.id}>
                <Link to={`/shopping?list=${l.id}`} className="title">
                  {l.name}
                </Link>
                <span className={`pill ${l.uncheckedCount ? '' : 'grey'}`}>{l.uncheckedCount} to buy</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card span2">
          <div className="row between">
            <h2>{me ? `${me.displayName}'s to-dos` : 'To-dos'} due</h2>
            <Link to="/todos" className="small">
              All to-dos
            </Link>
          </div>
          {dueTasks.length === 0 && <p className="empty">Nothing due today. {tasks?.length ? `${tasks.length} open.` : ''}</p>}
          <ul className="list">
            {dueTasks.map((t) => (
              <li key={t.id}>
                <span className="title">{t.title}</span>
                <span className={`due ${t.dueDate! < today ? 'overdue' : 'today'}`}>{t.dueDate! < today ? `Overdue · ${relativeDay(t.dueDate!)}` : 'Today'}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
