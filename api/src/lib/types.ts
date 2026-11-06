/** `display` is the wall screen: it may only read what the dashboard shows (section 4). */
export type Role = 'admin' | 'member' | 'display'
export type DocType = 'member' | 'event' | 'list' | 'item' | 'task' | 'meal' | 'plan' | 'settings' | 'recipe' | 'chore' | 'choreWeek' | 'displayDevice'
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

/** Ingredients, method and notes are plain text, one entry per line. A line ending in a colon is a subheading. */
export interface Recipe extends BaseDoc {
  type: 'recipe'
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

export interface Chore extends BaseDoc {
  type: 'chore'
  name: string
}

/** Who has a chore in one week. At most one per chore per week, because the id is built from both. */
export interface ChoreWeek extends BaseDoc {
  type: 'choreWeek'
  /** The Monday. */
  week: string
  choreId: string
  memberId: string
}

export interface Settings extends BaseDoc {
  type: 'settings'
  id: 'settings'
  breakfastEnabled: boolean
  defaultListId?: string
}

/**
 * A paired wall display (S34). Only the SHA-256 of its key is stored; the key itself
 * lives in the display's cookie. Revoking clears the hash, so the record stays for the audit trail.
 */
export interface DisplayDevice extends BaseDoc {
  type: 'displayDevice'
  name: string
  keyHash: string
  active: boolean
  lastSeenAt?: string
}

export type AnyDoc = Member | List | Item | Task | Meal | PlanEntry | Recipe | Chore | ChoreWeek | Settings | DisplayDevice

export interface Caller {
  memberId: string
  role: Role
  familyId: string
  displayName: string
}
