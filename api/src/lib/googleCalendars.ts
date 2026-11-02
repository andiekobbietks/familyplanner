import ICAL from 'ical.js'
import { addDays, dateOf } from './dates'
import { z } from 'zod'

/**
 * Read-only Google calendars (section 5.3). Each is read from its secret iCal
 * address on the server. That address is a secret (S30): it must never reach a
 * response or a log line, so failures here are swallowed rather than reported.
 */
export interface ExternalCalendar {
  label: string
  colour: string
}

export interface ExternalOccurrence {
  id: string
  title: string
  allDay: boolean
  start: string
  end: string
  location?: string
  occurrenceDate: string
  recurring: boolean
  external: ExternalCalendar
}

const COLOURS = ['#4f46e5', '#0f766e', '#a16207', '#be123c']
const CACHE_MS = 15 * 60_000
const RETRY_MS = 60_000
const FETCH_TIMEOUT_MS = 8_000
const MAX_FEED_BYTES = 10_000_000
const MAX_OCCURRENCES = 20_000
/** A moved occurrence can land in the range from outside it, so walk this far beyond. */
const MOVE_MARGIN_DAYS = 32

const configSchema = z.array(z.object({ label: z.string().trim().min(1).max(50), url: z.string() })).max(10)

interface Feed extends ExternalCalendar {
  url: string
}

/** GOOGLE_CALENDARS is a JSON list of { label, url }. Only Google addresses are accepted, so a bad setting cannot point the API elsewhere. */
export function readConfig(raw = process.env.GOOGLE_CALENDARS): { feeds: Feed[]; valid: boolean } {
  if (!raw?.trim()) return { feeds: [], valid: true }
  try {
    const list = configSchema.parse(JSON.parse(raw))
    const feeds = list.filter((f) => isGoogleAddress(f.url)).map((f, i) => ({ label: f.label, url: f.url, colour: COLOURS[i % COLOURS.length] }))
    return { feeds, valid: feeds.length === list.length }
  } catch {
    return { feeds: [], valid: false }
  }
}

function isGoogleAddress(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'calendar.google.com'
  } catch {
    return false
  }
}

interface Parsed {
  tz: string
  /** Recurring events carry their moved and cancelled occurrences. */
  events: ICAL.Event[]
}

export function parseFeed(text: string): Parsed {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(new ICAL.Timezone(tz))

  const events: ICAL.Event[] = []
  const series = new Map<string, ICAL.Event>()
  const changes: ICAL.Event[] = []
  for (const c of root.getAllSubcomponents('vevent')) {
    const e = new ICAL.Event(c)
    if (e.isRecurrenceException()) changes.push(e)
    else {
      events.push(e)
      if (e.isRecurring()) series.set(e.uid, e)
    }
  }
  for (const e of changes) {
    const parent = series.get(e.uid)
    if (parent) parent.relateException(e)
    else events.push(e) // Only this occurrence was shared with the calendar.
  }
  const tz = root.getFirstPropertyValue('x-wr-timezone')
  return { tz: typeof tz === 'string' ? tz : 'Europe/London', events }
}

const ymd = (t: ICAL.Time) => `${String(t.year).padStart(4, '0')}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`

export function expandFeed({ tz, events }: Parsed, calendar: ExternalCalendar, from: string, to: string): ExternalOccurrence[] {
  const out: ExternalOccurrence[] = []
  const earliest = Date.parse(`${addDays(from, -MOVE_MARGIN_DAYS)}T00:00:00Z`)
  const latest = Date.parse(`${addDays(to, MOVE_MARGIN_DAYS)}T00:00:00Z`)

  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurring: boolean) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return
    const allDay = start.isDate
    const startAt = start.toJSDate()
    const endAt = end.toJSDate()
    // iCal end dates are exclusive: an event on the 5th ends on the 6th. Planner end dates are inclusive.
    const lastDay = allDay ? ymd(end) > ymd(start) ? addDays(ymd(end), -1) : ymd(start) : dateOf(endAt, tz)
    const firstDay = allDay ? ymd(start) : dateOf(startAt, tz)
    if (firstDay > to || lastDay < from) return
    out.push({
      id: `g:${item.uid}:${firstDay}`,
      title: item.summary || 'Busy',
      allDay,
      start: allDay ? firstDay : startAt.toISOString(),
      end: allDay ? lastDay : endAt.toISOString(),
      location: item.location || undefined,
      occurrenceDate: firstDay,
      recurring,
      external: { label: calendar.label, colour: calendar.colour },
    })
  }

  for (const e of events) {
    if (!e.isRecurring()) {
      add(e, e.startDate, e.endDate, false)
      continue
    }
    const it = e.iterator()
    for (let n = 0; n < MAX_OCCURRENCES; n++) {
      const next = it.next()
      if (!next) break
      const at = next.toJSDate().getTime()
      if (at > latest) break
      if (at < earliest) continue
      const d = e.getOccurrenceDetails(next)
      add(d.item, d.startDate, d.endDate, true)
    }
  }
  return out
}

interface Cached {
  parsed?: Parsed
  at: number
  failed: boolean
}
const cache = new Map<string, Cached>()
const loading = new Map<string, Promise<Parsed | undefined>>()

async function fetchFeed(url: string): Promise<Parsed> {
  // No redirects: an address we checked must be the address we read.
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error('feed unavailable')
  const text = await res.text()
  if (text.length > MAX_FEED_BYTES) throw new Error('feed too large')
  return parseFeed(text)
}

/** Held in memory for up to 15 minutes and never written to the database. A failed read keeps the last good copy. */
function loadFeed(url: string, now: number): Promise<Parsed | undefined> {
  const hit = cache.get(url)
  if (hit && now - hit.at < (hit.failed ? RETRY_MS : CACHE_MS)) return Promise.resolve(hit.parsed)
  const running = loading.get(url)
  if (running) return running
  const load = fetchFeed(url)
    .then((parsed) => {
      cache.set(url, { parsed, at: now, failed: false })
      return parsed
    })
    .catch(() => {
      cache.set(url, { parsed: hit?.parsed, at: now, failed: true })
      return hit?.parsed
    })
    .finally(() => loading.delete(url))
  loading.set(url, load)
  return load
}

export interface ExternalResult {
  calendars: ExternalCalendar[]
  events: ExternalOccurrence[]
  /** True when any calendar could not be shown. */
  unavailable: boolean
}

export async function readCalendars(from: string, to: string, now = Date.now()): Promise<ExternalResult> {
  const { feeds, valid } = readConfig()
  let unavailable = !valid
  const events: ExternalOccurrence[] = []
  await Promise.all(
    feeds.map(async (feed) => {
      const parsed = await loadFeed(feed.url, now)
      try {
        if (!parsed) throw new Error('no copy')
        events.push(...expandFeed(parsed, feed, from, to))
      } catch {
        unavailable = true
      }
    }),
  )
  // All-day events first, then by start time.
  events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
  return { calendars: feeds.map(({ label, colour }) => ({ label, colour })), events, unavailable }
}

/** Tests only. */
export const clearFeedCache = () => cache.clear()
