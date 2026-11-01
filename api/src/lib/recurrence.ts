import { addDays, addMonths, dateOf, fromWallClock, isoDate, wallClock } from './dates'
import type { Event } from './types'

export interface Occurrence extends Event {
  /** Calendar date of this occurrence in the event's zone, used for scope=this edits and deletes. */
  occurrenceDate: string
  recurring: boolean
}

const MAX_OCCURRENCES = 1000

/**
 * Expand an event into the occurrences that overlap [from, to] (calendar
 * dates, inclusive). Rules are stored, never expanded copies (section 5.3).
 * Timed occurrences keep their wall-clock time in the event's zone, so a
 * 09:00 weekly event stays at 09:00 across the clock change (section 8).
 */
export function expand(ev: Event, from: string, to: string): Occurrence[] {
  const tz = ev.tz || 'Europe/London'
  const firstDate = ev.allDay ? ev.start : dateOf(new Date(ev.start), tz)
  const durationDays = ev.allDay ? daysBetween(ev.start, ev.end) : 0
  const durationMs = ev.allDay ? 0 : Date.parse(ev.end) - Date.parse(ev.start)
  const startWall = ev.allDay ? null : wallClock(new Date(ev.start), tz)

  const build = (date: string): Occurrence => {
    if (ev.allDay) {
      return { ...ev, start: date, end: addDays(date, durationDays), occurrenceDate: date, recurring: !!ev.recurrence }
    }
    const { y, m, d } = parseYmd(date)
    const start = fromWallClock({ ...startWall!, y, m, d }, tz)
    const end = new Date(start.getTime() + durationMs)
    return { ...ev, start: start.toISOString(), end: end.toISOString(), occurrenceDate: date, recurring: !!ev.recurrence }
  }

  const overlaps = (date: string) => {
    // An occurrence spans [date, date + durationDays] (all-day) or a slice of that day (timed).
    const last = ev.allDay ? addDays(date, durationDays) : dateOf(new Date(Date.parse(build(date).end)), tz)
    return date <= to && last >= from
  }

  if (!ev.recurrence) return overlaps(firstDate) ? [build(firstDate)] : []

  const r = ev.recurrence
  const out: Occurrence[] = []
  const exceptions = new Set(r.exceptions ?? [])
  for (let k = 0; k < MAX_OCCURRENCES; k++) {
    const date = next(firstDate, k, r.freq, r.interval)
    if (date === null) continue // e.g. no 31st this month
    if (date > to) break
    if (r.until && date > r.until) break
    if (!exceptions.has(date) && overlaps(date)) out.push(build(date))
  }
  return out
}

function next(first: string, k: number, freq: 'daily' | 'weekly' | 'monthly', interval: number): string | null {
  const step = Math.max(1, interval)
  if (freq === 'daily') return addDays(first, k * step)
  if (freq === 'weekly') return addDays(first, k * 7 * step)
  return addMonths(first, k * step)
}

function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function daysBetween(a: string, b: string): number {
  const pa = parseYmd(a)
  const pb = parseYmd(b)
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000)
}

export { isoDate }
