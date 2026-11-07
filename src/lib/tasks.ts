import type { Task } from '../api/types'
import { addDays } from './dates'

/**
 * Every open to-do, for the wall's Lists page: overdue and due today first, then undated ones,
 * then those due later, soonest first. Done tasks are left off.
 */
export function openTodos(tasks: Task[], today: string): Task[] {
  const rank = (t: Task) => (!t.dueDate ? 1 : t.dueDate <= today ? 0 : 2)
  return tasks.filter((t) => !t.done).sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
}

/** The to-dos the wall's Today card shows: as `openTodos`, but only those due within the coming week, or undated. */
export function wallTodos(tasks: Task[], today: string): Task[] {
  const weekOut = addDays(today, 7)
  return openTodos(tasks, today).filter((t) => !t.dueDate || t.dueDate <= weekOut)
}
