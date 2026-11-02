import { z } from 'zod'

/**
 * The forecast for the family's town (section 5.2). The API fetches it, so the browser
 * never contacts an outside service (S10). Only the town's coordinates leave the API (S32).
 */
export const HOME_TOWN = { label: 'Reading, UK', lat: 51.46, lon: -0.97 }

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

async function getJson(url: URL): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' })
  if (!res.ok) throw new Error(`Weather service answered ${res.status}`)
  return res.json()
}

async function fetchForecast(): Promise<Forecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(HOME_TOWN.lat),
    longitude: String(HOME_TOWN.lon),
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

/** When the forecast was fetched, and not to try again before retryAt after a failure, so that an outage isn't hit on every page load. */
let cache: { at: number; forecast?: Forecast; retryAt: number } | undefined

export const clearWeatherCache = () => {
  cache = undefined
}

/** Undefined when there is no forecast to show. The dashboard then carries on without it. */
export async function readForecast(now = Date.now()): Promise<Forecast | undefined> {
  const hit = cache
  const usable = hit?.forecast && now - hit.at < STALE_MS ? hit.forecast : undefined
  if (hit?.forecast && now - hit.at < CACHE_MS) return hit.forecast
  if (hit && now < hit.retryAt) return usable
  try {
    const forecast = await fetchForecast()
    cache = { at: now, forecast, retryAt: 0 }
    return forecast
  } catch {
    cache = { at: hit?.at ?? 0, forecast: hit?.forecast, retryAt: now + RETRY_MS }
    return usable
  }
}
