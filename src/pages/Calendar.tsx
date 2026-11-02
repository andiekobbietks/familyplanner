import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useCalendarEvents, usePeople } from '../api/hooks'
import type { EventInput, Occurrence, Recurrence } from '../api/types'
import { Icon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { Avatars, PersonChips, usePersonMap } from '../components/People'
import { useToast } from '../components/Toast'
import { addDays, dateOfInstant, fmtDay, fmtMonth, fmtTime, fmtWeekday, instantFrom, localTz, mondayOf, parseISODate, relativeDay, timeOfInstant, todayISO, weekDays } from '../lib/dates'

type View = 'month' | 'week' | 'agenda'
const calendarFilter = (label: string) => `calendar:${label}`
const isPhone = () => window.matchMedia('(max-width: 767px)').matches

export function Calendar() {
  const today = todayISO()
  const [view, setView] = useState<View>(() => (isPhone() ? 'agenda' : 'month'))
  const [anchor, setAnchor] = useState(today)
  const [filter, setFilter] = useState<string[]>([])
  const [editing, setEditing] = useState<{ occ?: Occurrence; date?: string } | null>(null)
  const [viewing, setViewing] = useState<Occurrence | null>(null)
  const people = usePersonMap()

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
  const visible = useMemo(
    () => (filter.length ? events.filter((e) => (e.external ? filter.includes(calendarFilter(e.external.label)) : e.assignees.some((a) => filter.includes(a)))) : events),
    [events, filter],
  )

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const e of visible) {
      const first = e.allDay ? e.start : dateOfInstant(e.start)
      const last = e.allDay ? e.end : dateOfInstant(e.end)
      for (let d = first; d <= last; d = addDays(d, 1)) {
        if (!m.has(d)) m.set(d, [])
        m.get(d)!.push(e)
      }
    }
    return m
  }, [visible])

  const colourOf = (e: Occurrence) => e.external?.colour ?? people.get(e.assignees[0])?.colour ?? 'var(--accent)'
  const pick = (occ: Occurrence) => (occ.external ? setViewing(occ) : setEditing({ occ }))

  const step = (n: number) => {
    if (view === 'month') {
      const d = parseISODate(anchor.slice(0, 8) + '01')
      d.setMonth(d.getMonth() + n)
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    } else if (view === 'week') setAnchor(addDays(mondayOf(anchor), 7 * n))
    else setAnchor(addDays(anchor, 30 * n))
  }

  /** Month cells are too small to tap an event on a phone, so a day opens its list there. */
  const openDay = (d: string) => {
    if (isPhone()) {
      setAnchor(d)
      setView('agenda')
    } else setEditing({ date: d })
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
        <button className="btn primary sm" type="button" onClick={() => setEditing({ date: anchor })}>
          New event
        </button>
      </div>
      <div className="filter-row">
        <button type="button" className={`chip ${filter.length === 0 ? 'on' : ''}`} onClick={() => setFilter([])}>
          Everyone
        </button>
        <PersonChips value={filter} onChange={setFilter} />
        {calendars.map((c) => {
          const id = calendarFilter(c.label)
          const on = filter.includes(id)
          return (
            <button key={c.label} type="button" className={`chip ${on ? 'on' : ''}`} style={on ? { background: c.colour, color: '#fff' } : undefined} aria-pressed={on} onClick={() => setFilter(on ? filter.filter((x) => x !== id) : [...filter, id])}>
              {c.label}
            </button>
          )
        })}
      </div>
      {unavailable && (
        <p className="notice" role="status">
          Google calendar unavailable
        </p>
      )}

      {view === 'month' && <MonthGrid anchor={anchor} byDay={byDay} today={today} colourOf={colourOf} onPick={pick} onDay={openDay} />}
      {view === 'week' && <WeekGrid monday={mondayOf(anchor)} byDay={byDay} today={today} colourOf={colourOf} onPick={pick} onDay={(d) => setEditing({ date: d })} />}
      {view === 'agenda' && <Agenda byDay={byDay} colourOf={colourOf} onPick={pick} />}

      {editing && <EventEditor occ={editing.occ} date={editing.date} onClose={() => setEditing(null)} />}
      {viewing && <ExternalEventSheet occ={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

interface GridProps {
  byDay: Map<string, Occurrence[]>
  today: string
  colourOf: (e: Occurrence) => string
  onPick: (o: Occurrence) => void
  onDay: (d: string) => void
}

function EventChip({ e, colour, onPick }: { e: Occurrence; colour: string; onPick: (o: Occurrence) => void }) {
  return (
    <button
      type="button"
      className={`evt ${e.allDay ? '' : 'timed'} ${e.external ? 'external' : ''}`}
      style={{ '--c': colour } as CSSProperties}
      onClick={(ev) => {
        ev.stopPropagation()
        onPick(e)
      }}
      title={e.external ? `${e.title} (${e.external.label})` : e.title}
    >
      {!e.allDay && <strong>{fmtTime(e.start)} </strong>}
      {e.title}
    </button>
  )
}

function MonthGrid({ anchor, byDay, today, colourOf, onPick, onDay }: GridProps & { anchor: string }) {
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
            <EventChip key={`${e.id}-${e.occurrenceDate}`} e={e} colour={colourOf(e)} onPick={onPick} />
          ))}
        </div>
      ))}
    </div>
  )
}

function WeekGrid({ monday, byDay, today, colourOf, onPick, onDay }: GridProps & { monday: string }) {
  return (
    <div className="weekgrid">
      {weekDays(monday).map((d) => (
        <div key={d} className={`col ${d === today ? 'today' : ''}`} onClick={() => onDay(d)}>
          <div className="small muted">{fmtWeekday(d)}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{Number(d.slice(8))}</div>
          {(byDay.get(d) ?? []).map((e) => (
            <EventChip key={`${e.id}-${e.occurrenceDate}`} e={e} colour={colourOf(e)} onPick={onPick} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Agenda({ byDay, colourOf, onPick }: Pick<GridProps, 'byDay' | 'colourOf' | 'onPick'>) {
  const days = [...byDay.keys()].sort()
  if (days.length === 0) return <p className="empty">Nothing in the next two months.</p>
  return (
    <div className="card">
      {days.map((d) => (
        <div className="daygroup" key={d}>
          <h3>{relativeDay(d)}</h3>
          {byDay.get(d)!.map((e) => (
            <div className="agenda-item" key={`${e.id}-${e.occurrenceDate}`} onClick={() => onPick(e)}>
              <span className="colourbar" style={{ background: colourOf(e) }} />
              <span className="time">{e.allDay ? 'All day' : `${fmtTime(e.start)}–${fmtTime(e.end)}`}</span>
              <span className="grow">
                {e.title}
                {e.location && <span className="muted small"> · {e.location}</span>}
                {e.recurring && <span className="muted small"> ↻</span>}
                {e.external && <span className="sub">{e.external.label}</span>}
              </span>
              <Avatars ids={e.assignees} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Google events can only be changed in Google, so this has no edit or delete controls (section 5.3.1). */
function ExternalEventSheet({ occ, onClose }: { occ: Occurrence; onClose: () => void }) {
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
      <p className="muted small">From the {occ.external!.label} Google calendar. Change it in Google Calendar.</p>
    </Modal>
  )
}

/** Create or edit. For a recurring occurrence, saving and deleting ask for the scope (section 5.3). */
function EventEditor({ occ, date, onClose }: { occ?: Occurrence; date?: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: people = [] } = usePeople()
  const startDate = occ ? (occ.allDay ? occ.start : dateOfInstant(occ.start)) : (date ?? todayISO())
  const endDate = occ ? (occ.allDay ? occ.end : dateOfInstant(occ.end)) : startDate
  const [title, setTitle] = useState(occ?.title ?? '')
  const [allDay, setAllDay] = useState(occ?.allDay ?? true)
  const [sDate, setSDate] = useState(startDate)
  const [eDate, setEDate] = useState(endDate)
  const [sTime, setSTime] = useState(occ && !occ.allDay ? timeOfInstant(occ.start) : '09:00')
  const [eTime, setETime] = useState(occ && !occ.allDay ? timeOfInstant(occ.end) : '10:00')
  const [assignees, setAssignees] = useState<string[]>(occ?.assignees ?? [])
  const [location, setLocation] = useState(occ?.location ?? '')
  const [notes, setNotes] = useState(occ?.notes ?? '')
  const [freq, setFreq] = useState<'none' | Recurrence['freq']>(occ?.recurrence?.freq ?? 'none')
  const [interval, setInterval_] = useState(occ?.recurrence?.interval ?? 1)
  const [until, setUntil] = useState(occ?.recurrence?.until ?? '')
  const [scopeAsk, setScopeAsk] = useState<'save' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (eDate < sDate) setEDate(sDate)
  }, [sDate, eDate])

  const build = (): EventInput => ({
    title: title.trim(),
    allDay,
    start: allDay ? sDate : instantFrom(sDate, sTime),
    end: allDay ? eDate : instantFrom(eDate, eTime),
    tz: localTz(),
    assignees,
    location: location.trim() || undefined,
    notes: notes.trim() || undefined,
    recurrence: freq === 'none' ? null : { freq, interval: Math.max(1, interval), until: until || undefined, exceptions: occ?.recurrence?.exceptions ?? [] },
  })

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['events'] })
    onClose()
  }

  const save = async (scope?: 'this' | 'future') => {
    setBusy(true)
    try {
      if (!occ) await mutations.createEvent(build())
      else await mutations.updateEvent(occ.id, build(), scope, occ.occurrenceDate)
      done()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (scope?: 'this' | 'all') => {
    setBusy(true)
    try {
      await mutations.deleteEvent(occ!.id, scope === 'this' ? occ!.occurrenceDate : undefined)
      done()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onSave = () => (occ?.recurring ? setScopeAsk('save') : void save())
  const onDelete = () => (occ?.recurring ? setScopeAsk('delete') : confirm('Delete this event?') && void remove())

  if (scopeAsk) {
    return (
      <Modal title={scopeAsk === 'save' ? 'Change which occurrences?' : 'Delete which occurrences?'} onClose={() => setScopeAsk(null)}>
        <div className="stack">
          <button className="btn" type="button" disabled={busy} onClick={() => (scopeAsk === 'save' ? save('this') : remove('this'))} style={{ width: '100%' }}>
            Only {fmtDay(occ!.occurrenceDate)}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => (scopeAsk === 'save' ? save('future') : remove('all'))} style={{ width: '100%' }}>
            {scopeAsk === 'save' ? 'This and all future occurrences' : 'The whole series'}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={occ ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          {occ && (
            <button className="btn danger" type="button" onClick={onDelete} disabled={busy}>
              Delete
            </button>
          )}
          <button className="btn primary" type="button" onClick={onSave} disabled={busy || !title.trim()}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} data-autofocus={occ ? undefined : true} />
      </label>
      <label className="check">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Starts</span>
          <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} required />
        </label>
        {!allDay ? (
          <label className="field">
            <span>Time</span>
            <input type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} required />
          </label>
        ) : (
          <span />
        )}
        <label className="field">
          <span>Ends</span>
          <input type="date" value={eDate} min={sDate} onChange={(e) => setEDate(e.target.value)} required />
        </label>
        {!allDay && (
          <label className="field">
            <span>Time</span>
            <input type="time" value={eTime} onChange={(e) => setETime(e.target.value)} required />
          </label>
        )}
      </div>
      <span className="field-label">Who</span>
      <PersonChips value={assignees} onChange={setAssignees} />
      {people.length === 0 && <p className="muted small">No members yet.</p>}
      <div className="form-grid" style={{ marginTop: '0.75rem' }}>
        <label className="field">
          <span>Repeats</span>
          <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
            <option value="none">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly on this date</option>
          </select>
        </label>
        {freq === 'weekly' && (
          <label className="field">
            <span>Every N weeks</span>
            <input type="number" min={1} max={52} value={interval} onChange={(e) => setInterval_(Number(e.target.value) || 1)} />
          </label>
        )}
        {freq !== 'none' && (
          <label className="field">
            <span>Until (optional)</span>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
        )}
      </div>
      <label className="field">
        <span>Location</span>
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
      </label>
    </Modal>
  )
}
