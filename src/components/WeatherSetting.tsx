import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { mutations, useSettings } from '../api/hooks'
import type { WeatherPlace } from '../api/types'
import { useToast } from './Toast'

/** The dashboard shows no weather until a town is chosen here. A town, not an address (S32). */
export function WeatherSetting() {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [places, setPlaces] = useState<WeatherPlace[] | null>(null)

  const search = async (e: FormEvent) => {
    e.preventDefault()
    try {
      setPlaces(await api<WeatherPlace[]>(`/weather/places?q=${encodeURIComponent(name.trim())}`))
    } catch (err) {
      toast((err as Error).message)
    }
  }

  const save = async (weather: WeatherPlace | null) => {
    try {
      await mutations.patchSettings({ weather })
      setPlaces(null)
      setName('')
      void qc.invalidateQueries({ queryKey: ['settings'] })
      void qc.invalidateQueries({ queryKey: ['weather'] })
    } catch (err) {
      toast((err as Error).message)
    }
  }

  return (
    <div className="card">
      <h2>Weather</h2>
      <p className="muted small">{settings?.weather ? `Showing the forecast for ${settings.weather.label}.` : 'Choose your town to show the forecast on the dashboard. Use a town rather than your address.'}</p>
      <form className="row" onSubmit={search}>
        <input type="search" aria-label="Town" placeholder="Search for a town…" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        <button className="btn" type="submit" disabled={name.trim().length < 2}>
          Search
        </button>
      </form>
      {places?.length === 0 && <p className="empty">Nowhere found.</p>}
      {places && places.length > 0 && (
        <ul className="list">
          {places.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <span className="grow">{p.label}</span>
              <button className="btn sm" type="button" onClick={() => void save(p)}>
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
      {settings?.weather && (
        <button className="btn link danger" type="button" onClick={() => void save(null)}>
          Stop showing weather
        </button>
      )}
    </div>
  )
}
