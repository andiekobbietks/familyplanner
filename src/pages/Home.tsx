import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useCalendarEvents, useChores, useLists, useMe, usePlan, useSettings, useTasks, useWeather } from '../api/hooks'
import type { Occurrence, PlanEntry, Slot, Task, Weather, WeatherDay } from '../api/types'
import { Icon } from '../components/Icons'
import { MealInput } from '../components/MealInput'
import { Avatar, usePersonMap } from '../components/People'
import { QuickAdd } from '../components/QuickAdd'
import { addDays, dateOfInstant, fmtDayLong, fmtTime, fmtWeekday, mondayOf, relativeDay, todayISO } from '../lib/dates'
import { degrees, describeWeather } from '../lib/weather'
import { useSetTaskDone } from './Todos'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  return hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const today = todayISO()
  const tomorrow = addDays(today, 1)
  const lastDay = addDays(today, 6)
  const now = new Date()
  const { data: me } = useMe()
  const { events, calendars, unavailable } = useCalendarEvents(today, lastDay)
  const { data: lists = [] } = useLists()
  const { data: tasks = [] } = useTasks('mine')
  const { data: settings } = useSettings()
  const { data: weather } = useWeather()
  const thisWeek = usePlan(mondayOf(today))
  const nextWeek = usePlan(mondayOf(lastDay))
  // Packed lunches are made the evening before, so from 15:00 tomorrow opens on its own (section 5.2).
  const [expanded, setExpanded] = useState<string | null>(now.getHours() >= 15 ? tomorrow : null)

  const slots: Slot[] = settings?.breakfastEnabled ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
  const plan = [...(thisWeek.data ?? []), ...(mondayOf(lastDay) === mondayOf(today) ? [] : (nextWeek.data ?? []))]
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  const eventsByDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const e of events) {
      const first = e.allDay ? e.start : dateOfInstant(e.start)
      const last = e.allDay ? e.end : dateOfInstant(e.end)
      // A multi-day event shows on each day it covers.
      for (let d = first < today ? today : first; d <= last && d <= lastDay; d = addDays(d, 1)) {
        if (!m.has(d)) m.set(d, [])
        m.get(d)!.push(e)
      }
    }
    return m
  }, [events, today, lastDay])

  const dayProps = (date: string) => ({
    date,
    events: eventsByDay.get(date) ?? [],
    plan: plan.filter((p) => p.date === date),
    slots,
    showCalendar: calendars.length > 1,
    forecast: weather?.forecast?.days.find((w) => w.date === date),
    // Anything overdue stays on today until it is done.
    tasks: tasks.filter((t) => t.dueDate && (date === today ? t.dueDate <= today : t.dueDate === date)),
  })

  return (
    <>
      <header className="hello">
        <h1>
          {greeting(now.getHours())}
          {me ? `, ${me.displayName}` : ''}
        </h1>
        <p className="muted">{fmtDayLong(today)}</p>
        {weather?.forecast && <WeatherToday weather={weather} today={today} />}
      </header>

      <div className="dash">
        <section className="dash-today" aria-labelledby="today-h">
          <h2 id="today-h" className="section-title">
            Today
          </h2>
          {unavailable && (
            <p className="notice" role="status">
              Google calendar unavailable
            </p>
          )}
          <div className="card today-card">
            <DayDetail {...dayProps(today)} />
          </div>
        </section>

        <section className="dash-week" aria-labelledby="week-h">
          <div className="section-head">
            <h2 id="week-h" className="section-title">
              This week
            </h2>
            <Link to="/calendar">Calendar</Link>
          </div>
          <ul className="week card">
            {days.slice(1).map((d) => (
              <WeekRow key={d} {...dayProps(d)} open={expanded === d} onToggle={() => setExpanded(expanded === d ? null : d)} />
            ))}
          </ul>
        </section>

        <ChoresThisWeek week={mondayOf(today)} />

        <section className="dash-shop" aria-labelledby="shop-h">
          <h2 id="shop-h" className="section-title">
            Shopping
          </h2>
          {lists.length === 0 && <p className="empty">No lists yet.</p>}
          <div className="shop-tiles">
            {lists.map((l) => (
              <Link key={l.id} to={`/shopping?list=${l.id}`} className="shop-tile">
                <b>{l.uncheckedCount}</b>
                <span>{l.name}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <QuickAdd />
    </>
  )
}

function WeatherToday({ weather, today }: { weather: Weather; today: string }) {
  const { current, days } = weather.forecast!
  const { label, icon } = describeWeather(current.code, current.isDay)
  const day = days.find((d) => d.date === today)
  return (
    <p className="weather-now">
      <Icon name={icon} />
      <b>{degrees(current.temperature)}</b>
      <span>{label}</span>
      {day && (
        <span className="muted">
          High {degrees(day.high)}, low {degrees(day.low)}
          {day.rainChance !== null && `, ${day.rainChance}% rain`}
          {` · ${weather.place}`}
        </span>
      )}
    </p>
  )
}

/** A read-only view of who has what. Assigning happens on the chores page. */
function ChoresThisWeek({ week }: { week: string }) {
  const { data } = useChores(week)
  const people = usePersonMap()
  if (!data?.chores.length) return null
  return (
    <section className="dash-chores" aria-labelledby="chores-h">
      <div className="section-head">
        <h2 id="chores-h" className="section-title">
          Chores this week
        </h2>
        <Link to="/todos?view=chores">Schedule</Link>
      </div>
      <ul className="list card tight">
        {data.chores.map((c) => {
          const person = people.get(data.assignments.find((a) => a.choreId === c.id)?.memberId ?? '')
          return (
            <li key={c.id}>
              <span className="grow">{c.name}</span>
              {person ? (
                <>
                  <span className="muted small">{person.displayName}</span>
                  <Avatar person={person} />
                </>
              ) : (
                <span className="muted small">Anyone</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

interface DayProps {
  date: string
  events: Occurrence[]
  plan: PlanEntry[]
  slots: Slot[]
  showCalendar: boolean
  tasks: Task[]
  forecast?: WeatherDay
}

function DayDetail({ date, events, plan, slots, showCalendar, tasks }: DayProps) {
  const today = todayISO()
  const setDone = useSetTaskDone('mine')
  const now = Date.now()
  return (
    <div className="day-detail">
      {events.length === 0 && date === today && <p className="empty">Nothing on the calendar.</p>}
      {events.length > 0 && (
        <ul className="agenda">
          {events.map((e) => (
            <li key={`${e.id}-${e.occurrenceDate}`} className={!e.allDay && Date.parse(e.end) < now ? 'gone' : ''}>
              <Link to="/calendar">
                <span className="time">{e.allDay ? 'All day' : fmtTime(e.start)}</span>
                <span className="colourbar" style={{ background: e.external.colour }} />
                <span className="grow">
                  {e.title}
                  {(e.location || showCalendar) && <span className="sub">{[e.location, showCalendar && e.external.label].filter(Boolean).join(' · ')}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="day-meals">
        {slots.map((s) => (
          <div className="plan-row" key={s}>
            <span className="slot">{cap(s)}</span>
            <MealInput date={date} slot={s} saved={plan.find((p) => p.slot === s)?.text} />
          </div>
        ))}
      </div>

      {tasks.length > 0 && (
        <ul className="list day-tasks">
          {tasks.map((t) => (
            <li key={t.id}>
              <input type="checkbox" checked={false} onChange={() => setDone(t, true)} aria-label={`Complete ${t.title}`} />
              <span className="title">{t.title}</span>
              {t.dueDate! < today && <span className="due overdue">{relativeDay(t.dueDate!)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One line per day until tapped, when it opens up with the same detail as today. */
function WeekRow({ open, onToggle, ...day }: DayProps & { open: boolean; onToggle: () => void }) {
  const { date, events, plan, forecast } = day
  const look = forecast && describeWeather(forecast.code)
  const dinner = plan.find((p) => p.slot === 'dinner')?.text
  return (
    <li className={open ? 'open' : ''}>
      <button type="button" className="week-row" aria-expanded={open} onClick={onToggle}>
        <span className="day-badge">
          <span>{fmtWeekday(date)}</span>
          <b>{Number(date.slice(8))}</b>
        </span>
        <span className="grow week-summary">
          {events.length === 0 && <span className="week-events muted">Nothing on</span>}
          {events.map((e) => (
            <span key={`${e.id}-${e.occurrenceDate}`} className={`evt ${e.allDay ? '' : 'timed'}`} style={{ '--c': e.external.colour } as CSSProperties}>
              {!e.allDay && <strong>{fmtTime(e.start)} </strong>}
              {e.title}
            </span>
          ))}
          <span className="week-dinner">{dinner ?? 'No dinner planned'}</span>
        </span>
        {forecast && look && (
          <span className="week-weather" role="img" aria-label={`${look.label}, high ${degrees(forecast.high)}`} title={look.label}>
            <Icon name={look.icon} size={20} />
            {degrees(forecast.high)}
          </span>
        )}
        <Icon name="down" size={18} />
      </button>
      {open && <DayDetail {...day} />}
    </li>
  )
}
