import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { mutations, useCalendarEvents, useChores, usePlan, useRecipes, useSettings, useShopping, useTasks, useWallLists, useWeather } from '../api/hooks'
import type { Me, Occurrence, PlanEntry, Slot, Task, WallList, Weather } from '../api/types'
import { Icon, type IconName } from '../components/Icons'
import { Avatar, usePersonMap } from '../components/People'
import { addDays, fmtDayLong, fmtMonth, fmtTime, fmtWeekday, mondayOf, monthGrid, relativeDay, todayISO } from '../lib/dates'
import { eventsByDay } from '../lib/events'
import { findRecipe, matchesSearch } from '../lib/recipes'
import { openTodos, wallTodos } from '../lib/tasks'
import { RecipeText } from '../components/RecipeText'
import { degrees, describeWeather } from '../lib/weather'

/** How often the wall page refetches its data. */
const REFRESH_MS = 60_000
/** Month and Lists are a glance: after this long without a touch the frame goes back to Today on its own. Meals stays until another view is chosen. */
const AWAY_FOR_MS = 5 * 60_000
/** A recipe is followed while cooking, so it stays up for this long after the last touch. */
const RECIPE_FOR_MS = 30 * 60_000
type View = 'today' | 'lists' | 'meals' | 'month' | 'recipes'
const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'lists', label: 'Lists', icon: 'basket' },
  { id: 'meals', label: 'Meals', icon: 'meals' },
  { id: 'month', label: 'Month', icon: 'calendar' },
  { id: 'recipes', label: 'Recipes', icon: 'book' },
]
/** Events a month cell has room for at 1280×800, by the number of weeks the month spans. */
const MONTH_CELL_EVENTS: Record<number, number> = { 4: 4, 5: 3, 6: 2 }
/** To-dos on the Today card before the rest collapse to "+N more", so the shopping list keeps its room. */
const TODOS_SHOWN = 6
/** How long Undo stays up after a to-do or list item is ticked on the wall. */
const UNDO_FOR_MS = 8_000
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

const notPaired = (e: unknown) => e instanceof ApiError && e.code === 'NOT_PAIRED'

/**
 * The wall display (photoframe). Read-only apart from the Month button, and it looks after itself: data refreshes
 * every minute, and the page reloads once a night so a long-running screen picks up new deploys. It reads only
 * the routes open to the `display` role, so any member can open it too to see what the frame shows.
 *
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
  const [view, setView] = useState<View>('today')
  const [recipeId, setRecipeId] = useState<string>()
  const [touchedAt, setTouchedAt] = useState(0)

  useEffect(() => {
    if (view === 'today' || view === 'meals') return
    const t = setTimeout(() => setView('today'), view === 'recipes' ? RECIPE_FOR_MS : AWAY_FOR_MS)
    return () => clearTimeout(t)
  }, [view, touchedAt])

  const openRecipe = (id: string) => {
    setRecipeId(id)
    setView('recipes')
  }

  const { events, calendars, unavailable } = useCalendarEvents(today, lastDay)
  const { data: settings } = useSettings()
  const { data: weather } = useWeather()
  const { data: tasks = [] } = useTasks('all')
  const thisWeek = usePlan(mondayOf(today))
  const nextWeek = usePlan(mondayOf(lastDay))

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
  const todos = wallTodos(tasks, today)
  const setTodoDone = async (id: string, done: boolean) => {
    await mutations.wallSetTaskDone(id, done)
    await qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  const showCalendar = calendars.length > 1

  return (
    <div className="wall" onPointerDown={() => setTouchedAt(Date.now())}>
      <header className="wall-top">
        <WallTimer time={fmtTime(now.toISOString())} date={fmtDayLong(today)} />
        {weather?.forecast && <WallWeather weather={weather} today={today} />}
        <nav className="wall-views" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="wall-flip"
              aria-pressed={view === v.id}
              onClick={() => {
                if (v.id === 'recipes' && view !== 'recipes') setRecipeId(undefined)
                setView(v.id)
              }}
            >
              <Icon name={v.icon} size={28} />
              {v.label}
            </button>
          ))}
        </nav>
      </header>

      {view === 'lists' ? (
        <ListsView todos={openTodos(tasks, today)} today={today} onTodoDone={setTodoDone} />
      ) : view === 'month' ? (
        <MonthView today={today} nowMs={now.getTime()} />
      ) : view === 'meals' ? (
        <MealsView today={today} plan={plan} slots={slots} weather={weather} onRecipe={openRecipe} />
      ) : view === 'recipes' ? (
        <RecipesView chosenId={recipeId} onChoose={setRecipeId} tonight={plan.find((p) => p.date === today && p.slot === 'dinner')?.text} />
      ) : (
      <main className="wall-body">
        <div className="wall-col">
          <section className="wall-card wall-today" aria-labelledby="wall-today-h">
            <h2 id="wall-today-h">Today</h2>
            {unavailable && <p className="wall-note">Google calendar unavailable</p>}
            <Agenda events={byDay.get(today) ?? []} showCalendar={showCalendar} nowMs={now.getTime()} />
            <Meals plan={plan.filter((p) => p.date === today)} slots={slots} />
            <TodoList todos={todos} today={today} onDone={setTodoDone} onMore={() => setView('lists')} />
          </section>
          <ShoppingPanel onOpen={() => setView('lists')} />
        </div>

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

/** The kitchen timer's choices, in minutes. */
export const TIMER_MINUTES = [1, 2, 5, 10]

/** Time left as m:ss, rounded up, so it reads 0:00 only once the time is up. */
export function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The clock, which opens a countdown timer when tapped. No sound: when the time is up the panel opens on its own
 * and flashes until someone taps OK. Closing the panel while it runs leaves the countdown under the clock.
 * It ticks on its own, a few times a second and only while running, so the rest of the wall isn't redrawn.
 */
type TimerRun = { endsAt: number; minutes: number }
type TimerState = { run?: TimerRun; open: boolean }
const TIMER_KEY = 'wall-timer'
/** A finished timer still showing "Time's up" is dropped on reload once it's this old. */
const TIMER_KEEP_DONE_MS = 60 * 60_000

/**
 * The saved timer, if it should carry on after a reload. The kiosk reloads the page every few hours and when the
 * connection comes back, and the page reloads itself overnight, so a running timer is kept in the frame's storage.
 */
export function restoreTimer(raw: string | null, nowMs: number): TimerState {
  try {
    const s = JSON.parse(raw ?? '') as TimerState
    const run = s?.run
    if (!run || !Number.isFinite(run.endsAt) || !TIMER_MINUTES.includes(run.minutes)) return { open: false }
    if (run.endsAt > nowMs + run.minutes * 60_000 || nowMs - run.endsAt > TIMER_KEEP_DONE_MS) return { open: false }
    return { run: { endsAt: run.endsAt, minutes: run.minutes }, open: !!s.open }
  } catch {
    return { open: false }
  }
}

function loadTimer(): TimerState {
  try {
    return restoreTimer(localStorage.getItem(TIMER_KEY), Date.now())
  } catch {
    return { open: false }
  }
}

function WallTimer({ time, date }: { time: string; date: string }) {
  const [saved] = useState(loadTimer)
  const [open, setOpen] = useState(saved.open)
  const [run, setRun] = useState<TimerRun | undefined>(saved.run)
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    try {
      if (run) localStorage.setItem(TIMER_KEY, JSON.stringify({ run, open }))
      else localStorage.removeItem(TIMER_KEY)
    } catch {
      // Storage unavailable: the timer still works, it just won't survive a reload.
    }
  }, [run, open])
  useEffect(() => {
    if (!run) return
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 250)
    return () => clearInterval(t)
  }, [run])
  const done = !!run && nowMs >= run.endsAt
  const start = (minutes: number) => {
    setNowMs(Date.now())
    setRun({ endsAt: Date.now() + minutes * 60_000, minutes })
  }
  const stop = () => {
    setRun(undefined)
    setOpen(false)
  }

  return (
    <div>
      <button type="button" className="wall-clock" aria-label={`${time}. Open the timer`} onClick={() => setOpen(true)}>
        {time}
      </button>
      {run && !open && !done ? (
        <button type="button" className="wall-timer-chip" onClick={() => setOpen(true)}>
          Timer {fmtCountdown(run.endsAt - nowMs)}
        </button>
      ) : (
        <div className="wall-date">{date}</div>
      )}
      {(open || done) && <TimerPanel run={run} nowMs={nowMs} onStart={start} onCancel={stop} onClose={() => setOpen(false)} />}
    </div>
  )
}

export function TimerPanel({
  run,
  nowMs,
  onStart,
  onCancel,
  onClose,
}: {
  run?: { endsAt: number; minutes: number }
  nowMs: number
  onStart: (minutes: number) => void
  onCancel: () => void
  onClose: () => void
}) {
  const left = run ? run.endsAt - nowMs : 0
  const done = !!run && left <= 0
  const shown = run ? Math.min(left, run.minutes * 60_000) : 0
  return (
    <div className="wall-timer-backdrop" onClick={done ? undefined : onClose}>
      <div
        className={done ? 'wall-timer wall-timer-done' : 'wall-timer'}
        role="dialog"
        aria-modal="true"
        aria-label="Timer"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <div className="wall-timer-big" role="alert">Time's up</div>
            <button type="button" className="wall-flip wall-timer-ok" onClick={onCancel}>OK</button>
          </>
        ) : (
          <>
            {run ? (
              <>
                <div className="wall-timer-big" role="timer">{fmtCountdown(shown)}</div>
                <div className="wall-timer-bar"><span style={{ width: `${(100 * shown) / (run.minutes * 60_000)}%` }} /></div>
              </>
            ) : (
              <h2 className="wall-timer-title">Timer</h2>
            )}
            <div className="wall-timer-choices">
              {TIMER_MINUTES.map((m) => (
                <button key={m} type="button" className="wall-timer-choice" onClick={() => onStart(m)}>
                  {m} min
                </button>
              ))}
            </div>
            <div className="wall-timer-actions">
              {run && <button type="button" className="wall-flip wall-timer-cancel" onClick={onCancel}>Cancel timer</button>}
              <button type="button" className="wall-flip" onClick={onClose}>
                <Icon name="close" size={28} />
                {run ? 'Hide' : 'Close'}
              </button>
            </div>
          </>
        )}
      </div>
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

/**
 * Tick-with-Undo for the wall's two writes (S34): a ticked row goes at once and Undo stays up
 * for a few seconds in case of a stray touch. A failed save puts the row back and says so.
 */
function useTicks<T extends { id: string }>(rows: T[], onSet?: (id: string, on: boolean) => Promise<unknown>) {
  const [hidden, setHidden] = useState<string[]>([])
  const [undo, setUndo] = useState<T>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(undefined), UNDO_FOR_MS)
    return () => clearTimeout(t)
  }, [undo])
  // Once a refetch drops a ticked row, stop hiding it, so one unticked elsewhere comes back.
  useEffect(() => {
    setHidden((h) => (h.some((id) => !rows.some((r) => r.id === id)) ? h.filter((id) => rows.some((r) => r.id === id)) : h))
  }, [rows])

  async function tick(r: T) {
    if (!onSet) return
    setFailed(false)
    setHidden((h) => [...h, r.id])
    setUndo(r)
    try {
      await onSet(r.id, true)
    } catch {
      setHidden((h) => h.filter((id) => id !== r.id))
      setUndo(undefined)
      setFailed(true)
    }
  }

  async function untick(r: T) {
    if (!onSet) return
    setFailed(false)
    setUndo(undefined)
    try {
      await onSet(r.id, false)
      setHidden((h) => h.filter((id) => id !== r.id))
    } catch {
      setFailed(true)
    }
  }

  return { shown: rows.filter((r) => !hidden.includes(r.id)), undo, failed, tick, untick }
}

function TickNotes({ undoLabel, onUndo, failed }: { undoLabel?: string; onUndo: () => void; failed: boolean }) {
  return (
    <>
      {undoLabel && (
        <p className="wall-undo" role="status">
          <span className="wall-grow">{undoLabel}</span>
          <button type="button" onClick={onUndo}>
            Undo
          </button>
        </p>
      )}
      {failed && (
        <p className="wall-note" role="alert">
          Couldn't save that. Try again.
        </p>
      )}
    </>
  )
}

function TickButton({ label, onTick }: { label: string; onTick: () => void }) {
  return (
    <button type="button" className="wall-tick" aria-label={label} onClick={onTick}>
      <Icon name="check" size={26} />
    </button>
  )
}

/**
 * The to-dos, on the Today card (the first few, and "+N more" by the heading, which opens Lists) and on the Lists page (all of them).
 * Always shown, so an empty list reads as done rather than missing. With `onDone`, each has a tick button.
 * With `scroll`, the rows scroll and Undo stays in view below them.
 */
export function TodoList({
  todos,
  today,
  onDone,
  onMore,
  limit = TODOS_SHOWN,
  heading = true,
  scroll = false,
}: {
  todos: Task[]
  today: string
  onDone?: (id: string, done: boolean) => Promise<unknown>
  onMore?: () => void
  limit?: number
  heading?: boolean
  scroll?: boolean
}) {
  const people = usePersonMap()
  const { shown, undo, failed, tick, untick } = useTicks(todos, onDone)
  const more = shown.length - limit

  const rows =
    shown.length === 0 ? (
      <p className="wall-muted">Nothing to do.</p>
    ) : (
      <>
        <ul className="wall-list">
          {shown.slice(0, limit).map((t) => {
            const who = people.get(t.assignee ?? '')
            return (
              <li key={t.id}>
                {onDone && <TickButton label={`Done: ${t.title}`} onTick={() => void tick(t)} />}
                <span className="wall-grow">{t.title}</span>
                {t.dueDate && t.dueDate !== today && <span className={t.dueDate < today ? 'wall-overdue' : 'wall-due'}>{relativeDay(t.dueDate)}</span>}
                {who && <Avatar person={who} size={26} />}
              </li>
            )
          })}
        </ul>
        {more > 0 && !onMore && <p className="wall-muted wall-more-todos">+{more} more</p>}
      </>
    )
  return (
    <>
      {/* "+N more" sits by the heading, so a busy Today card can't push it out of sight. */}
      {heading &&
        (more > 0 && onMore ? (
          <div className="wall-card-head wall-todo-head">
            <h3>To do</h3>
            <button type="button" className="wall-more" onClick={onMore}>
              +{more} more
            </button>
          </div>
        ) : (
          <h3>To do</h3>
        ))}
      {scroll ? <div className="wall-scroll">{rows}</div> : rows}
      <TickNotes undoLabel={undo && `Done: ${undo.title}`} onUndo={() => undo && void untick(undo)} failed={failed} />
    </>
  )
}

/** The default shopping list's unchecked items, under Today, so the wall shows what to pick up. Always shown, even when empty. With `onOpen`, a button opens the Lists page. */
export function ShoppingPanel({ onOpen }: { onOpen?: () => void } = {}) {
  const { data, isSuccess } = useShopping()
  const items = data?.items ?? []
  return (
    <section className="wall-card wall-shopping" aria-labelledby="wall-shopping-h">
      <div className="wall-card-head">
        <h2 id="wall-shopping-h">
          {data?.name ?? 'Shopping'}
          {items.length > 0 && <span className="wall-count">{items.length}</span>}
        </h2>
        {onOpen && (
          <button type="button" className="wall-more" onClick={onOpen}>
            All lists
          </button>
        )}
      </div>
      {isSuccess && !data ? (
        <p className="wall-muted">No shopping list yet.</p>
      ) : items.length === 0 ? (
        <p className="wall-muted">Nothing to buy.</p>
      ) : (
        <div className="wall-shop-scroll">
          <ul className="wall-shop">
            {items.map((i) => (
              <li key={i.id}>
                {i.name}
                {i.note && <span className="wall-muted"> · {i.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** A list's unchecked items on the Lists page, each with a tick button and Undo, scrolling when long. */
export function ItemList({ items, onChecked }: { items: WallList['items']; onChecked?: (id: string, checked: boolean) => Promise<unknown> }) {
  const { shown, undo, failed, tick, untick } = useTicks(items, onChecked)
  return (
    <>
      <div className="wall-scroll">
        {shown.length === 0 ? (
          <p className="wall-muted">Nothing to buy.</p>
        ) : (
          <ul className="wall-list">
            {shown.map((i) => (
              <li key={i.id}>
                {onChecked && <TickButton label={`Got: ${i.name}`} onTick={() => void tick(i)} />}
                <span className="wall-grow">
                  {i.name}
                  {i.note && <span className="wall-muted"> · {i.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TickNotes undoLabel={undo && `Got: ${undo.name}`} onUndo={() => undo && void untick(undo)} failed={failed} />
    </>
  )
}

/**
 * Every open to-do and list in full, each side scrolling. The default shopping list shows first,
 * and when there are others, buttons above switch between them. Opened from the Lists button,
 * "+N more" on the Today card or "All lists" on the shopping card.
 */
function ListsView({ todos, today, onTodoDone }: { todos: Task[]; today: string; onTodoDone: (id: string, done: boolean) => Promise<unknown> }) {
  const qc = useQueryClient()
  const { data: lists, isSuccess } = useWallLists()
  const [chosenId, setChosenId] = useState<string>()
  const list = lists?.find((l) => l.id === chosenId) ?? lists?.[0]
  const setChecked = async (id: string, checked: boolean) => {
    await mutations.wallSetItemChecked(id, checked)
    await Promise.all([qc.invalidateQueries({ queryKey: ['wall-lists'] }), qc.invalidateQueries({ queryKey: ['shopping'] })])
  }
  return (
    <main className="wall-lists">
      <section className="wall-card" aria-labelledby="wall-lists-todo-h">
        <h2 id="wall-lists-todo-h">
          To do
          {todos.length > 0 && <span className="wall-count">{todos.length}</span>}
        </h2>
        <TodoList todos={todos} today={today} onDone={onTodoDone} limit={Infinity} heading={false} scroll />
      </section>
      <section className="wall-card" aria-labelledby="wall-lists-shop-h">
        <h2 id="wall-lists-shop-h">
          {list?.name ?? 'Shopping'}
          {list && list.items.length > 0 && <span className="wall-count">{list.items.length}</span>}
        </h2>
        {lists && lists.length > 1 && (
          <div className="wall-tags" role="group" aria-label="Lists">
            {lists.map((l) => (
              <button key={l.id} type="button" className="wall-tag" aria-pressed={l.id === list?.id} onClick={() => setChosenId(l.id)}>
                {l.name} · {l.items.length}
              </button>
            ))}
          </div>
        )}
        {list ? <ItemList key={list.id} items={list.items} onChecked={setChecked} /> : isSuccess && <p className="wall-muted">No shopping list yet.</p>}
      </section>
    </main>
  )
}

/** The next seven days' meals, days across and meals down, so the week's cooking is clear from across the kitchen. */
function MealsView({ today, plan, slots, weather, onRecipe }: { today: string; plan: PlanEntry[]; slots: Slot[]; weather?: Weather; onRecipe: (id: string) => void }) {
  const { data: recipes = [] } = useRecipes()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  return (
    <main className="wall-meals-week" style={{ gridTemplateRows: `auto repeat(${slots.length}, minmax(0, 1fr))` }} aria-label="Meals this week">
      <div className="wall-mw-corner" />
      {days.map((d) => {
        const forecast = weather?.forecast?.days.find((w) => w.date === d)
        const look = forecast && describeWeather(forecast.code)
        return (
          <div key={d} className={`wall-mw-day${d === today ? ' wall-is-today' : ''}`}>
            <span>{d === today ? 'Today' : fmtWeekday(d)}</span>
            <b className="wall-num">{Number(d.slice(8))}</b>
            {forecast && look && (
              <span className="wall-day-weather" role="img" aria-label={`${look.label}, high ${degrees(forecast.high)}`}>
                <Icon name={look.icon} size={22} />
                {degrees(forecast.high)}
              </span>
            )}
          </div>
        )
      })}
      {slots.map((slot) => (
        <Fragment key={slot}>
          <div className="wall-mw-slot">{cap(slot)}</div>
          {days.map((d) => {
            const text = plan.find((p) => p.date === d && p.slot === slot)?.text
            const recipe = text ? findRecipe(recipes, text) : undefined
            return (
              <div key={d} className={`wall-mw-cell${d === today ? ' wall-mw-today' : ''}`}>
                {recipe ? (
                  <button type="button" className="wall-mw-recipe" onClick={() => onRecipe(recipe.id)}>
                    {text}
                    <Icon name="book" size={20} />
                  </button>
                ) : (
                  (text ?? <span className="wall-muted">–</span>)
                )}
              </div>
            )
          })}
        </Fragment>
      ))}
    </main>
  )
}

/**
 * Look up a recipe while cooking: search and tags on the left, the chosen recipe on the right.
 * Tonight's dinner opens first if it is a recipe. Read-only, like the rest of the wall.
 */
function RecipesView({ chosenId, onChoose, tonight }: { chosenId?: string; onChoose: (id: string) => void; tonight?: string }) {
  const { data: recipes = [], isLoading } = useRecipes()
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const tonightRecipe = tonight ? findRecipe(recipes, tonight) : undefined
  const recipe = recipes.find((r) => r.id === chosenId) ?? tonightRecipe

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [recipes])
  const shown = recipes.filter((r) => matchesSearch(r, search) && (!tag || r.tags.includes(tag)))
  const meta = recipe && [recipe.serves && `Serves ${recipe.serves}`, recipe.time].filter(Boolean).join(' · ')

  return (
    <main className="wall-recipes">
      <section className="wall-card wall-recipe-pick" aria-label="Find a recipe">
        <input className="wall-search" type="search" aria-label="Search recipes" placeholder="Search name or ingredient" value={search} onChange={(e) => setSearch(e.target.value)} />
        {tags.length > 0 && (
          <div className="wall-tags" role="group" aria-label="Filter by tag">
            {tags.map((t) => (
              <button key={t} type="button" className="wall-tag" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        <ul className="wall-recipe-list">
          {tonightRecipe && !search && !tag && (
            <li>
              <button type="button" aria-pressed={recipe?.id === tonightRecipe.id} onClick={() => onChoose(tonightRecipe.id)}>
                <span className="wall-sub">Tonight</span>
                {tonightRecipe.title}
              </button>
            </li>
          )}
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" aria-pressed={recipe?.id === r.id} onClick={() => onChoose(r.id)}>
                {r.title}
              </button>
            </li>
          ))}
        </ul>
        {!isLoading && recipes.length > 0 && shown.length === 0 && <p className="wall-muted">Nothing matches.</p>}
        {!isLoading && recipes.length === 0 && <p className="wall-muted">No recipes yet.</p>}
      </section>

      <section className="wall-card wall-recipe" aria-label={recipe?.title ?? 'Recipe'}>
        {!recipe ? (
          <p className="wall-muted wall-recipe-empty">Pick a recipe on the left.</p>
        ) : (
          <>
            <h2 className="wall-recipe-title">{recipe.title}</h2>
            {meta && <p className="wall-muted">{meta}</p>}
            {recipe.summary && <p>{recipe.summary}</p>}
            <div className="wall-recipe-body">
              {recipe.ingredients && <RecipeText title="Ingredients" text={recipe.ingredients} className="wall-ingredients" />}
              <div>
                {recipe.method && <RecipeText title="Method" text={recipe.method} numbered />}
                {recipe.notes && <RecipeText title="Notes" text={recipe.notes} />}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
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
