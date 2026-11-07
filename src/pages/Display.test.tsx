import css from '../styles.css?raw'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Shopping, Task } from '../api/types'

const shopping = vi.hoisted(() => ({ current: { data: undefined as Shopping | null | undefined, isSuccess: true } }))
vi.mock('../api/hooks', () => ({ useShopping: () => shopping.current, usePeople: () => ({ data: [] }), mutations: {} }))

const { ItemList, ShoppingPanel, TodoList } = await import('./Display')

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
