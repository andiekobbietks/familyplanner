import { describe, expect, it } from 'vitest'
import { itemsToText } from './Shopping'
import type { Item } from '../api/types'

const item = (name: string, extra: Partial<Item> = {}): Item => ({ id: name, listId: 'l', name, checked: false, createdBy: 'x', ...extra })

describe('copy to clipboard text', () => {
  it('A7a: unchecked items only, one per line, note appended', () => {
    const text = itemsToText([item('Milk', { note: '2 pints' }), item('Bread'), item('Eggs', { checked: true }), item('Butter'), item('Jam', { checked: true })])
    expect(text).toBe('Milk 2 pints\nBread\nButter')
  })
  it('groups under category headings when categories are in use, uncategorised first', () => {
    const text = itemsToText([item('Milk', { category: 'Dairy' }), item('Candles'), item('Rolls', { category: 'Bakery' })])
    expect(text).toBe('Candles\n\nDairy\nMilk\n\nBakery\nRolls')
  })
})
