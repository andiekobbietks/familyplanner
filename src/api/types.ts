/** Client-side view of the API shapes (section 9). Kept in step with api/src/lib/types.ts by hand. */
export type Role = 'admin' | 'member'
export type Slot = 'breakfast' | 'lunch' | 'dinner'
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']
export const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Household', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Person {
  id: string
  displayName: string
  colour: string
  role: Role
}
export interface Me extends Person {
  email: string
}
export interface MemberRecord extends Person {
  email: string
  active: boolean
  lastLoginAt?: string
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  until?: string
  exceptions: string[]
}
export interface EventInput {
  title: string
  allDay: boolean
  start: string
  end: string
  tz: string
  assignees: string[]
  location?: string
  notes?: string
  recurrence?: Recurrence | null
}
export interface ExternalCalendar {
  label: string
  colour: string
}
export interface Occurrence extends EventInput {
  id: string
  occurrenceDate: string
  recurring: boolean
  /** Set on read-only events from a connected Google calendar. */
  external?: ExternalCalendar
}
export interface ExternalEvents {
  calendars: ExternalCalendar[]
  events: Occurrence[]
  unavailable: boolean
}

export interface List {
  id: string
  name: string
  uncheckedCount: number
  recentNames: string[]
}
export interface Item {
  id: string
  listId: string
  name: string
  note?: string
  category?: Category
  checked: boolean
  createdBy: string
}

export interface Task {
  id: string
  title: string
  dueDate?: string | null
  assignee?: string | null
  notes?: string
  done: boolean
  completedAt?: string | null
  createdBy: string
}

export interface PlanEntry {
  id: string
  date: string
  slot: Slot
  text: string
}
export interface Settings {
  breakfastEnabled: boolean
  defaultListId?: string
}
