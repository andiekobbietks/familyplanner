import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCalendarEvents, useChores, usePlan, useSettings, useTasks, useWeather } from '../api/hooks'
import type { Occurrence, PlanEntry, Slot, Weather } from '../api/types'
import { Icon } from '../components/Icons'
import { Avatar, usePersonMap } from '../components/People'
import { addDays, fmtDayLong, fmtTime, fmtWeekday, mondayOf, relativeDay, todayISO } from '../lib/dates'
import { eventsByDay } from '../lib/events'
import { degrees, describeWeather } from '../lib/weather'

const REFRESH_MS = 5 * 60_000
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** The current time, ticking every 20 seconds, so the clock and "today" roll over on their own. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/**
 * The wall display (photoframe). Read-only, no links or controls, and it looks after itself: data refreshes every
 * five minutes, and the page reloads once a night so a long-running screen picks up new deploys. It reads only
 * the routes open to the `display` role, so any member can open it too to see what the frame shows.
 */
export function Display() {
  const now = useNow()
  const today = todayISO()
  const lastDay = addDays(today, 6)
  const qc = useQueryClient()

  const { events, calendars, unavailable } = useCalendarEvents(today, lastDay)
  const { data: settings } = useSettings()
  const { data: weather } = useWeather()
  const { data: tasks = [] } = useTasks('all')
  const thisWeek = usePlan(mondayOf(today))
  const nextWeek = usePlan(mondayOf(lastDay))
  const people = usePersonMap()

  useEffect(() => {
    const t = setInterval(() => void qc.invalidateQueries(), REFRESH_MS)
    return () => clearInterval(t)
  }, [qc])

  // Reload in the small hours of a day after the page was opened.
  const [loadedOn] = useState(today)
  useEffect(() => {
    if (today !== loadedOn && now.getHours() >= 3) window.location.reload()
  }, [today, loadedOn, now])

  const slots: Slot[] = settings?.breakfastEnabled ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']
  const plan = [...(thisWeek.data ?? []), ...(mondayOf(lastDay) === mondayOf(today) ? [] : (nextWeek.data ?? []))]
  const byDay = useMemo(() => eventsByDay(events, today, lastDay), [events, today, lastDay])
  const due = tasks.filter((t) => t.dueDate && t.dueDate <= today)
  const showCalendar = calendars.length > 1

  return (
    <div className="wall">
      <header className="wall-top">
        <div>
          <div className="wall-clock">{fmtTime(now.toISOString())}</div>
          <div className="wall-date">{fmtDayLong(today)}</div>
        </div>
        {weather?.forecast && <WallWeather weather={weather} today={today} />}
      </header>

      <main className="wall-body">
        <section className="wall-card wall-today" aria-labelledby="wall-today-h">
          <h2 id="wall-today-h">Today</h2>
          {unavailable && <p className="wall-note">Google calendar unavailable</p>}
          <Agenda events={byDay.get(today) ?? []} showCalendar={showCalendar} nowMs={now.getTime()} />
          <Meals plan={plan.filter((p) => p.date === today)} slots={slots} />
          {due.length > 0 && (
            <>
              <h3>To do</h3>
              <ul className="wall-list">
                {due.map((t) => {
                  const who = people.get(t.assignee ?? '')
                  return (
                    <li key={t.id}>
                      <span className="wall-grow">{t.title}</span>
                      {t.dueDate! < today && <span className="wall-overdue">{relativeDay(t.dueDate!)}</span>}
                      {who && <Avatar person={who} size={26} />}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <section className="wall-card wall-week" aria-labelledby="wall-week-h">
          <h2 id="wall-week-h">Coming up</h2>
          <ul className="wall-days">
            {Array.from({ length: 6 }, (_, i) => addDays(today, i + 1)).map((d) => (
              <DayRow key={d} date={d} events={byDay.get(d) ?? []} dinner={plan.find((p) => p.date === d && p.slot === 'dinner')?.text} weather={weather} />
            ))}
          </ul>
        </section>

        <Chores week={mondayOf(today)} />
      </main>
    </div>
  )
}

function WallWeather({ weather, today }: { weather: Weather; today: string }) {
  const { current, days } = weather.forecast!
  const { label, icon } = describeWeather(current.code, current.isDay)
  const day = days.find((d) => d.date === today)
  return (
    <div className="wall-weather">
      <Icon name={icon} size={56} />
      <div>
        <div className="wall-temp">
          {degrees(current.temperature)} <span>{label}</span>
        </div>
        {day && (
          <div className="wall-muted">
            High {degrees(day.high)}, low {degrees(day.low)}
            {day.rainChance !== null && `, ${day.rainChance}% rain`}
          </div>
        )}
      </div>
    </div>
  )
}

function Agenda({ events, showCalendar, nowMs }: { events: Occurrence[]; showCalendar: boolean; nowMs: number }) {
  if (events.length === 0) return <p className="wall-muted">Nothing on the calendar.</p>
  return (
    <ul className="wall-agenda">
      {events.map((e) => (
        <li key={`${e.id}-${e.occurrenceDate}`} className={!e.allDay && Date.parse(e.end) < nowMs ? 'wall-gone' : ''}>
          <span className="wall-time">{e.allDay ? 'All day' : fmtTime(e.start)}</span>
          <span className="wall-bar" style={{ background: e.external.colour }} />
          <span className="wall-grow">
            {e.title}
            {(e.location || showCalendar) && <span className="wall-sub">{[e.location, showCalendar && e.external.label].filter(Boolean).join(' · ')}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Meals({ plan, slots }: { plan: PlanEntry[]; slots: Slot[] }) {
  return (
    <dl className="wall-meals">
      {slots.map((s) => (
        <div key={s}>
          <dt>{cap(s)}</dt>
          <dd>{plan.find((p) => p.slot === s)?.text ?? <span className="wall-muted">Not planned</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

function DayRow({ date, events, dinner, weather }: { date: string; events: Occurrence[]; dinner?: string; weather?: Weather }) {
  const forecast = weather?.forecast?.days.find((w) => w.date === date)
  const look = forecast && describeWeather(forecast.code)
  return (
    <li>
      <span className="wall-badge">
        <span>{fmtWeekday(date)}</span>
        <b>{Number(date.slice(8))}</b>
      </span>
      <span className="wall-grow">
        {events.length === 0 && <span className="wall-muted">Nothing on</span>}
        {events.map((e) => (
          <span key={`${e.id}-${e.occurrenceDate}`} className="wall-evt">
            <span className="wall-dot" style={{ background: e.external.colour }} />
            {!e.allDay && <b>{fmtTime(e.start)} </b>}
            {e.title}
          </span>
        ))}
        <span className="wall-dinner">{dinner ?? 'No dinner planned'}</span>
      </span>
      {forecast && look && (
        <span className="wall-day-weather" role="img" aria-label={`${look.label}, high ${degrees(forecast.high)}`}>
          <Icon name={look.icon} size={26} />
          {degrees(forecast.high)}
        </span>
      )}
    </li>
  )
}

function Chores({ week }: { week: string }) {
  const { data } = useChores(week)
  const people = usePersonMap()
  if (!data?.chores.length) return null
  return (
    <section className="wall-card wall-chores" aria-labelledby="wall-chores-h">
      <h2 id="wall-chores-h">Chores this week</h2>
      <ul className="wall-list">
        {data.chores.map((c) => {
          const person = people.get(data.assignments.find((a) => a.choreId === c.id)?.memberId ?? '')
          return (
            <li key={c.id}>
              <span className="wall-grow">{c.name}</span>
              <span className="wall-muted">{person?.displayName ?? 'Anyone'}</span>
              {person && <Avatar person={person} size={26} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
