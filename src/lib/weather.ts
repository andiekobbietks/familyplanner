import type { IconName } from '../components/Icons'

/** Plain words and an icon for a WMO weather code, as the forecast service reports them. */
export function describeWeather(code: number, isDay = true): { label: string; icon: IconName } {
  if (code === 0) return { label: 'Clear', icon: isDay ? 'sun' : 'moon' }
  if (code === 1) return { label: 'Mostly clear', icon: isDay ? 'sun' : 'moon' }
  if (code === 2) return { label: 'Partly cloudy', icon: 'partly' }
  if (code === 3) return { label: 'Cloudy', icon: 'cloud' }
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'fog' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'rain' }
  if (code === 61) return { label: 'Light rain', icon: 'rain' }
  if (code === 65) return { label: 'Heavy rain', icon: 'rain' }
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: 'rain' }
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow' }
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rain' }
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow' }
  if (code >= 95 && code <= 99) return { label: 'Thunderstorms', icon: 'storm' }
  return { label: 'Unknown', icon: 'cloud' }
}

export const degrees = (t: number) => `${Math.round(t)}°`
