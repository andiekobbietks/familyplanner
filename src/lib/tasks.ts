import type { Task } from '../api/types'
import { addDays } from './dates'

/**
 * The to-dos the wall's Today card shows: overdue and due today first, then undated ones,
 * then those due in the coming week, soonest first. Done tasks and ones further out are left off.
 */
export function wallTodos(tasks: Task[], today: string): Task[] {
  const weekOut = addDays(today, 7)
  const rank = (t: Task) => (!t.dueDate ? 1 : t.dueDate <= today ? 0 : 2)
  return tasks
    .filter((t) => !t.done && (!t.dueDate || t.dueDate <= weekOut))
    .sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
}
