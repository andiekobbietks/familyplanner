import { describe, expect, it } from 'vitest'
import { expand } from '../src/lib/recurrence'
import type { Event } from '../src/lib/types'

const base = {
  id: 'e',
  familyId: 'f',
  type: 'event' as const,
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
  tz: 'Europe/London',
  assignees: [],
}

describe('recurrence expansion', () => {
  it('A8: a weekly event on a Monday appears on the next eight Mondays', () => {
    const ev: Event = { ...base, title: 'Swim', allDay: true, start: '2026-09-14', end: '2026-09-14', recurrence: { freq: 'weekly', interval: 1, exceptions: [] } }
    const occ = expand(ev, '2026-09-14', '2026-11-09')
    expect(occ.map((o) => o.start)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
  })

  it('deleting one occurrence leaves the others', () => {
    const ev: Event = { ...base, title: 'Swim', allDay: true, start: '2026-09-14', end: '2026-09-14', recurrence: { freq: 'weekly', interval: 1, exceptions: ['2026-09-21'] } }
    expect(expand(ev, '2026-09-14', '2026-09-28').map((o) => o.start)).toEqual(['2026-09-14', '2026-09-28'])
  })

  it('keeps wall-clock time across the October clock change', () => {
    // 09:00 BST on 19 Oct 2026 is 08:00 UTC. Clocks go back on 25 Oct.
    const ev: Event = { ...base, title: 'School run', allDay: false, start: '2026-10-19T08:00:00.000Z', end: '2026-10-19T09:00:00.000Z', recurrence: { freq: 'weekly', interval: 1, exceptions: [] } }
    const occ = expand(ev, '2026-10-26', '2026-10-26')
    expect(occ).toHaveLength(1)
    expect(occ[0].start).toBe('2026-10-26T09:00:00.000Z') // still 09:00 local, now GMT
  })

  it('A9: an all-day event on the clock-change day stays on that day', () => {
    const ev: Event = { ...base, title: 'Fair', allDay: true, start: '2026-03-29', end: '2026-03-29' }
    expect(expand(ev, '2026-03-28', '2026-03-30').map((o) => o.start)).toEqual(['2026-03-29'])
    expect(expand(ev, '2026-03-30', '2026-03-31')).toHaveLength(0)
  })

  it('monthly on the 31st skips short months', () => {
    const ev: Event = { ...base, title: 'Rent', allDay: true, start: '2026-01-31', end: '2026-01-31', recurrence: { freq: 'monthly', interval: 1, exceptions: [] } }
    expect(expand(ev, '2026-01-01', '2026-05-31').map((o) => o.start)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })

  it('respects until and every-N-weeks', () => {
    const ev: Event = { ...base, title: 'Bins', allDay: true, start: '2026-09-02', end: '2026-09-02', recurrence: { freq: 'weekly', interval: 2, until: '2026-09-30', exceptions: [] } }
    expect(expand(ev, '2026-09-01', '2026-10-31').map((o) => o.start)).toEqual(['2026-09-02', '2026-09-16', '2026-09-30'])
  })

  it('a multi-day all-day event overlaps a range that starts mid-way', () => {
    const ev: Event = { ...base, title: 'Half term', allDay: true, start: '2026-10-26', end: '2026-10-30' }
    expect(expand(ev, '2026-10-28', '2026-10-28')).toHaveLength(1)
  })
})

describe('wall-clock conversion (regression: BST offset was applied twice)', () => {
  it('a non-recurring timed event in BST expands to exactly its stored instant', () => {
    const ev: Event = { ...base, title: 'Parents evening', allDay: false, start: '2026-09-13T15:30:00.000Z', end: '2026-09-13T16:30:00.000Z' }
    const occ = expand(ev, '2026-09-13', '2026-09-13')
    expect(occ.map((o) => [o.start, o.end])).toEqual([['2026-09-13T15:30:00.000Z', '2026-09-13T16:30:00.000Z']])
  })
  it('a weekly event created in GMT keeps 09:00 local once BST starts', () => {
    // 09:00 GMT on 23 Mar 2026; clocks go forward on 29 Mar.
    const ev: Event = { ...base, title: 'School run', allDay: false, start: '2026-03-23T09:00:00.000Z', end: '2026-03-23T09:30:00.000Z', recurrence: { freq: 'weekly', interval: 1, exceptions: [] } }
    expect(expand(ev, '2026-03-30', '2026-03-30')[0].start).toBe('2026-03-30T08:00:00.000Z')
  })
})
