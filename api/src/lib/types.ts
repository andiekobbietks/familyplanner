/** `display` is the wall screen: it may only read what the dashboard shows (section 4). */
export type Role = 'admin' | 'member' | 'display'
export type DocType = 'member' | 'event' | 'list' | 'item' | 'task' | 'meal' | 'plan' | 'settings' | 'recipe' | 'chore' | 'choreWeek' | 'displayDevice' | 'note' | 'document' | 'docPage'
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

/**
 * A family note: something the household wants to hand, such as the neighbours' names or where an appliance's
 * manual is. The body is plain text. The category groups notes ("Neighbours", "Appliances") and is free text.
 */
export interface Note extends BaseDoc {
  type: 'note'
  title: string
  category?: string
  body: string
}

/**
 * A stored document: photos of a letter, a warranty, a manual. The title and description are what the
 * family and the chat assistant search, because the photos themselves aren't read. Each page is its own
 * `docPage` record, listed here in order, so the list of documents never carries the photos.
 */
export interface FamilyDocument extends BaseDoc {
  type: 'document'
  title: string
  description: string
  pageIds: string[]
  /** A small JPEG of the first page, base64, for the list. */
  thumb?: string
}

/** One page of a document: an image, base64, read only through its document. */
export interface DocPage extends BaseDoc {
  type: 'docPage'
  documentId: string
  contentType: ImageType
  data: string
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageType = (typeof IMAGE_TYPES)[number]

export type AnyDoc = Member | List | Item | Task | Meal | PlanEntry | Recipe | Chore | ChoreWeek | Settings | DisplayDevice | Note | FamilyDocument | DocPage

export interface Caller {
  memberId: string
  role: Role
  familyId: string
  displayName: string
}
