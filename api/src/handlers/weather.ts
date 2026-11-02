import type { Handler } from '../lib/http'
import { HOME_TOWN, readForecast } from '../lib/weather'

export const getWeather: Handler = async () => ({ body: { place: HOME_TOWN.label, forecast: (await readForecast()) ?? null } })
