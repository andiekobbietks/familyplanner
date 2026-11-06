import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Shopping, Task } from '../api/types'

const shopping = vi.hoisted(() => ({ current: { data: undefined as Shopping | null | undefined, isSuccess: true } }))
vi.mock('../api/hooks', () => ({ useShopping: () => shopping.current, usePeople: () => ({ data: [] }), mutations: {} }))

const { ShoppingPanel, TodoList } = await import('./Display')

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
