/** Client-side view of the API shapes (section 9). Kept in step with api/src/lib/types.ts by hand. */
/** `display` is the wall screen, which only sees /display. */
export type Role = 'admin' | 'member' | 'display'
export type Slot = 'breakfast' | 'lunch' | 'dinner'
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']
export const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Household', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Person {
  id: string
  displayName: string
  colour: string
  role: Role
}
export interface Me extends Person {
  email: string
}
/** A paired wall display (S34). Keys are never sent back after creation. */
export interface DisplayDevice {
  id: string
  name: string
  active: boolean
  createdAt: string
  createdBy: string
  lastSeenAt: string | null
}

export interface MemberRecord extends Person {
  email: string
  active: boolean
  lastLoginAt?: string
}

export interface ExternalCalendar {
  label: string
  colour: string
}
/** An event from a connected Google calendar. Google is the only source of events, so these are read-only. */
export interface Occurrence {
  id: string
  title: string
  allDay: boolean
  /** A date if allDay, else a UTC instant. */
  start: string
  end: string
  location?: string
  occurrenceDate: string
  recurring: boolean
  external: ExternalCalendar
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
/** The wall's shopping panel: the default list's unchecked items. */
export interface Shopping {
  id: string
  name: string
  items: { id: string; name: string; note?: string; category?: Category }[]
}
/** The wall's Lists page: an open list and its unchecked items. */
export interface WallList {
  id: string
  name: string
  isDefault: boolean
  items: Shopping['items']
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
/** Ingredients, method and notes are plain text, one entry per line. A line ending in a colon is a subheading. */
export interface RecipeInput {
  title: string
  summary?: string
  serves?: string
  time?: string
  source?: string
  tags: string[]
  ingredients: string
  method: string
  notes: string
}
export interface Recipe extends RecipeInput {
  id: string
}

/** A family note: neighbours, appliances, where a manual is. The body is plain text. */
export interface NoteInput {
  title: string
  category?: string
  body: string
}
export interface Note extends NoteInput {
  id: string
  updatedAt: string
}

/** A stored document: photos with a title and description to find them by. Pages are fetched one at a time. */
export interface FamilyDocument {
  id: string
  title: string
  description: string
  pageIds: string[]
  thumb?: string
  createdAt: string
  createdBy: string
}
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'
export interface DocPageImage {
  contentType: ImageType
  data: string
}

export interface Chore {
  id: string
  name: string
}
export interface ChoreAssignment {
  choreId: string
  memberId: string
}
export interface ChoreSchedule {
  chores: Chore[]
  assignments: ChoreAssignment[]
}

export interface WeatherDay {
  date: string
  code: number
  high: number
  low: number
  rainChance: number | null
}
/** Forecast is null when the service can't be reached. */
export interface Weather {
  place: string
  forecast: { current: { temperature: number; code: number; isDay: boolean }; days: WeatherDay[] } | null
}

export interface Settings {
  breakfastEnabled: boolean
  defaultListId?: string
}
