import { describe, expect, it } from 'vitest'
import type { Recipe } from '../api/types'
import { findRecipe, matchesSearch, sourceUrl, textBlocks } from './recipes'

const recipe = (title: string, extra: Partial<Recipe> = {}) => ({ id: title, title, tags: [], ingredients: '', method: '', notes: '', ...extra }) as Recipe

describe('textBlocks', () => {
  it('starts a block at each line ending in a colon', () => {
    expect(textBlocks('Flour\nSugar\n\nGlaze:\nMilk')).toEqual([{ lines: ['Flour', 'Sugar'] }, { heading: 'Glaze', lines: ['Milk'] }])
  })
  it('is empty for empty text', () => {
    expect(textBlocks('  \n')).toEqual([])
  })
})

describe('findRecipe', () => {
  const recipes = [recipe('Paella')]
  it('matches a whole title, ignoring case and spaces', () => {
    expect(findRecipe(recipes, ' paella ')?.id).toBe('Paella')
  })
  it('does not match part of a title or an empty cell', () => {
    expect(findRecipe(recipes, 'Paella night')).toBeUndefined()
    expect(findRecipe(recipes, '')).toBeUndefined()
  })
})

describe('sourceUrl', () => {
  it('finds an address inside a name', () => {
    expect(sourceUrl('Brian Lagerstrom (https://www.brianlagerstrom.com/recipes/x)')).toBe('https://www.brianlagerstrom.com/recipes/x')
  })
  it('S14: never links anything but http(s)', () => {
    expect(sourceUrl('homemade')).toBeUndefined()
    expect(sourceUrl('javascript:alert(1)')).toBeUndefined()
    expect(sourceUrl(undefined)).toBeUndefined()
  })
})

describe('matchesSearch', () => {
  const r = recipe('Paella', { tags: ['rice'], ingredients: '6 chicken thighs' })
  it('looks at the title, tags and ingredients', () => {
    expect(matchesSearch(r, 'PAEL')).toBe(true)
    expect(matchesSearch(r, 'rice')).toBe(true)
    expect(matchesSearch(r, 'chicken')).toBe(true)
    expect(matchesSearch(r, 'tofu')).toBe(false)
    expect(matchesSearch(r, '')).toBe(true)
  })
})
