import { addDays, isValidDate } from '../lib/dates'
import { badRequest, notFound } from '../lib/errors'
import { readCalendars } from '../lib/googleCalendars'
import type { Handler } from '../lib/http'
import { expand } from '../lib/recurrence'
import { eventSchema, parse } from '../lib/schemas'
import type { Event } from '../lib/types'
import { stamp, touch } from '../lib/util'

export const listEvents: Handler = async ({ store, caller }, _p, query) => {
  const from = query.get('from') ?? ''
  const to = query.get('to') ?? ''
  if (!isValidDate(from) || !isValidDate(to) || to < from) throw badRequest('from and to must be dates, to >= from')
  const events = await store.byType<Event>(caller.familyId, 'event')
  const out = events.flatMap((e) => expand(e, from, to))
  out.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1))
  return { body: out }
}

/** Read-only events from connected Google calendars (section 5.3.1). Never touches the store. */
export const listExternalEvents: Handler = async (_ctx, _p, query) => {
  const from = query.get('from') ?? ''
  const to = query.get('to') ?? ''
  if (!isValidDate(from) || !isValidDate(to) || to < from) throw badRequest('from and to must be dates, to >= from')
  return { body: await readCalendars(from, to) }
}

export const createEvent: Handler = async ({ store, caller }, _p, _q, body) => {
  const data = parse(eventSchema, body)
  const saved = await store.upsert(stamp(caller, 'event', data))
  return { status: 201, body: saved }
}

/**
 * PUT /events/{id}?scope=this|future&date=YYYY-MM-DD
 * For a recurring event, "this" leaves the rule alone but adds an exception
 * and creates a standalone copy with the edits; "future" ends the rule the
 * day before and starts a new rule from the edited occurrence.
 */
export const updateEvent: Handler = async ({ store, caller }, params, query, body) => {
  const existing = await store.get<Event>(caller.familyId, params.id, 'event')
  if (!existing) throw notFound('Event not found')
  const data = parse(eventSchema, body)
  const scope = query.get('scope')
  const date = query.get('date') ?? ''

  if (existing.recurrence && (scope === 'this' || scope === 'future')) {
    if (!isValidDate(date)) throw badRequest('date is required for scoped edits')
    if (scope === 'this') {
      const rule = { ...existing.recurrence, exceptions: [...new Set([...existing.recurrence.exceptions, date])] }
      await store.upsert(touch(caller, existing, { recurrence: rule }))
      const single = await store.upsert(stamp(caller, 'event', { ...data, recurrence: null }))
      return { body: single }
    }
    const until = addDays(date, -1)
    if (until < firstDate(existing)) await store.delete(caller.familyId, existing.id)
    else await store.upsert(touch(caller, existing, { recurrence: { ...existing.recurrence, until } }))
    const future = await store.upsert(stamp(caller, 'event', data))
    return { body: future }
  }

  const saved = await store.upsert(touch(caller, existing, data))
  return { body: saved }
}

/** DELETE /events/{id}?date=YYYY-MM-DD removes a single occurrence by adding an exception. */
export const deleteEvent: Handler = async ({ store, caller }, params, query) => {
  const existing = await store.get<Event>(caller.familyId, params.id, 'event')
  if (!existing) throw notFound('Event not found')
  const date = query.get('date')
  if (date && existing.recurrence) {
    if (!isValidDate(date)) throw badRequest('date must be YYYY-MM-DD')
    const rule = { ...existing.recurrence, exceptions: [...new Set([...existing.recurrence.exceptions, date])] }
    await store.upsert(touch(caller, existing, { recurrence: rule }))
    return { status: 204 }
  }
  await store.delete(caller.familyId, existing.id)
  return { status: 204 }
}

function firstDate(e: Event): string {
  return e.allDay ? e.start : e.start.slice(0, 10)
}
