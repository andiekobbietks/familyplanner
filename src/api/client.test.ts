import { describe, expect, it } from 'vitest'
import { apiUrl } from './client'

describe('apiUrl (S34)', () => {
  it('the wall page and its pairing page use the display aliases', () => {
    expect(apiUrl('/tasks?view=all', '/display')).toBe('/api/display/tasks?view=all')
    expect(apiUrl('/me', '/display/')).toBe('/api/display/me')
    expect(apiUrl('/pair', '/display/pair')).toBe('/api/display/pair')
  })
  it('every other page uses the signed-in API', () => {
    expect(apiUrl('/tasks', '/')).toBe('/api/tasks')
    expect(apiUrl('/members', '/members')).toBe('/api/members')
    expect(apiUrl('/display-devices', '/members')).toBe('/api/display-devices')
    expect(apiUrl('/tasks', '/displayx')).toBe('/api/tasks')
  })
})
