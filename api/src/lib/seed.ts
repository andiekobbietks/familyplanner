import { PALETTE } from './caller'
import { addDays, mondayOf } from './dates'
import type { BaseDoc, Event, Item, List, Member, PlanEntry, Settings, Task } from './types'

/**
 * Sample household for local development. Only used when the memory store
 * starts with no data file. Emails match the dev identities in vite.config.ts.
 */
export function seed(familyId: string): BaseDoc[] {
  const now = new Date().toISOString()
  const today = new Date().toISOString().slice(0, 10)
  const monday = mondayOf(today)
  const base = <T extends BaseDoc['type']>(id: string, type: T) => ({
    id,
    familyId,
    type,
    createdAt: now,
    createdBy: 'seed',
    updatedAt: now,
    updatedBy: 'seed',
  })

  const members: Member[] = [
    { ...base('m-tim', 'member'), displayName: 'Tim', email: 'tim@example.com', role: 'admin', colour: PALETTE[0], active: true },
    { ...base('m-jo', 'member'), displayName: 'Jo', email: 'jo@example.com', role: 'admin', colour: PALETTE[1], active: true },
    { ...base('m-charlie', 'member'), displayName: 'Charlie', email: 'charlie@example.com', role: 'member', colour: PALETTE[2], active: true },
    { ...base('m-robin', 'member'), displayName: 'Robin', email: 'robin@example.com', role: 'member', colour: PALETTE[3], active: true },
  ]

  const lists: List[] = [
    { ...base('l-groceries', 'list'), name: 'Groceries', sortOrder: 0, archived: false, recentNames: ['Milk', 'Bread', 'Eggs', 'Bananas', 'Butter', 'Cheddar'] },
    { ...base('l-hardware', 'list'), name: 'Hardware', sortOrder: 1, archived: false, recentNames: ['Light bulbs', 'Wood screws'] },
  ]

  const items: Item[] = [
    { ...base('i-1', 'item'), listId: 'l-groceries', name: 'Milk', note: '2 pints', category: 'Dairy', checked: false },
    { ...base('i-2', 'item'), listId: 'l-groceries', name: 'Bread', category: 'Bakery', checked: false },
    { ...base('i-3', 'item'), listId: 'l-groceries', name: 'Bananas', category: 'Produce', checked: false },
    { ...base('i-4', 'item'), listId: 'l-groceries', name: 'Washing-up liquid', category: 'Household', checked: false },
    { ...base('i-5', 'item'), listId: 'l-groceries', name: 'Birthday candles', checked: false },
    { ...base('i-6', 'item'), listId: 'l-groceries', name: 'Eggs', category: 'Dairy', checked: true, checkedAt: now, checkedBy: 'm-jo' },
    { ...base('i-7', 'item'), listId: 'l-hardware', name: 'Light bulbs', note: 'E27 warm white', checked: false },
  ]

  const tasks: Task[] = [
    { ...base('t-1', 'task'), title: 'Renew car insurance', dueDate: addDays(today, -2), assignee: 'm-tim', done: false },
    { ...base('t-2', 'task'), title: 'Book dentist for the kids', dueDate: today, assignee: 'm-tim', done: false },
    { ...base('t-3', 'task'), title: 'Return library books', dueDate: addDays(today, 3), assignee: 'm-charlie', done: false },
    { ...base('t-4', 'task'), title: 'Fix the garden gate', assignee: 'm-jo', done: false },
    { ...base('t-5', 'task'), title: 'Order school shoes', dueDate: addDays(today, -5), assignee: 'm-jo', done: true, completedAt: addDays(today, -1) + 'T18:00:00.000Z', completedBy: 'm-jo' },
  ]

  const at = (date: string, hh: number, mm = 0) => {
    const d = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
    return d.toISOString()
  }
  const events: Event[] = [
    { ...base('e-1', 'event'), title: 'Swimming', allDay: false, start: at(monday, 17, 0), end: at(monday, 18, 0), tz: 'Europe/London', assignees: ['m-charlie'], location: 'Leisure centre', recurrence: { freq: 'weekly', interval: 1, exceptions: [] } },
    { ...base('e-2', 'event'), title: 'Bins out', allDay: true, start: addDays(monday, 2), end: addDays(monday, 2), tz: 'Europe/London', assignees: ['m-tim'], recurrence: { freq: 'weekly', interval: 2, exceptions: [] } },
    { ...base('e-3', 'event'), title: 'Parents evening', allDay: false, start: at(addDays(today, 1), 16, 30), end: at(addDays(today, 1), 17, 30), tz: 'Europe/London', assignees: ['m-tim', 'm-jo'], location: 'School hall', notes: 'Bring the reading record' },
    { ...base('e-4', 'event'), title: "Grandma's birthday", allDay: true, start: addDays(today, 4), end: addDays(today, 4), tz: 'Europe/London', assignees: ['m-tim', 'm-jo', 'm-charlie', 'm-robin'] },
    { ...base('e-5', 'event'), title: 'Piano lesson', allDay: false, start: at(addDays(monday, 3), 16, 0), end: at(addDays(monday, 3), 16, 30), tz: 'Europe/London', assignees: ['m-robin'], recurrence: { freq: 'weekly', interval: 1, exceptions: [] } },
    { ...base('e-6', 'event'), title: 'Half term', allDay: true, start: addDays(monday, 14), end: addDays(monday, 18), tz: 'Europe/London', assignees: ['m-charlie', 'm-robin'] },
  ]

  const plan: PlanEntry[] = [
    { ...base(`plan:${monday}:dinner`, 'plan'), date: monday, slot: 'dinner', text: 'Fish finger sandwiches' },
    { ...base(`plan:${addDays(monday, 1)}:lunch`, 'plan'), date: addDays(monday, 1), slot: 'lunch', text: 'Cheese sandwiches' },
    { ...base(`plan:${addDays(monday, 1)}:dinner`, 'plan'), date: addDays(monday, 1), slot: 'dinner', text: 'Veggie chilli' },
    { ...base(`plan:${addDays(monday, 2)}:dinner`, 'plan'), date: addDays(monday, 2), slot: 'dinner', text: 'Spaghetti bolognese' },
    { ...base(`plan:${addDays(monday, 3)}:lunch`, 'plan'), date: addDays(monday, 3), slot: 'lunch', text: 'Soup and bread' },
    { ...base(`plan:${addDays(monday, 4)}:dinner`, 'plan'), date: addDays(monday, 4), slot: 'dinner', text: 'Takeaway' },
    { ...base(`plan:${addDays(monday, 6)}:dinner`, 'plan'), date: addDays(monday, 6), slot: 'dinner', text: 'Roast chicken' },
  ]

  const settings: Settings = { ...base('settings', 'settings'), id: 'settings', breakfastEnabled: false, defaultListId: 'l-groceries' }

  return [...members, ...lists, ...items, ...tasks, ...events, ...plan, settings]
}
