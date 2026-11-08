import { describe, expect, it } from 'vitest'
import type { FamilyDocument } from '../api/types'
import { fitWithin, matchesDocument } from './images'

describe('fitWithin', () => {
  it('scales the longer side down to the limit, keeping the shape', () => {
    expect(fitWithin(4032, 3024, 2200)).toEqual({ width: 2200, height: 1650 })
    expect(fitWithin(3024, 4032, 2200)).toEqual({ width: 1650, height: 2200 })
  })
  it('never enlarges a small picture', () => {
    expect(fitWithin(800, 600, 2200)).toEqual({ width: 800, height: 600 })
  })
})

describe('matchesDocument', () => {
  const d = { title: 'Boiler warranty', description: 'Acme Heating, ten years' } as FamilyDocument
  it('needs every word, in the title or description, ignoring case', () => {
    expect(matchesDocument(d, 'boiler acme')).toBe(true)
    expect(matchesDocument(d, 'boiler passport')).toBe(false)
    expect(matchesDocument(d, '  ')).toBe(true)
  })
})
