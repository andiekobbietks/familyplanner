import { z } from 'zod'
import { HttpError } from './errors'
import type { WeatherPlace } from './types'

/**
 * The forecast for the family's town (section 5.2). The API fetches it, so the browser
 * never contacts an outside service (S10). Only the rounded coordinates leave the API (S32).
 */
export interface WeatherDay {
  date: string
  /** WMO weather code. */
  code: number
  high: number
  low: number
  rainChance: number | null
}

export interface Forecast {
  current: { temperature: number; code: number; isDay: boolean }
  days: WeatherDay[]
}

const CACHE_MS = 30 * 60_000
const RETRY_MS = 60_000
/** Past this an old forecast is misleading, so show nothing rather than keep it. */
const STALE_MS = 6 * 60 * 60_000
const FETCH_TIMEOUT_MS = 8_000
const TIME_ZONE = 'Europe/London'

const forecastSchema = z.object({
  current: z.object({ temperature_2m: z.number(), weather_code: z.number(), is_day: z.number() }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
})

const placesSchema = z.object({
  results: z.array(z.object({ name: z.string(), latitude: z.number(), longitude: z.number(), admin1: z.string().optional(), country: z.string().optional() })).optional(),
})

async function getJson(url: URL): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' })
  if (!res.ok) throw new Error(`Weather service answered ${res.status}`)
  return res.json()
}

async function fetchForecast({ lat, lon }: WeatherPlace): Promise<Forecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: TIME_ZONE,
    forecast_days: '7',
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  }).toString()
  const { current, daily } = forecastSchema.parse(await getJson(url))
  return {
    current: { temperature: current.temperature_2m, code: current.weather_code, isDay: current.is_day === 1 },
    days: daily.time.map((date, i) => ({
      date,
      code: daily.weather_code[i],
      high: daily.temperature_2m_max[i],
      low: daily.temperature_2m_min[i],
      rainChance: daily.precipitation_probability_max[i],
    })),
  }
}

interface Cached {
  /** When the forecast was fetched. */
  at: number
  forecast?: Forecast
  /** Not before this, after a failure, so that an outage isn't hit on every page load. */
  retryAt: number
}
const cache = new Map<string, Cached>()

export const clearWeatherCache = () => cache.clear()

/** Undefined when there is no forecast to show. The dashboard then carries on without it. */
export async function readForecast(place: WeatherPlace, now = Date.now()): Promise<Forecast | undefined> {
  const key = `${place.lat},${place.lon}`
  const hit = cache.get(key)
  if (hit?.forecast && now - hit.at < CACHE_MS) return hit.forecast
  if (hit && now < hit.retryAt) return hit.forecast && now - hit.at < STALE_MS ? hit.forecast : undefined
  try {
    const forecast = await fetchForecast(place)
    cache.set(key, { at: now, forecast, retryAt: 0 })
    return forecast
  } catch {
    cache.set(key, { at: hit?.at ?? 0, forecast: hit?.forecast, retryAt: now + RETRY_MS })
    return hit?.forecast && now - hit.at < STALE_MS ? hit.forecast : undefined
  }
}

export async function searchPlaces(name: string): Promise<WeatherPlace[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.search = new URLSearchParams({ name, count: '6', language: 'en', format: 'json' }).toString()
  try {
    const { results = [] } = placesSchema.parse(await getJson(url))
    return results.map((r) => ({ label: [r.name, r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude }))
  } catch {
    throw new HttpError(502, 'WEATHER_UNAVAILABLE', 'Place search is unavailable')
  }
}
