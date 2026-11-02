/** Display helpers. English (UK), `Mon 14 Sep`, 24-hour clock, browser's local zone. */

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date of a Date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return isoDate(new Date())
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: string, n: number): string {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function mondayOf(date: string): string {
  const dow = parseISODate(date).getDay()
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const dayLongFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const shortDayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })

/** "Mon 14 Sep" */
export const fmtDay = (date: string) => dayFmt.format(parseISODate(date))
export const fmtDayLong = (date: string) => dayLongFmt.format(parseISODate(date))
export const fmtWeekday = (date: string) => shortDayFmt.format(parseISODate(date))
export const fmtMonth = (date: string) => monthFmt.format(parseISODate(date))
/** "17:30" from an instant. */
export const fmtTime = (instant: string) => timeFmt.format(new Date(instant))
/** Local date of an instant. */
export const dateOfInstant = (instant: string) => isoDate(new Date(instant))

export function relativeDay(date: string): string {
  const today = todayISO()
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  if (date === addDays(today, -1)) return 'Yesterday'
  return fmtDay(date)
}
