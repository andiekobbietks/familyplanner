import { describe, expect, it } from 'vitest'
import { degrees, describeWeather } from './weather'

describe('describeWeather', () => {
  it('names each group of codes', () => {
    const labels = [0, 2, 3, 45, 53, 61, 63, 65, 73, 81, 85, 95].map((c) => describeWeather(c).label)
    expect(labels).toEqual(['Clear', 'Partly cloudy', 'Cloudy', 'Fog', 'Drizzle', 'Light rain', 'Rain', 'Heavy rain', 'Snow', 'Showers', 'Snow showers', 'Thunderstorms'])
  })
  it('shows the moon on a clear night only', () => {
    expect(describeWeather(0, false).icon).toBe('moon')
    expect(describeWeather(0, true).icon).toBe('sun')
    expect(describeWeather(61, false).icon).toBe('rain')
  })
  it('copes with a code it does not know', () => {
    expect(describeWeather(999)).toEqual({ label: 'Unknown', icon: 'cloud' })
  })
})

describe('degrees', () => {
  it('rounds, and has no negative zero', () => {
    expect(degrees(12.6)).toBe('13°')
    expect(degrees(-0.3)).toBe('0°')
  })
})
