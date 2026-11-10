import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, setApiOverride } from '../api/client'
import type { ExternalEvents, Shopping, Task, WallList } from '../api/types'
import { openTodos, wallTodos } from './tasks'
import { createDemoApi } from './demoWall'

const today = '2026-11-10'

describe('wall demo mode', () => {
  afterEach(() => {
    setApiOverride(null)
    vi.unstubAllGlobals()
  })

  it('answers every route the wall reads, and never reaches the server', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { location: { pathname: '/display' } })
    setApiOverride(createDemoApi(() => today))
    for (const path of ['/me', '/people', '/settings', '/weather', '/tasks?view=all', `/external-events?from=${today}&to=2026-11-16`, '/plan?week=2026-11-09', '/chores?week=2026-11-09', '/recipes', '/notes', '/shopping', '/shopping/lists']) {
      expect(await api(path), path).toBeTruthy()
    }
    await expect(api('/documents')).rejects.toThrow()
    await expect(api('/tasks', { method: 'POST', json: { title: 'x' } })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fills the Today view: events today, a full to-do card and planned dinners', async () => {
    const demo = createDemoApi(() => today)
    const events = (await demo(`/external-events?from=${today}&to=${today}`, {})) as ExternalEvents
    expect(events.events.length).toBeGreaterThanOrEqual(3)
    const tasks = (await demo('/tasks?view=all', {})) as Task[]
    expect(wallTodos(tasks, today).length).toBeGreaterThan(6)
    expect(await demo('/plan?week=2026-11-09', {})).toHaveLength(14)
  })

  it('ticking a to-do or a shopping item changes only the demo', async () => {
    const demo = createDemoApi(() => today)
    const [first] = openTodos((await demo('/tasks?view=all', {})) as Task[], today)
    await demo(`/tasks/${first.id}/done`, { method: 'POST', json: { done: true } })
    expect(((await demo('/tasks?view=all', {})) as Task[]).map((t) => t.id)).not.toContain(first.id)

    const [item] = ((await demo('/shopping', {})) as Shopping).items
    await demo(`/items/${item.id}/checked`, { method: 'POST', json: { checked: true } })
    expect(((await demo('/shopping', {})) as Shopping).items.map((i) => i.id)).not.toContain(item.id)
    expect(((await demo('/shopping/lists', {})) as WallList[])[0].items.map((i) => i.id)).not.toContain(item.id)
    // A new demo starts afresh.
    expect(((await createDemoApi(() => today)('/shopping', {})) as Shopping).items.map((i) => i.id)).toContain(item.id)
  })
})

describe('wall demo events', () => {
  it("an all-day event shows on its own day only, as the server's would", async () => {
    const { eventsByDay } = await import('./events')
    const events = (await createDemoApi(() => today)(`/external-events?from=${today}&to=2026-11-16`, {})) as ExternalEvents
    const byDay = eventsByDay(events.events, today, '2026-11-16')
    // 10 November 2026 is a Tuesday, bin day.
    expect(byDay.get(today)?.map((e) => e.title)).toContain('Recycling bins out')
    expect(byDay.get('2026-11-11')?.map((e) => e.title)).not.toContain('Recycling bins out')
  })
})
