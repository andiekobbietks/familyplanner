/**
 * Puts calendar invites sent to you+family@gmail.com on the Family
 * Google calendar. Runs in Google Apps Script (script.google.com), not in this
 * app. Setup steps are in the README under "Adding events from Outlook".
 *
 * Only the title, time, location and repeat rule are copied. The meeting body
 * and attendee list are left behind, so work details stay out of the calendar.
 *
 * Permissions are pinned in family-invites.appsscript.json: Gmail is read-only
 * and the calendar is events only. Do not use GmailApp or CalendarApp here,
 * because either would widen them to full access.
 */
const CALENDAR_ID = 'YOUR_CALENDAR_ID@group.calendar.google.com'
const LABEL = 'Family'
const LOOKBACK = '3d'
const DEFAULT_ZONE = 'Europe/London'
const MAX_SEEN = 300

/** Outlook names zones the Windows way. Anything with a slash is already in the form Google wants. */
const WINDOWS_ZONES = {
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'UTC': 'UTC',
  'Coordinated Universal Time': 'UTC',
  'Romance Standard Time': 'Europe/Paris',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'GTB Standard Time': 'Europe/Athens',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
}

/** Run this once by hand. It starts the five-minute timer. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('run').timeBased().everyMinutes(5).create()
}

function run() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(1000)) return
  const props = PropertiesService.getScriptProperties()
  const seen = JSON.parse(props.getProperty('seen') || '[]')
  const failures = []

  const found = Gmail.Users.Messages.list('me', { q: `label:${LABEL} newer_than:${LOOKBACK}`, maxResults: 100 }).messages || []
  // Gmail lists newest first. Oldest first means an invite is handled before its update or cancellation.
  for (const { id } of found.slice().reverse()) {
    if (seen.includes(id)) continue
    try {
      const part = findCalendarPart(rawText(Gmail.Users.Messages.get('me', id, { format: 'raw' }).raw))
      if (part) applyInvite(parseInvite(part))
      seen.push(id)
    } catch (e) {
      // Not marked as seen, so the next run tries again.
      failures.push(`${id}: ${e.message}`)
    }
  }
  props.setProperty('seen', JSON.stringify(seen.slice(-MAX_SEEN)))
  lock.releaseLock()
  // Failing the run is what makes Google send its failure email.
  if (failures.length) throw new Error(failures.join('; '))
}

/** Apps Script hands raw email back as bytes or as URL-safe base64, depending on the runtime. */
function rawText(raw) {
  const bytes = typeof raw === 'string' ? Utilities.base64DecodeWebSafe(raw) : raw
  return Utilities.newBlob(bytes).getDataAsString('UTF-8')
}

/** The invite's calendar data, from whichever part of the email holds it. */
function findCalendarPart(raw) {
  for (const chunk of raw.split(/^--.*$/m)) {
    const gap = chunk.search(/\r?\n\r?\n/)
    if (gap < 0) continue
    const headers = chunk.slice(0, gap)
    if (!/content-type:\s*(text\/calendar|application\/ics)/i.test(headers)) continue
    const encoding = (headers.match(/content-transfer-encoding:\s*([\w-]+)/i) || [])[1] || ''
    return decodeBody(chunk.slice(gap).trim(), encoding.toLowerCase())
  }
  return null
}

function decodeBody(body, encoding) {
  if (encoding === 'base64') return Utilities.newBlob(Utilities.base64Decode(body.replace(/\s/g, ''))).getDataAsString('UTF-8')
  if (encoding !== 'quoted-printable') return body
  const text = body.replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < text.length; i++) {
    const hex = text.slice(i + 1, i + 3)
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else bytes.push(text.charCodeAt(i))
  }
  return Utilities.newBlob(bytes.map((b) => (b > 127 ? b - 256 : b))).getDataAsString('UTF-8')
}

const unescapeText = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1')

/** { method, events } from iCalendar text. Long lines are folded, and TZID values may contain colons. */
function parseInvite(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const events = []
  let method = 'REQUEST'
  let event = null
  let nested = false
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = { exdates: [] }
    else if (line === 'END:VEVENT') {
      events.push(event)
      event = null
    } else if (/^BEGIN:VALARM/.test(line)) nested = true
    else if (/^END:VALARM/.test(line)) nested = false
    else if (nested) continue
    else {
      const m = line.match(/^([A-Za-z-]+)((?:;[^:;=]+=(?:"[^"]*"|[^:;]*))*):(.*)$/)
      if (!m) continue
      const [, name, params, value] = m
      if (!event) {
        if (name === 'METHOD') method = value.trim().toUpperCase()
        continue
      }
      const time = () => ({ value: value.trim(), tzid: ((params.match(/;TZID="?([^";:]+)"?/i) || [])[1] || '').trim(), isDate: /VALUE=DATE(;|$)/i.test(params) || /^\d{8}$/.test(value.trim()) })
      if (name === 'UID') event.uid = value.trim()
      else if (name === 'SEQUENCE') event.sequence = Number(value) || 0
      else if (name === 'SUMMARY') event.summary = unescapeText(value)
      else if (name === 'LOCATION') event.location = unescapeText(value)
      else if (name === 'STATUS') event.status = value.trim().toUpperCase()
      else if (name === 'RRULE') event.rrule = value.trim()
      else if (name === 'DTSTART') event.start = time()
      else if (name === 'DTEND') event.end = time()
      else if (name === 'RECURRENCE-ID') event.recurrenceId = time()
      else if (name === 'EXDATE') event.exdates.push(time())
    }
  }
  return { method, events }
}

function zoneOf(tzid) {
  if (!tzid) return DEFAULT_ZONE
  if (tzid.includes('/')) return tzid
  return WINDOWS_ZONES[tzid] || DEFAULT_ZONE
}

const dashed = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
const timed = (v) => `${dashed(v)}T${v.slice(9, 11)}:${v.slice(11, 13)}:${v.slice(13, 15)}`

function toTime(t) {
  if (t.isDate) return { date: dashed(t.value) }
  if (t.value.endsWith('Z')) return { dateTime: `${timed(t.value)}Z`, timeZone: DEFAULT_ZONE }
  return { dateTime: timed(t.value), timeZone: zoneOf(t.tzid) }
}

/** An exclusion date, with the Windows zone name swapped for one Google accepts. */
function toExdate(t) {
  if (t.isDate) return `EXDATE;VALUE=DATE:${t.value}`
  return t.value.endsWith('Z') ? `EXDATE:${t.value}` : `EXDATE;TZID=${zoneOf(t.tzid)}:${t.value}`
}

/** The event as Google's Calendar API wants it. */
function toEvent(e) {
  const out = { iCalUID: e.uid, summary: e.summary || 'Busy', location: e.location || '', status: 'confirmed', start: toTime(e.start), end: toTime(e.end || e.start) }
  if (e.rrule) out.recurrence = [`RRULE:${e.rrule}`, ...e.exdates.map(toExdate)]
  return out
}

function findExisting(uid) {
  return Calendar.Events.list(CALENDAR_ID, { iCalUID: uid, showDeleted: true }).items[0]
}

/** One changed or cancelled date of a repeating meeting. Google wants its original start in UTC. */
function findOccurrence(master, recurrenceId) {
  const start = toTime(recurrenceId)
  let originalStart = start.date
  if (start.dateTime) originalStart = start.dateTime.endsWith('Z') ? start.dateTime : Utilities.formatDate(Utilities.parseDate(start.dateTime, start.timeZone, "yyyy-MM-dd'T'HH:mm:ss"), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'")
  return Calendar.Events.instances(CALENDAR_ID, master.id, { originalStart }).items[0]
}

function applyInvite({ method, events }) {
  for (const e of events) {
    if (!e.uid || !e.start) throw new Error('Invite has no ID or start time')
    const cancelled = method === 'CANCEL' || e.status === 'CANCELLED'
    const master = findExisting(e.uid)
    const target = e.recurrenceId && master ? findOccurrence(master, e.recurrenceId) : master

    if (cancelled) {
      if (target && target.status !== 'cancelled') {
        if (e.recurrenceId) Calendar.Events.patch({ status: 'cancelled' }, CALENDAR_ID, target.id)
        else Calendar.Events.remove(CALENDAR_ID, target.id)
      }
    } else if (target) {
      const { iCalUID, recurrence, ...changes } = toEvent(e)
      Calendar.Events.patch(e.recurrenceId ? changes : { ...changes, recurrence }, CALENDAR_ID, target.id)
    } else {
      Calendar.Events.import(toEvent(e), CALENDAR_ID)
    }
  }
}
