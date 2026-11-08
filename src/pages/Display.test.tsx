import css from '../styles.css?raw'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Note, Shopping, Task } from '../api/types'

const shopping = vi.hoisted(() => ({ current: { data: undefined as Shopping | null | undefined, isSuccess: true } }))
vi.mock('../api/hooks', () => ({ useShopping: () => shopping.current, usePeople: () => ({ data: [] }), useNotes: () => ({ data: undefined, isLoading: false }), mutations: {} }))

const { ItemList, NotesView, ShoppingPanel, TimerPanel, TodoList, entryMs, fmtCountdown, fmtEntry, restoreTimer } = await import('./Display')

describe('wall Today card: to-dos and shopping always show', () => {
  it('an empty to-do list still shows its heading', () => {
    const html = renderToStaticMarkup(<TodoList todos={[]} today="2026-11-06" />)
    expect(html).toContain('To do')
    expect(html).toContain('Nothing to do.')
  })

  it('lists to-dos when there are some', () => {
    const html = renderToStaticMarkup(<TodoList todos={[{ id: 't', title: 'Fix the gate', done: false } as Task]} today="2026-11-06" />)
    expect(html).toContain('Fix the gate')
    expect(html).not.toContain('Nothing to do.')
  })

  it('with onDone, each to-do has a tick button named for it', () => {
    const html = renderToStaticMarkup(<TodoList todos={[{ id: 't', title: 'Fix the gate', done: false } as Task]} today="2026-11-06" onDone={async () => {}} />)
    expect(html).toContain('class="wall-tick"')
    expect(html).toContain('aria-label="Done: Fix the gate"')
  })

  it('without onDone the list stays read-only', () => {
    const html = renderToStaticMarkup(<TodoList todos={[{ id: 't', title: 'Fix the gate', done: false } as Task]} today="2026-11-06" />)
    expect(html).not.toContain('wall-tick')
  })

  it('an empty shopping list still shows', () => {
    shopping.current = { data: { id: 'l', name: 'Groceries', items: [] }, isSuccess: true }
    const html = renderToStaticMarkup(<ShoppingPanel />)
    expect(html).toContain('Groceries')
    expect(html).toContain('Nothing to buy.')
  })

  it('with no shopping list at all, the panel still shows', () => {
    shopping.current = { data: null, isSuccess: true }
    const html = renderToStaticMarkup(<ShoppingPanel />)
    expect(html).toContain('Shopping')
    expect(html).toContain('No shopping list yet.')
  })
})

describe('wall columns stay a fixed third each', () => {
  // A long shopping list used to overflow sideways (CSS columns in a fixed-height box), and the
  // fr tracks' auto minimum let it widen the first column and squeeze the other two.
  const rule = (selector: string) => css.match(new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm'))?.[1] ?? ''

  it('the three columns are equal and cannot grow with their content', () => {
    expect(rule('.wall-body')).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  })

  it('the shopping list scrolls down instead of adding columns sideways', () => {
    expect(rule('.wall-shop-scroll')).toContain('overflow-y: auto')
    expect(rule('.wall-shop')).not.toMatch(/flex: 1|overflow: hidden/)
    shopping.current = { data: { id: 'l', name: 'Groceries', items: Array.from({ length: 40 }, (_, n) => ({ id: `i${n}`, name: `Item ${n}` })) } as Shopping, isSuccess: true }
    const html = renderToStaticMarkup(<ShoppingPanel />)
    expect(html).toContain('<div class="wall-shop-scroll"><ul class="wall-shop">')
    expect(html).toContain('Item 39')
  })
})

describe('wall Lists page: everything in full', () => {
  const todos = Array.from({ length: 9 }, (_, n) => ({ id: `t${n}`, title: `Job ${n}`, done: false }) as Task)

  it('the Today card shows six to-dos, and "+N more" opens Lists when it can', () => {
    const plain = renderToStaticMarkup(<TodoList todos={todos} today="2026-11-07" />)
    expect(plain).toContain('Job 5')
    expect(plain).not.toContain('Job 6')
    expect(plain).toContain('<p class="wall-muted wall-more-todos">+3 more</p>')
    // By the heading, so a busy Today card can't push it out of sight.
    const linked = renderToStaticMarkup(<TodoList todos={todos} today="2026-11-07" onMore={() => {}} />)
    expect(linked).toMatch(/^<div class="wall-card-head wall-todo-head"><h3>To do<\/h3><button type="button" class="wall-more">\+3 more<\/button><\/div>/)
    expect(linked).not.toContain('wall-more-todos')
  })

  it('on the Lists page every to-do shows, in a scroller, with no "+N more"', () => {
    const html = renderToStaticMarkup(<TodoList todos={todos} today="2026-11-07" limit={Infinity} heading={false} scroll />)
    expect(html).toContain('Job 8')
    expect(html).not.toContain('more')
    expect(html).not.toContain('<h3>')
    expect(html).toMatch(/^<div class="wall-scroll"><ul class="wall-list">/)
  })

  it('the shopping card links to all lists only when asked', () => {
    shopping.current = { data: { id: 'l', name: 'Groceries', items: [] }, isSuccess: true }
    expect(renderToStaticMarkup(<ShoppingPanel onOpen={() => {}} />)).toContain('All lists')
    expect(renderToStaticMarkup(<ShoppingPanel />)).not.toContain('All lists')
  })

  it('list items each get a tick button named for them, and scroll', () => {
    const items = [{ id: 'i1', name: 'Milk', note: '2 pints' }, { id: 'i2', name: 'Bread' }]
    const html = renderToStaticMarkup(<ItemList items={items} onChecked={async () => {}} />)
    expect(html).toContain('aria-label="Got: Milk"')
    expect(html).toContain('aria-label="Got: Bread"')
    expect(html).toContain('2 pints')
    expect(html).toContain('<div class="wall-scroll">')
  })

  it('an empty list says so', () => {
    expect(renderToStaticMarkup(<ItemList items={[]} />)).toContain('Nothing to buy.')
  })
})

describe('wall timer (tap the clock)', () => {
  const noop = () => {}
  const panel = (run: { endsAt: number; durationMs: number } | undefined, nowMs: number, initialDigits?: string) =>
    renderToStaticMarkup(<TimerPanel run={run} nowMs={nowMs} onStart={noop} onCancel={noop} onClose={noop} initialDigits={initialDigits} />)

  it('counts down as m:ss, rounding up so 0:00 means done', () => {
    expect(fmtCountdown(10 * 60_000)).toBe('10:00')
    expect(fmtCountdown(59_001)).toBe('1:00')
    expect(fmtCountdown(59_000)).toBe('0:59')
    expect(fmtCountdown(1)).toBe('0:01')
    expect(fmtCountdown(0)).toBe('0:00')
    expect(fmtCountdown(-5_000)).toBe('0:00')
  })

  it('typed digits fill in from the right, as on a microwave', () => {
    expect(fmtEntry('')).toBe('0:00')
    expect(fmtEntry('5')).toBe('0:05')
    expect(fmtEntry('130')).toBe('1:30')
    expect(fmtEntry('2500')).toBe('25:00')
    expect(entryMs('')).toBe(0)
    expect(entryMs('130')).toBe(90_000)
    expect(entryMs('2500')).toBe(25 * 60_000)
    // Seconds over 59 count on: 90 is a minute and a half.
    expect(entryMs('90')).toBe(90_000)
  })

  it('offers a keypad to type a time, plus 1, 2, 5 and 10 minutes', () => {
    const html = panel(undefined, 0)
    for (const m of [1, 2, 5, 10]) expect(html).toContain(`>${m} min</button>`)
    for (const d of '0123456789') expect(html).toContain(`class="wall-timer-key">${d}</button>`)
    expect(html).toContain('<div class="wall-timer-entry wall-timer-empty" aria-live="polite">0:00</div>')
    // Nothing typed yet: Start can't be pressed.
    expect(html).toMatch(/<button type="button" class="wall-flip wall-timer-start" disabled="">Start<\/button>/)
    expect(html).not.toContain('role="timer"')
  })

  it('shows what was typed and lets it start', () => {
    const html = panel(undefined, 0, '130')
    expect(html).toContain('<div class="wall-timer-entry" aria-live="polite">1:30</div>')
    expect(html).toContain('<button type="button" class="wall-flip wall-timer-start">Start</button>')
  })

  it('while running shows the time left and a way to cancel', () => {
    const html = panel({ endsAt: 300_000, durationMs: 300_000 }, 30_000)
    expect(html).toContain('<div class="wall-timer-big" role="timer">4:30</div>')
    expect(html).toContain('Cancel timer')
    expect(html).toContain('width:90%')
    expect(html).not.toContain('wall-timer-key')
  })

  it('a running timer carries on after the page reloads', () => {
    const now = 1_000_000
    const saved = (run: unknown, open = false) => JSON.stringify({ run, open })
    expect(restoreTimer(saved({ endsAt: now + 90_000, durationMs: 300_000 }, true), now)).toEqual({ run: { endsAt: now + 90_000, durationMs: 300_000 }, open: true })
    // Finished while reloading: still shown, so "Time's up" isn't missed.
    expect(restoreTimer(saved({ endsAt: now - 30_000, durationMs: 60_000 }), now).run).toBeDefined()
    // Long finished, nothing saved, or junk: back to the plain clock.
    expect(restoreTimer(saved({ endsAt: now - 2 * 3600_000, durationMs: 60_000 }), now)).toEqual({ open: false })
    expect(restoreTimer(null, now)).toEqual({ open: false })
    expect(restoreTimer('{nope', now)).toEqual({ open: false })
    expect(restoreTimer(saved({ endsAt: now + 90_000, durationMs: -1 }), now)).toEqual({ open: false })
    expect(restoreTimer(saved({ endsAt: now + 90_000, minutes: 5 }), now)).toEqual({ open: false })
    // An end time further off than its own length (a clock change) is ignored.
    expect(restoreTimer(saved({ endsAt: now + 20 * 60_000, durationMs: 10 * 60_000 }), now)).toEqual({ open: false })
  })

  it("when time is up it says so, flashes and asks for OK", () => {
    const html = panel({ endsAt: 60_000, durationMs: 60_000 }, 60_000)
    expect(html).toContain('wall-timer wall-timer-done')
    expect(html).toContain("Time&#x27;s up")
    expect(html).toContain('>OK</button>')
    expect(html).not.toContain('min</button>')
  })
})

describe('wall family notes', () => {
  const notes = [
    { id: 'a', title: 'Boiler', category: 'Appliances', body: 'Manual: https://example.com/boiler.pdf', updatedAt: '' },
    { id: 'b', title: 'Next door', category: 'Neighbours', body: 'Sam and Alex', updatedAt: '' },
  ] as Note[]

  it('lists every note and opens the first', () => {
    const html = renderToStaticMarkup(<NotesView notes={notes} />)
    expect(html).toContain('Next door')
    expect(html).toContain('wall-recipe-title">Boiler</h2>')
    expect(html).toContain('aria-label="Filter by category"')
  })

  it('is read-only, and an address stays text so the frame never leaves the wall', () => {
    const html = renderToStaticMarkup(<NotesView notes={notes} />)
    expect(html).toContain('https://example.com/boiler.pdf')
    expect(html).not.toContain('<a ')
    expect(html).not.toMatch(/Edit|Delete/)
  })

  it('says how to add notes when there are none', () => {
    expect(renderToStaticMarkup(<NotesView notes={[]} />)).toContain('No notes yet')
  })
})
