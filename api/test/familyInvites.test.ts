import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

/** The script runs in Google Apps Script, so the parts that need no Google services are tested here. */
const source = readFileSync(resolve(__dirname, '../../infra/family-invites.gs'), 'utf8')
const signed = (b: Buffer) => [...b].map((x) => (x > 127 ? x - 256 : x))
const Utilities = {
  base64Decode: (s: string) => signed(Buffer.from(s, 'base64')),
  base64DecodeWebSafe: (s: string) => signed(Buffer.from(s, 'base64url')),
  newBlob: (bytes: number[]) => ({ getDataAsString: () => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('utf8') }),
}
const script = runInNewContext(`${source}\n;({ findCalendarPart, parseInvite, toEvent })`, { Utilities }) as {
  findCalendarPart: (raw: string) => string | null
  parseInvite: (text: string) => { method: string; events: Record<string, unknown>[] }
  toEvent: (e: unknown) => Record<string, unknown>
}
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** Shaped like an Outlook invite: Windows zone name, folded lines, an alarm block, escaped commas. */
const INVITE = `BEGIN:VCALENDAR
METHOD:REQUEST
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VTIMEZONE
TZID:GMT Standard Time
BEGIN:STANDARD
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
ORGANIZER;CN=Tim Johnson:mailto:tim@work.example
ATTENDEE;ROLE=REQ-PARTICIPANT;CN=family:mailto:you+family@gmail.com
DESCRIPTION;LANG=en-GB:Confidential agenda
UID:040000008200E00074C5B7101A82E00800000000ABCDEF0123456789
 00112233
SUMMARY;LANG=en-GB:School play\\, Year 3
DTSTART;TZID=GMT Standard Time:20261105T090000
DTEND;TZID=GMT Standard Time:20261105T103000
SEQUENCE:2
LOCATION;LANG=en-GB:St Mary's\\, Main Hall
STATUS:CONFIRMED
BEGIN:VALARM
ACTION:DISPLAY
SUMMARY:Reminder
TRIGGER:-PT15M
END:VALARM
END:VEVENT
END:VCALENDAR
`.replace(/\n/g, '\r\n')

const email = (headers: string, body: string) =>
  ['Subject: x', 'Content-Type: multipart/alternative; boundary="_b_"', '', '--_b_', 'Content-Type: text/plain', '', 'hello', '--_b_', headers, '', body, '--_b_--', ''].join('\r\n')

describe('finding the invite in the email', () => {
  it('reads a base64 calendar part, as Exchange sends it', () => {
    const b64 = Buffer.from(INVITE).toString('base64').replace(/(.{76})/g, '$1\r\n')
    expect(script.findCalendarPart(email('Content-Type: text/calendar; charset="utf-8";\r\n\tmethod=REQUEST\r\nContent-Transfer-Encoding: base64', b64))).toContain('School play')
  })
  it('finds the encoding when it comes before the type', () => {
    const b64 = Buffer.from(INVITE).toString('base64')
    expect(script.findCalendarPart(email('Content-Transfer-Encoding: base64\r\nContent-Type: text/calendar', b64))).toContain('School play')
  })
  it('reads quoted-printable and keeps accents', () => {
    expect(script.findCalendarPart(email('Content-Type: text/calendar\r\nContent-Transfer-Encoding: quoted-printable', 'SUMMARY:Caf=C3=A9 =\r\nvisit'))).toContain('SUMMARY:Café visit')
  })
  it('reads an .ics attachment', () => {
    expect(script.findCalendarPart(email('Content-Type: application/ics; name="invite.ics"', INVITE))).toContain('School play')
  })
  it('returns nothing for an ordinary email', () => {
    expect(script.findCalendarPart(email('Content-Type: text/html', '<p>hi</p>'))).toBeNull()
  })
})

describe('reading the invite', () => {
  const event = () => script.parseInvite(INVITE).events[0]

  it('joins folded lines and reads the method', () => {
    expect(script.parseInvite(INVITE).method).toBe('REQUEST')
    expect(event().uid).toBe('040000008200E00074C5B7101A82E00800000000ABCDEF012345678900112233')
  })
  it('keeps the event title, not the reminder title, and unescapes commas', () => {
    expect(event().summary).toBe('School play, Year 3')
    expect(event().location).toBe("St Mary's, Main Hall")
  })
  it('turns a Windows zone into one Google accepts', () => {
    expect(plain(script.toEvent(event()))).toMatchObject({ start: { dateTime: '2026-11-05T09:00:00', timeZone: 'Europe/London' }, end: { dateTime: '2026-11-05T10:30:00', timeZone: 'Europe/London' } })
  })
  it('leaves the meeting body and attendees behind', () => {
    const out = JSON.stringify(script.toEvent(event()))
    expect(out).not.toContain('Confidential')
    expect(out).not.toContain('work.example')
  })
  it('handles a zone name in quotes containing a colon', () => {
    const [e] = script.parseInvite('BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID="(UTC+00:00) Dublin, London":20261105T090000\r\nEND:VEVENT').events
    expect(plain(script.toEvent(e))).toMatchObject({ start: { dateTime: '2026-11-05T09:00:00', timeZone: 'Europe/London' } })
  })
  it('handles all-day and UTC times', () => {
    const [day] = script.parseInvite('BEGIN:VEVENT\r\nUID:a\r\nDTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106\r\nEND:VEVENT').events
    expect(plain(script.toEvent(day))).toMatchObject({ start: { date: '2026-11-05' }, end: { date: '2026-11-06' } })
    const [utc] = script.parseInvite('BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261105T090000Z\r\nDTEND:20261105T100000Z\r\nEND:VEVENT').events
    expect(plain(script.toEvent(utc))).toMatchObject({ start: { dateTime: '2026-11-05T09:00:00Z' } })
  })
  it('carries a repeat rule and its skipped dates', () => {
    const [e] = script.parseInvite('BEGIN:VEVENT\r\nUID:a\r\nDTSTART;TZID=GMT Standard Time:20261105T090000\r\nRRULE:FREQ=WEEKLY;BYDAY=TH\r\nEXDATE;TZID=GMT Standard Time:20261112T090000\r\nEND:VEVENT').events
    expect(plain(script.toEvent(e)).recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TH', 'EXDATE;TZID=Europe/London:20261112T090000'])
  })
  it('reads a cancellation', () => {
    const r = script.parseInvite('BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nUID:a\r\nSTATUS:CANCELLED\r\nDTSTART:20261105T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR')
    expect(r.method).toBe('CANCEL')
    expect(r.events[0].status).toBe('CANCELLED')
  })
  it('reads which date of a repeating meeting changed', () => {
    const [e] = script.parseInvite('BEGIN:VEVENT\r\nUID:a\r\nRECURRENCE-ID;TZID=GMT Standard Time:20261112T090000\r\nDTSTART;TZID=GMT Standard Time:20261113T090000\r\nEND:VEVENT').events
    expect(plain(e.recurrenceId)).toEqual({ value: '20261112T090000', tzid: 'GMT Standard Time', isDate: false })
  })
})

describe('a run of the script', () => {
  const invite = (uid: string, method = 'REQUEST') => email('Content-Type: text/calendar', `METHOD:${method}\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${uid}\r\nDTSTART:20261105T090000Z\r\nDTEND:20261105T100000Z\r\nEND:VEVENT`)

  function setup(mail: Record<string, string>, existing: Record<string, { id: string; status?: string }> = {}) {
    const calls: string[] = []
    const store: Record<string, string> = {}
    const context = {
      Utilities,
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => (store[k] = v) }) },
      Gmail: {
        Users: {
          Messages: {
            list: (_: string, o: { q: string }) => {
              calls.push(`search ${o.q}`)
              return { messages: Object.keys(mail).map((id) => ({ id })) }
            },
            // Newest first in the list above is the reverse of the order the mail arrived.
            get: (_: string, id: string) => {
              if (mail[id] === 'fail') throw new Error('boom')
              calls.push(`read ${id}`)
              return { raw: id.startsWith('bytes') ? signed(Buffer.from(mail[id])) : Buffer.from(mail[id]).toString('base64url') }
            },
          },
        },
      },
      Calendar: {
        Events: {
          list: (_: string, o: { iCalUID: string }) => ({ items: existing[o.iCalUID] ? [existing[o.iCalUID]] : [] }),
          import: (e: { iCalUID: string }) => calls.push(`import ${e.iCalUID}`),
          patch: (_: unknown, __: string, id: string) => calls.push(`patch ${id}`),
          remove: (_: string, id: string) => calls.push(`remove ${id}`),
        },
      },
    }
    const run = runInNewContext(`${source}\n;run`, context) as () => void
    return { run, calls, store }
  }

  it('reads only labelled mail, oldest first, and imports the event', () => {
    const { run, calls } = setup({ newer: invite('b'), bytes: invite('a') })
    run()
    expect(calls).toEqual(['search label:Family newer_than:3d', 'read bytes', 'import a', 'read newer', 'import b'])
  })
  it('does not handle the same email twice', () => {
    const { run, calls } = setup({ one: invite('a') })
    run()
    run()
    expect(calls.filter((c) => c === 'import a')).toHaveLength(1)
  })
  it('updates an event it already has', () => {
    const { run, calls } = setup({ one: invite('a') }, { a: { id: 'g1' } })
    run()
    expect(calls).toContain('patch g1')
  })
  it('removes a cancelled event', () => {
    const { run, calls } = setup({ one: invite('a', 'CANCEL') }, { a: { id: 'g1' } })
    run()
    expect(calls).toContain('remove g1')
  })
  it('a failure is reported and retried, and other invites still go through', () => {
    const mail = { bad: 'fail', good: invite('a') }
    const { run, calls, store } = setup(mail)
    expect(run).toThrow('boom')
    expect(calls).toContain('import a')
    expect(JSON.parse(store.seen)).toEqual(['good'])
  })
  it('stays on the narrow permissions', () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../infra/family-invites.appsscript.json'), 'utf8'))
    expect(manifest.oauthScopes.sort()).toEqual(['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/script.scriptapp'])
    const code = source.split('\n').filter((l) => !l.trim().startsWith('*')).join('\n')
    expect(code).not.toMatch(/GmailApp|CalendarApp|MailApp/)
  })
})
