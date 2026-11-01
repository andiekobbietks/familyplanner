/** Date helpers. Calendar dates are "YYYY-MM-DD" strings; instants are ISO UTC. */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isoDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function addMonths(date: string, n: number): string | null {
  const { y, m, d } = parseDate(date)
  const t = new Date(Date.UTC(y, m - 1 + n, d))
  // "Monthly on the same date": a 31st has no occurrence in a 30-day month.
  if (t.getUTCDate() !== d) return null
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function mondayOf(date: string): string {
  const { y, m, d } = parseDate(date)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow)
}

interface WallClock {
  y: number
  m: number
  d: number
  hh: number
  mm: number
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    fmtCache.set(tz, f)
  }
  return f
}

/** Wall-clock time of an instant in a zone. */
export function wallClock(instant: Date, tz: string): WallClock {
  const parts = Object.fromEntries(formatter(tz).formatToParts(instant).map((p) => [p.type, p.value]))
  return { y: +parts.year, m: +parts.month, d: +parts.day, hh: +parts.hour, mm: +parts.minute }
}

/** Instant for a wall-clock time in a zone. Correct across the two clock changes. */
export function fromWallClock(w: WallClock, tz: string): Date {
  const target = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const got = wallClock(new Date(guess), tz)
    const offset = Date.UTC(got.y, got.m - 1, got.d, got.hh, got.mm) - guess // zone offset in force at `guess`
    const candidate = target - offset
    if (candidate === guess) break
    guess = candidate
  }
  return new Date(guess)
}

/** The calendar date on which an instant falls, in a zone. */
export function dateOf(instant: Date, tz: string): string {
  const w = wallClock(instant, tz)
  return isoDate(w.y, w.m, w.d)
}

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const { y, m, d } = parseDate(s)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function isValidInstant(s: string): boolean {
  return !Number.isNaN(Date.parse(s)) && /T/.test(s)
}
