import type { Occurrence } from '../api/types'
import { addDays, dateOfInstant } from './dates'

/** Events per local date from `from` to `to`. A multi-day event shows on each day it covers, and one that started earlier shows from `from`. */
export function eventsByDay(events: Occurrence[], from: string, to: string): Map<string, Occurrence[]> {
  const m = new Map<string, Occurrence[]>()
  for (const e of events) {
    const first = e.allDay ? e.start : dateOfInstant(e.start)
    const last = e.allDay ? e.end : dateOfInstant(e.end)
    for (let d = first < from ? from : first; d <= last && d <= to; d = addDays(d, 1)) {
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push(e)
    }
  }
  return m
}
