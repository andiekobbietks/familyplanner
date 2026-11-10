import { describe, expect, it } from 'vitest'
import { safeNext } from './redirect'

describe('safeNext: where the login page sends you afterwards', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNext('/display')).toBe('/display')
    expect(safeNext('/meals/recipes/r1?x=1')).toBe('/meals/recipes/r1?x=1')
  })

  it('falls back to the home page when there is none', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext('')).toBe('/')
  })

  it('refuses anything that could leave the site (open redirect)', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', '/\\/evil.example', 'javascript:alert(1)', 'evil.example', ' /display', '/display\nx']) {
      expect(safeNext(bad), bad).toBe('/')
    }
  })
})
