import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useCalendarEvents, useChores, usePlan, useRecipes, useSettings, useShopping, useTasks, useWeather } from '../api/hooks'
import type { Me, Occurrence, PlanEntry, Slot, Weather } from '../api/types'
import { Icon, type IconName } from '../components/Icons'
import { Avatar, usePersonMap } from '../components/People'
import { addDays, fmtDayLong, fmtMonth, fmtTime, fmtWeekday, mondayOf, monthGrid, relativeDay, todayISO } from '../lib/dates'
import { eventsByDay } from '../lib/events'
import { findRecipe, matchesSearch } from '../lib/recipes'
import { RecipeText } from '../components/RecipeText'
import { degrees, describeWeather } from '../lib/weather'

/** How often the wall page refetches its data. */
const REFRESH_MS = 60_000
/** Month is a glance: after this long without a touch the frame goes back to Today on its own. Meals stays until another view is chosen. */
const AWAY_FOR_MS = 5 * 60_000
/** A recipe is followed while cooking, so it stays up for this long after the last touch. */
const RECIPE_FOR_MS = 30 * 60_000
type View = 'today' | 'meals' | 'month' | 'recipes'
const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'meals', label: 'Meals', icon: 'meals' },
  { id: 'month', label: 'Month', icon: 'calendar' },
  { id: 'recipes', label: 'Recipes', icon: 'book' },
]
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
    <div className="wall" onPointerDown={() => setTouchedAt(Date.now())}>
      <header className="wall-top">
        <div>
          <div className="wall-clock">{fmtTime(now.toISOString())}</div>
          <div className="wall-date">{fmtDayLong(today)}</div>
        </div>
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

      {view === 'month' ? (
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
          <ShoppingPanel />
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

/** The default shopping list's unchecked items, under Today, so the wall shows what to pick up. */
function ShoppingPanel() {
  const { data } = useShopping()
  if (!data) return null
  return (
    <section className="wall-card wall-shopping" aria-labelledby="wall-shopping-h">
      <h2 id="wall-shopping-h">
        {data.name}
        {data.items.length > 0 && <span className="wall-count">{data.items.length}</span>}
      </h2>
      {data.items.length === 0 ? (
        <p className="wall-muted">Nothing to buy.</p>
      ) : (
        <ul className="wall-shop">
          {data.items.map((i) => (
            <li key={i.id}>
              {i.name}
              {i.note && <span className="wall-muted"> · {i.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
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
