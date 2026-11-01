import { usePeople } from '../api/hooks'
import type { Person } from '../api/types'

export function usePersonMap(): Map<string, Person> {
  const { data } = usePeople()
  return new Map((data ?? []).map((p) => [p.id, p]))
}

export function Avatar({ person, size = 22 }: { person?: Person; size?: number }) {
  const initial = person?.displayName?.[0]?.toUpperCase() ?? '?'
  return (
    <span
      className="avatar"
      title={person?.displayName}
      style={{ background: person?.colour ?? '#94a3b8', width: size, height: size, fontSize: size * 0.55 }}
      aria-label={person?.displayName}
    >
      {initial}
    </span>
  )
}

export function Avatars({ ids }: { ids: string[] }) {
  const map = usePersonMap()
  return (
    <span className="avatars">
      {ids.map((id) => (
        <Avatar key={id} person={map.get(id)} />
      ))}
    </span>
  )
}

/** Multi-select of members as toggle chips. */
export function PersonChips({ value, onChange, single = false }: { value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const { data: people = [] } = usePeople()
  const toggle = (id: string) => {
    if (single) return onChange(value.includes(id) ? [] : [id])
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }
  return (
    <div className="chips" role="group">
      {people.map((p) => {
        const on = value.includes(p.id)
        return (
          <button
            type="button"
            key={p.id}
            className={`chip ${on ? 'on' : ''}`}
            style={on ? { background: p.colour, borderColor: p.colour, color: '#fff' } : undefined}
            aria-pressed={on}
            onClick={() => toggle(p.id)}
          >
            {p.displayName}
          </button>
        )
      })}
    </div>
  )
}
