import { PALETTE } from './caller'
import { addDays, mondayOf } from './dates'
import type { BaseDoc, Chore, ChoreWeek, Item, List, Member, Note, PlanEntry, Recipe, Settings, Task } from './types'

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
    { ...base('m-kitchen', 'member'), displayName: 'Kitchen display', email: 'display@example.com', role: 'display', colour: PALETTE[6], active: true },
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

  const plan: PlanEntry[] = [
    { ...base(`plan:${monday}:dinner`, 'plan'), date: monday, slot: 'dinner', text: 'Fish finger sandwiches' },
    { ...base(`plan:${addDays(monday, 1)}:lunch`, 'plan'), date: addDays(monday, 1), slot: 'lunch', text: 'Cheese sandwiches' },
    { ...base(`plan:${addDays(monday, 1)}:dinner`, 'plan'), date: addDays(monday, 1), slot: 'dinner', text: 'Veggie chilli' },
    { ...base(`plan:${addDays(monday, 2)}:dinner`, 'plan'), date: addDays(monday, 2), slot: 'dinner', text: 'Spaghetti bolognese' },
    { ...base(`plan:${addDays(monday, 3)}:lunch`, 'plan'), date: addDays(monday, 3), slot: 'lunch', text: 'Soup and bread' },
    { ...base(`plan:${addDays(monday, 4)}:dinner`, 'plan'), date: addDays(monday, 4), slot: 'dinner', text: 'Takeaway' },
    { ...base(`plan:${addDays(monday, 6)}:dinner`, 'plan'), date: addDays(monday, 6), slot: 'dinner', text: 'Roast chicken' },
  ]

  const recipes: Recipe[] = [
    {
      ...base('r-chicken', 'recipe'),
      title: 'Roast chicken',
      summary: 'A plain Sunday roast.',
      serves: '4',
      time: 'Prep 10 min, Cook 1 hr 30 min',
      tags: ['chicken', 'roast', 'sunday'],
      ingredients: '1 chicken, about 1.6 kg\n1 lemon\n1 tbsp olive oil\nSalt and pepper',
      method: 'Heat the oven to 200°C.\nPut the lemon inside the chicken, rub with oil and season.\nRoast for 1 hour 20 minutes, then rest for 15 minutes.',
      notes: 'Save the carcass for stock.',
    },
  ]

  const chores: Chore[] = [
    { ...base('c-bins', 'chore'), name: 'Bins' },
    { ...base('c-bathroom', 'chore'), name: 'Clean the bathroom' },
    { ...base('c-hoover', 'chore'), name: 'Hoover' },
  ]

  const choreWeeks: ChoreWeek[] = [
    { ...base(`chorewk:${monday}:c-bins`, 'choreWeek'), week: monday, choreId: 'c-bins', memberId: 'm-tim' },
    { ...base(`chorewk:${monday}:c-bathroom`, 'choreWeek'), week: monday, choreId: 'c-bathroom', memberId: 'm-jo' },
  ]

  const notes: Note[] = [
    { ...base('n-neighbours', 'note'), title: 'Next door', category: 'Neighbours', body: 'No. 12: Sam and Alex, cat called Biscuit\nNo. 16: Mrs Patel, has a spare key' },
    { ...base('n-boiler', 'note'), title: 'Boiler', category: 'Appliances', body: 'Acme Combi 30, fitted 2021\nService due every October\nManual: https://example.com/boiler-manual' },
  ]

  const settings: Settings = { ...base('settings', 'settings'), id: 'settings', breakfastEnabled: false, defaultListId: 'l-groceries' }

  return [...members, ...lists, ...items, ...tasks, ...plan, ...recipes, ...chores, ...choreWeeks, ...notes, settings]
}
