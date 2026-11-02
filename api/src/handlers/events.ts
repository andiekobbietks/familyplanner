import { isValidDate } from '../lib/dates'
import { badRequest } from '../lib/errors'
import { readCalendars } from '../lib/googleCalendars'
import type { Handler } from '../lib/http'

/** Google Calendar is the only source of events (section 5.3). Never touches the store. */
export const listExternalEvents: Handler = async (_ctx, _p, query) => {
  const from = query.get('from') ?? ''
  const to = query.get('to') ?? ''
  if (!isValidDate(from) || !isValidDate(to) || to < from) throw badRequest('from and to must be dates, to >= from')
  return { body: await readCalendars(from, to) }
}
