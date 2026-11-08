import { describe, expect, it } from 'vitest'
import type { Note } from '../api/types'
import { groupNotes, linkParts, matchesNote, noteCategories } from './notes'

const note = (title: string, category?: string, body = '') => ({ id: title, title, category, body, updatedAt: '' }) as Note

describe('groupNotes', () => {
  it('keeps the API order and puts uncategorised notes last, under Other', () => {
    const groups = groupNotes([note('Wi-Fi'), note('Boiler', 'Appliances'), note('No. 16', 'Neighbours'), note('Oven', 'Appliances')])
    expect(groups.map((g) => [g.category, g.notes.map((n) => n.title)])).toEqual([
      ['Appliances', ['Boiler', 'Oven']],
      ['Neighbours', ['No. 16']],
      ['Other', ['Wi-Fi']],
    ])
  })
  it('is empty with no notes', () => {
    expect(groupNotes([])).toEqual([])
  })
})

describe('noteCategories', () => {
  it('lists each category once, sorted', () => {
    expect(noteCategories([note('a', 'Neighbours'), note('b'), note('c', 'Appliances'), note('d', 'Neighbours')])).toEqual(['Appliances', 'Neighbours'])
  })
})

describe('matchesNote', () => {
  it('searches title, category and body, ignoring case', () => {
    const n = note('No. 16', 'Neighbours', 'Mrs Patel has a spare key')
    expect(matchesNote(n, 'patel')).toBe(true)
    expect(matchesNote(n, 'neighb')).toBe(true)
    expect(matchesNote(n, 'boiler')).toBe(false)
    expect(matchesNote(n, '  ')).toBe(true)
  })
})

describe('linkParts', () => {
  it('makes http(s) addresses links and leaves the rest as text', () => {
    expect(linkParts('Manual: https://example.com/m.pdf (page 4)')).toEqual([
      { text: 'Manual: ' },
      { text: 'https://example.com/m.pdf', url: 'https://example.com/m.pdf' },
      { text: ' (page 4)' },
    ])
  })
  it('leaves sentence punctuation out of the address', () => {
    expect(linkParts('See https://example.com/help.')).toEqual([{ text: 'See ' }, { text: 'https://example.com/help', url: 'https://example.com/help' }, { text: '.' }])
  })
  it('never links other schemes', () => {
    expect(linkParts('javascript:alert(1) or ftp://x')).toEqual([{ text: 'javascript:alert(1) or ftp://x' }])
  })
  it('is plain text with no address', () => {
    expect(linkParts('Mrs Patel, No. 16')).toEqual([{ text: 'Mrs Patel, No. 16' }])
  })
})
