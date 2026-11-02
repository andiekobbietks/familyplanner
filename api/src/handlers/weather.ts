import type { Handler } from '../lib/http'
import { parse, placeSearchSchema } from '../lib/schemas'
import type { Settings } from '../lib/types'
import { readForecast, searchPlaces } from '../lib/weather'

export const getWeather: Handler = async ({ store, caller }) => {
  const settings = await store.get<Settings>(caller.familyId, 'settings', 'settings')
  if (!settings?.weather) return { body: { place: null, forecast: null } }
  return { body: { place: settings.weather.label, forecast: (await readForecast(settings.weather)) ?? null } }
}

export const getWeatherPlaces: Handler = async (_ctx, _p, query) => {
  const name = parse(placeSearchSchema, query.get('q') ?? '')
  return { body: await searchPlaces(name) }
}
