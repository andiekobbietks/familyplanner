import { useMemo, useState, type CSSProperties } from 'react'
import { useCalendarEvents } from '../api/hooks'
import type { Occurrence } from '../api/types'
import { Icon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { addDays, dateOfInstant, fmtDay, fmtMonth, fmtTime, fmtWeekday, mondayOf, parseISODate, relativeDay, todayISO, weekDays } from '../lib/dates'

type View = 'month' | 'week' | 'agenda'
const isPhone = () => window.matchMedia('(max-width: 767px)').matches

/** Google Calendar holds every event, so this page only displays them (section 5.3). */
export function Calendar() {
  const today = todayISO()
  const [view, setView] = useState<View>(() => (isPhone() ? 'agenda' : 'month'))
  const [anchor, setAnchor] = useState(today)
  const [hidden, setHidden] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Occurrence | null>(null)

  const range = useMemo(() => {
    if (view === 'agenda') return { from: anchor, to: addDays(anchor, 60) }
    if (view === 'week') {
      const m = mondayOf(anchor)
      return { from: m, to: addDays(m, 6) }
    }
    const first = anchor.slice(0, 8) + '01'
    const gridStart = mondayOf(first)
    return { from: gridStart, to: addDays(gridStart, 41) }
  }, [view, anchor])

  const { events, calendars, unavailable } = useCalendarEvents(range.from, range.to)
  const several = calendars.length > 1

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const e of events) {
      if (hidden && e.external.label !== hidden) continue
      const first = e.allDay ? e.start : dateOfInstant(e.start)
      const last = e.allDay ? e.end : dateOfInstant(e.end)
      for (let d = first; d <= last; d = addDays(d, 1)) {
        if (!m.has(d)) m.set(d, [])
        m.get(d)!.push(e)
      }
    }
    return m
  }, [events, hidden])

  const step = (n: number) => {
    if (view === 'month') {
      const d = parseISODate(anchor.slice(0, 8) + '01')
      d.setMonth(d.getMonth() + n)
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    } else if (view === 'week') setAnchor(addDays(mondayOf(anchor), 7 * n))
    else setAnchor(addDays(anchor, 30 * n))
  }

  const openDay = (d: string) => {
    setAnchor(d)
    setView('agenda')
  }

  const heading = view === 'month' ? fmtMonth(anchor) : view === 'week' ? `Week of ${fmtDay(mondayOf(anchor))}` : anchor === today ? 'Upcoming' : `From ${fmtDay(anchor)}`

  return (
    <>
      <div className="page-head">
        <h1 className="grow">{heading}</h1>
        <button className="icon-btn boxed" type="button" onClick={() => step(-1)} aria-label="Previous">
          <Icon name="left" />
        </button>
        <button className="btn sm" type="button" onClick={() => setAnchor(today)}>
          Today
        </button>
        <button className="icon-btn boxed" type="button" onClick={() => step(1)} aria-label="Next">
          <Icon name="right" />
        </button>
      </div>
      <div className="cal-tools">
        <div className="seg grow" role="group" aria-label="View">
          {(['agenda', 'week', 'month'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <a className="btn primary sm" href="https://calendar.google.com/calendar/" target="_blank" rel="noopener noreferrer">
          Add in Google
        </a>
      </div>
      {several && (
        <div className="filter-row">
          <button type="button" className={`chip ${hidden === null ? 'on' : ''}`} onClick={() => setHidden(null)}>
            All
          </button>
          {calendars.map((c) => (
            <button key={c.label} type="button" className={`chip ${hidden === c.label ? 'on' : ''}`} aria-pressed={hidden === c.label} onClick={() => setHidden(hidden === c.label ? null : c.label)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {unavailable && (
        <p className="notice" role="status">
          Google calendar unavailable
        </p>
      )}

      {view === 'month' && <MonthGrid anchor={anchor} byDay={byDay} today={today} onPick={setViewing} onDay={openDay} />}
      {view === 'week' && <WeekGrid monday={mondayOf(anchor)} byDay={byDay} today={today} onPick={setViewing} onDay={openDay} />}
      {view === 'agenda' && <Agenda byDay={byDay} several={several} onPick={setViewing} />}

      {viewing && <EventSheet occ={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

interface GridProps {
  byDay: Map<string, Occurrence[]>
  today: string
  onPick: (o: Occurrence) => void
  onDay: (d: string) => void
}

function EventChip({ e, onPick }: { e: Occurrence; onPick: (o: Occurrence) => void }) {
  return (
    <button
      type="button"
      className={`evt ${e.allDay ? '' : 'timed'}`}
      style={{ '--c': e.external.colour } as CSSProperties}
      onClick={(ev) => {
        ev.stopPropagation()
        onPick(e)
      }}
      title={e.title}
    >
      {!e.allDay && <strong>{fmtTime(e.start)} </strong>}
      {e.title}
    </button>
  )
}

function MonthGrid({ anchor, byDay, today, onPick, onDay }: GridProps & { anchor: string }) {
  const first = anchor.slice(0, 8) + '01'
  const start = mondayOf(first)
  const month = anchor.slice(0, 7)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  return (
    <div className="month" role="grid">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div className="dow" key={d}>
          {d}
        </div>
      ))}
      {days.map((d) => (
        <div key={d} className={`day ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''}`} role="gridcell" onClick={() => onDay(d)}>
          <span className="num">{Number(d.slice(8))}</span>
          {(byDay.get(d) ?? []).map((e) => (
            <EventChip key={`${e.id}-${e.occurrenceDate}`} e={e} onPick={onPick} />
          ))}
        </div>
      ))}
    </div>
  )
}

function WeekGrid({ monday, byDay, today, onPick, onDay }: GridProps & { monday: string }) {
  return (
    <div className="weekgrid">
      {weekDays(monday).map((d) => (
        <div key={d} className={`col ${d === today ? 'today' : ''}`} onClick={() => onDay(d)}>
          <div className="small muted">{fmtWeekday(d)}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{Number(d.slice(8))}</div>
          {(byDay.get(d) ?? []).map((e) => (
            <EventChip key={`${e.id}-${e.occurrenceDate}`} e={e} onPick={onPick} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Agenda({ byDay, several, onPick }: Pick<GridProps, 'byDay' | 'onPick'> & { several: boolean }) {
  const days = [...byDay.keys()].sort()
  if (days.length === 0) return <p className="empty">Nothing in the next two months.</p>
  return (
    <div className="card">
      {days.map((d) => (
        <div className="daygroup" key={d}>
          <h3>{relativeDay(d)}</h3>
          {byDay.get(d)!.map((e) => (
            <div className="agenda-item" key={`${e.id}-${e.occurrenceDate}`} onClick={() => onPick(e)}>
              <span className="colourbar" style={{ background: e.external.colour }} />
              <span className="time">{e.allDay ? 'All day' : `${fmtTime(e.start)}–${fmtTime(e.end)}`}</span>
              <span className="grow">
                {e.title}
                {e.location && <span className="muted small"> · {e.location}</span>}
                {e.recurring && <span className="muted small"> ↻</span>}
                {several && <span className="sub">{e.external.label}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Events are changed in Google, so this has no edit or delete controls. */
function EventSheet({ occ, onClose }: { occ: Occurrence; onClose: () => void }) {
  const when = occ.allDay
    ? occ.start === occ.end
      ? `${fmtDay(occ.start)}, all day`
      : `${fmtDay(occ.start)} to ${fmtDay(occ.end)}`
    : `${fmtDay(dateOfInstant(occ.start))}, ${fmtTime(occ.start)}–${fmtTime(occ.end)}`
  return (
    <Modal title={occ.title} onClose={onClose}>
      <p>
        {when}
        {occ.location && <span className="sub">{occ.location}</span>}
      </p>
      <p className="muted small">From the {occ.external.label} Google calendar. Change it in Google Calendar.</p>
    </Modal>
  )
}
