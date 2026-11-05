import { describe, expect, it } from 'vitest'
import { monthGrid } from './dates'

describe('monthGrid', () => {
  it('February 2027 starts on a Monday and fills exactly four weeks', () => {
    const { days } = monthGrid('2027-02-17')
    expect(days.length).toBe(28)
    expect([days[0], days[days.length - 1]]).toEqual(['2027-02-01', '2027-02-28'])
  })
  it('November 2026 starts on a Sunday and needs six weeks', () => {
    const { month, days } = monthGrid('2026-11-05')
    expect(month).toBe('2026-11')
    expect(days.length).toBe(42)
    expect([days[0], days[days.length - 1]]).toEqual(['2026-10-26', '2026-12-06'])
  })
  it('a month spanning the October clock change keeps whole days', () => {
    const { days } = monthGrid('2026-10-01')
    expect(days.length).toBe(35)
    expect(new Set(days).size).toBe(35)
    expect(days).toContain('2026-10-25')
    expect(days[days.length - 1]).toBe('2026-11-01')
  })
})
