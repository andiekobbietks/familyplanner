import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useCalendarEvents, useChores, usePlan, useSettings, useTasks, useWeather } from '../api/hooks'
import type { Me, Occurrence, PlanEntry, Slot, Weather } from '../api/types'
import { Icon } from '../components/Icons'
import { Avatar, usePersonMap } from '../components/People'
import { addDays, fmtDayLong, fmtMonth, fmtTime, fmtWeekday, mondayOf, monthGrid, relativeDay, todayISO } from '../lib/dates'
import { eventsByDay } from '../lib/events'
import { degrees, describeWeather } from '../lib/weather'

/** How often the wall page refetches its data. */
const REFRESH_MS = 60_000
/** The month view is a glance: after this long the frame goes back to today on its own. */
const MONTH_FOR_MS = 5 * 60_000
/** Events a month cell has room for at 1280×800, by the number of weeks the month spans. */
const MONTH_CELL_EVENTS: Record<number, number> = { 4: 4, 5: 3, 6: 2 }
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
const notPaired = (e: unknown) => e instanceof ApiError && e.code === 'NOT_PAIRED'

/**
 * The wall page is open without a sign-in (S34): a paired display presents its key cookie,
 * and a member their session. With neither, say so rather than send the frame to a sign-in page.
 * The data refresh re-checks this too, so a revoked display shows the message within a minute.
 */
export function Display() {
  const who = useQuery({
    queryKey: ['display-me'],
    queryFn: () => api<Me>('/me'),
    retry: (count, e) => !notPaired(e) && count < 3,
  })
  if (who.isLoading) return <div className="loading">Loading…</div>
  if (notPaired(who.error)) return <NotPaired />
  return <DisplayBoard />
}

function NotPaired() {
  return (
    <div className="wall wall-unpaired">
      <h1>This display isn't paired</h1>
      <p className="muted">An admin can pair it from Members, under Displays.</p>
      <p>
        <a href="/login?next=%2Fdisplay">Family members can sign in</a>
      </p>
    </div>
  )
}

function DisplayBoard() {
  const now = useNow()
  const today = todayISO()
  const lastDay = addDays(today, 6)
  const qc = useQueryClient()
  const [view, setView] = useState<'today' | 'month'>('today')

  useEffect(() => {
    if (view !== 'month') return
    const t = setTimeout(() => setView('today'), MONTH_FOR_MS)
    return () => clearTimeout(t)
  }, [view])

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
        <button type="button" className="wall-flip" aria-pressed={view === 'month'} onClick={() => setView(view === 'month' ? 'today' : 'month')}>
          <Icon name={view === 'month' ? 'home' : 'calendar'} size={30} />
          {view === 'month' ? 'Today' : 'Month'}
        </button>
      </header>

      {view === 'month' ? (
        <MonthView today={today} nowMs={now.getTime()} />
      ) : (
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
      )}
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

/** The whole of this month, for planning at a glance. Read-only like the rest of the wall. */
function MonthView({ today, nowMs }: { today: string; nowMs: number }) {
  const { month, days } = monthGrid(today)
  const from = days[0]
  const to = days[days.length - 1]
  const { events, unavailable } = useCalendarEvents(from, to)
  const byDay = useMemo(() => eventsByDay(events, from, to), [events, from, to])
  return (
    <main className="wall-month-wrap" aria-label={fmtMonth(today)}>
      <h2 className="wall-month-title">
        {fmtMonth(today)}
        {unavailable && <span className="wall-note"> · Google calendar unavailable</span>}
      </h2>
      <div className="wall-month" style={{ gridTemplateRows: `auto repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div className="wall-dow" key={d}>
            {d}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? []
          const shown = list.slice(0, MONTH_CELL_EVENTS[days.length / 7])
          return (
            <div key={d} className={`wall-cell${d.slice(0, 7) !== month ? ' wall-other' : ''}${d === today ? ' wall-is-today' : ''}${d < today ? ' wall-past' : ''}`}>
              <span className="wall-cell-head">
                <span className="wall-num">{Number(d.slice(8))}</span>
                {shown.length < list.length && <span className="wall-more">+{list.length - shown.length} more</span>}
              </span>
              {shown.map((e) =>
                e.allDay ? (
                  <span key={`${e.id}-${e.occurrenceDate}`} className="wall-chip wall-chip-allday" style={{ background: e.external.colour }}>
                    {e.title}
                  </span>
                ) : (
                  <span key={`${e.id}-${e.occurrenceDate}`} className={`wall-chip${d === today && Date.parse(e.end) < nowMs ? ' wall-gone' : ''}`}>
                    <span className="wall-dot" style={{ background: e.external.colour }} />
                    <b>{fmtTime(e.start)}</b> {e.title}
                  </span>
                ),
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
