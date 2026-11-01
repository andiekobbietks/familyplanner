/** Client-side view of the API shapes (section 9). Kept in step with api/src/lib/types.ts by hand. */
export type Role = 'admin' | 'member'
export type Slot = 'breakfast' | 'lunch' | 'dinner'
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']
export const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Household', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]
export const MEAL_TAGS = ['Lunch', 'Dinner', 'Quick', 'Veggie', 'Freezer', "Kids' favourite", 'Packed lunch'] as const
export type MealTag = (typeof MEAL_TAGS)[number]

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
export interface Occurrence extends EventInput {
  id: string
  occurrenceDate: string
  recurring: boolean
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

export interface Ingredient {
  text: string
  category?: Category
}
export interface Meal {
  id: string
  name: string
  ingredients: Ingredient[]
  link?: string
  notes?: string
  tags: MealTag[]
  lastPlannedAt?: string
}
export interface PlanEntry {
  id: string
  date: string
  slot: Slot
  mealId?: string
  mealName?: string
  text?: string
  cook?: string
  note?: string
}
export interface Settings {
  breakfastEnabled: boolean
  defaultListId?: string
}
