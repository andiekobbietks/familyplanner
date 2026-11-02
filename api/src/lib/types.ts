export type Role = 'admin' | 'member'
export type DocType = 'member' | 'event' | 'list' | 'item' | 'task' | 'meal' | 'plan' | 'settings'
export type Slot = 'breakfast' | 'lunch' | 'dinner'
export const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner']
export const CATEGORIES = ['Produce', 'Dairy', 'Bakery', 'Household', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

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

/** Left over from the removed meal library. Read only, so older plan cells keep their names. */
export interface Meal extends BaseDoc {
  type: 'meal'
  name: string
}

export interface PlanEntry extends BaseDoc {
  type: 'plan'
  date: string
  slot: Slot
  text?: string
  /** Older cells only. New cells always hold text. */
  mealId?: string
}

export interface Settings extends BaseDoc {
  type: 'settings'
  id: 'settings'
  breakfastEnabled: boolean
  defaultListId?: string
}

export type AnyDoc = Member | List | Item | Task | Meal | PlanEntry | Settings

export interface Caller {
  memberId: string
  role: Role
  familyId: string
  displayName: string
}
