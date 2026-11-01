export type Role = 'admin' | 'member'
export type DocType = 'member' | 'event' | 'list' | 'item' | 'task' | 'meal' | 'plan' | 'settings'
export type Slot = 'breakfast' | 'lunch' | 'dinner'
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']
export const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Household', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]
export const MEAL_TAGS = ['Lunch', 'Dinner', 'Quick', 'Veggie', 'Freezer', "Kids' favourite", 'Packed lunch'] as const
export type MealTag = (typeof MEAL_TAGS)[number]

export interface BaseDoc {
  id: string
  familyId: string
  type: DocType
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface Member extends BaseDoc {
  type: 'member'
  displayName: string
  email: string
  role: Role
  colour: string
  lastLoginAt?: string
  active: boolean
  providerUserId?: string
}

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  until?: string
  exceptions: string[]
}

export interface Event extends BaseDoc {
  type: 'event'
  title: string
  allDay: boolean
  start: string // "YYYY-MM-DD" if allDay, else UTC instant
  end: string
  tz: string
  assignees: string[]
  location?: string
  notes?: string
  recurrence?: Recurrence | null
}

export interface List extends BaseDoc {
  type: 'list'
  name: string
  sortOrder: number
  archived: boolean
  recentNames: string[]
}

export interface Item extends BaseDoc {
  type: 'item'
  listId: string
  name: string
  note?: string
  category?: Category
  checked: boolean
  checkedAt?: string
  checkedBy?: string
}

export interface Task extends BaseDoc {
  type: 'task'
  title: string
  dueDate?: string | null
  assignee?: string | null
  notes?: string
  done: boolean
  completedAt?: string | null
  completedBy?: string | null
}

export interface Ingredient {
  text: string
  category?: Category
}

export interface Meal extends BaseDoc {
  type: 'meal'
  name: string
  ingredients: Ingredient[]
  link?: string
  notes?: string
  tags: MealTag[]
  lastPlannedAt?: string
  archived: boolean
}

export interface PlanEntry extends BaseDoc {
  type: 'plan'
  date: string
  slot: Slot
  mealId?: string
  text?: string
  cook?: string
  note?: string
}

export interface Settings extends BaseDoc {
  type: 'settings'
  id: 'settings'
  breakfastEnabled: boolean
  defaultListId?: string
}

export type AnyDoc = Member | Event | List | Item | Task | Meal | PlanEntry | Settings

export interface Caller {
  memberId: string
  role: Role
  familyId: string
  displayName: string
}
