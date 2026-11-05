import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFeedCache, expandFeed, parseFeed, readCalendars, readConfig } from '../src/lib/googleCalendars'

const SECRET = 'https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-s3cret/basic.ics'
const cal = { label: 'Family', colour: '#4f46e5' }

/** Shaped like a real Google feed: London zone, a weekly series with one occurrence deleted and one moved. */
const FEED = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
X-WR-TIMEZONE:Europe/London
BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:GMT
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20261012T090000
DTEND;TZID=Europe/London:20261012T100000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=Europe/London:20261109T090000
UID:weekly@google.com
SUMMARY:Football
LOCATION:Rec ground
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20261118T150000
DTEND;TZID=Europe/London:20261118T160000
RECURRENCE-ID;TZID=Europe/London:20261116T090000
UID:weekly@google.com
SUMMARY:Football (moved)
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20261123T090000
DTEND;TZID=Europe/London:20261123T100000
RECURRENCE-ID;TZID=Europe/London:20261123T090000
STATUS:CANCELLED
UID:weekly@google.com
SUMMARY:Football
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261105
DTEND;VALUE=DATE:20261106
UID:oneday@google.com
SUMMARY:Bonfire night
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261123
UID:trip@google.com
SUMMARY:Weekend away
END:VEVENT
BEGIN:VEVENT
DTSTART:20261110T120000Z
DTEND:20261110T130000Z
UID:gone@google.com
STATUS:CANCELLED
SUMMARY:Called off
END:VEVENT
END:VCALENDAR
`.replace(/\n/g, '\r\n')

const ok = () => new Response(FEED, { status: 200 })

describe('reading a Google feed', () => {
  const expand = (from: string, to: string) => expandFeed(parseFeed(FEED), cal, from, to)

  it('A9d: a weekly timed event keeps its wall-clock time across the clock change', () => {
    const f = expand('2026-10-19', '2026-11-02').filter((e) => e.title === 'Football')
    expect(f.map((e) => e.start)).toEqual([
      '2026-10-19T08:00:00.000Z', // BST
      '2026-10-26T09:00:00.000Z', // GMT, the day after the change
      '2026-11-02T09:00:00.000Z',
    ])
    expect(f[0].recurring).toBe(true)
    expect(f[0].location).toBe('Rec ground')
  })
  it('leaves out a deleted occurrence', () => {
    expect(expand('2026-11-09', '2026-11-09')).toEqual([])
  })
  it('shows a moved occurrence on its new day only', () => {
    expect(expand('2026-11-16', '2026-11-16')).toEqual([])
    const [moved] = expand('2026-11-18', '2026-11-18')
    expect(moved.title).toBe('Football (moved)')
    expect(moved.start).toBe('2026-11-18T15:00:00.000Z')
  })
  it('finds a moved occurrence from just outside the range', () => {
    expect(expand('2026-11-17', '2026-11-19').map((e) => e.title)).toEqual(['Football (moved)'])
  })
  it('leaves out a cancelled occurrence and a cancelled event', () => {
    expect(expand('2026-11-23', '2026-11-23')).toEqual([])
    expect(expand('2026-11-10', '2026-11-10')).toEqual([])
  })
  it('A9d: an all-day event stays on its date and its end date becomes inclusive', () => {
    const [e] = expand('2026-11-05', '2026-11-05')
    expect(e).toMatchObject({ title: 'Bonfire night', allDay: true, start: '2026-11-05', end: '2026-11-05' })
    expect(expand('2026-11-06', '2026-11-06').filter((x) => x.allDay)).toEqual([])
  })
  it('a multi-day event overlaps the middle of its span', () => {
    expect(expand('2026-11-21', '2026-11-21').filter((x) => x.allDay)).toMatchObject([{ title: 'Weekend away', start: '2026-11-20', end: '2026-11-22' }])
  })
  it('marks every event with its calendar', () => {
    for (const e of expand('2026-10-01', '2026-12-01')) expect(e.external).toEqual(cal)
  })
})

describe('configuration', () => {
  it('is empty when nothing is set', () => {
    expect(readConfig(undefined)).toEqual({ feeds: [], valid: true })
  })
  it('S30: refuses addresses that are not Google', () => {
    const r = readConfig(JSON.stringify([{ label: 'Bad', url: 'https://example.com/a.ics' }, { label: 'Plain', url: 'http://calendar.google.com/a.ics' }, { label: 'Fake', url: 'https://calendar.google.com.evil.test/a.ics' }, { label: 'Good', url: SECRET }]))
    expect(r.feeds.map((f) => f.label)).toEqual(['Good'])
    expect(r.valid).toBe(false)
  })
  it('treats broken JSON as unavailable rather than failing', () => {
    expect(readConfig('{nope')).toEqual({ feeds: [], valid: false })
  })
})

describe('fetching', () => {
  const fetchMock = vi.fn()
  const T0 = 1_800_000_000_000
  const read = (now = T0) => readCalendars('2026-11-05', '2026-11-05', now)

  beforeEach(() => {
    clearFeedCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    process.env.GOOGLE_CALENDARS = JSON.stringify([{ label: 'Family', url: SECRET }])
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GOOGLE_CALENDARS
  })

  it('A9d: the feed address appears nowhere in the response', async () => {
    fetchMock.mockImplementation(async () => ok())
    const r = await read()
    expect(r.events).toHaveLength(1)
    expect(JSON.stringify(r)).not.toContain('s3cret')
  })
  it('sorts all-day events first, then by start time', async () => {
    fetchMock.mockImplementation(async () => ok())
    const r = await readCalendars('2026-10-26', '2026-11-05', T0)
    expect(r.events.map((e) => e.title)).toEqual(['Bonfire night', 'Football', 'Football'])
    expect(r.events[1].start < r.events[2].start).toBe(true)
  })
  it('caches for 5 minutes', async () => {
    fetchMock.mockImplementation(async () => ok())
    await read()
    await read(T0 + 4 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await read(T0 + 6 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('A9d: a failed feed reports unavailable without throwing', async () => {
    fetchMock.mockRejectedValue(new Error(`fetch failed for ${SECRET}`))
    const r = await read()
    expect(r).toMatchObject({ events: [], unavailable: true })
    expect(JSON.stringify(r)).not.toContain('s3cret')
  })
  it('a corrupt feed reports unavailable', async () => {
    fetchMock.mockImplementation(async () => new Response('not a calendar'))
    expect(await read()).toMatchObject({ events: [], unavailable: true })
  })
  it('keeps showing the last good copy when a refresh fails', async () => {
    fetchMock.mockImplementationOnce(async () => ok()).mockRejectedValue(new Error('down'))
    await read()
    expect(await read(T0 + 16 * 60_000)).toMatchObject({ events: [{ title: 'Bonfire night' }], unavailable: false })
  })
  it('does not hammer Google after a failure', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    await read()
    await read(T0 + 30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('asks for no redirects', async () => {
    fetchMock.mockImplementation(async () => ok())
    await read()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })
})
