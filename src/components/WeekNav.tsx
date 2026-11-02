import { addDays, fmtDay, mondayOf, todayISO } from '../lib/dates'
import { Icon } from './Icons'

/** The heading of a page that shows one week at a time. */
export function WeekNav({ week, onChange }: { week: string; onChange: (monday: string) => void }) {
  const thisWeek = mondayOf(todayISO())
  return (
    <div className="page-head">
      <div className="grow">
        <h1>{week === thisWeek ? 'This week' : week === addDays(thisWeek, 7) ? 'Next week' : `Week of ${fmtDay(week)}`}</h1>
        <p className="muted small">
          {fmtDay(week)} to {fmtDay(addDays(week, 6))}
        </p>
      </div>
      <button className="icon-btn boxed" type="button" onClick={() => onChange(addDays(week, -7))} aria-label="Previous week">
        <Icon name="left" />
      </button>
      <button className="btn sm" type="button" onClick={() => onChange(thisWeek)}>
        Today
      </button>
      <button className="icon-btn boxed" type="button" onClick={() => onChange(addDays(week, 7))} aria-label="Next week">
        <Icon name="right" />
      </button>
    </div>
  )
}
