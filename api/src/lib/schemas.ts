import { z } from 'zod'
import { isValidDate } from './dates'
import { CATEGORIES } from './types'

/**
 * Every request body passes through one of these before use (S13). Zod's
 * default object mode strips unknown keys, so a smuggled `role` field never
 * reaches a handler (A12). Lengths are capped: titles 200, notes 2000, recipe text 10,000.
 */
const title = z.string().trim().min(1, 'Required').max(200)
const short = z.string().trim().max(200)
const long = z.string().trim().max(2000)
const recipeText = z.string().trim().max(10000)
const id = z.string().min(1).max(64)
const dateStr = z.string().refine(isValidDate, 'Expected YYYY-MM-DD')
export const listSchema = z.object({ name: title })

export const itemSchema = z.object({
  name: title,
  note: short.optional(),
  category: z.enum(CATEGORIES).optional(),
})
export const itemPatchSchema = itemSchema.partial().extend({ checked: z.boolean().optional() })

export const taskSchema = z.object({
  title,
  dueDate: dateStr.nullable().optional(),
  assignee: id.nullable().optional(),
  notes: long.optional(),
})
export const taskPatchSchema = taskSchema.partial().extend({ done: z.boolean().optional() })

export const planCellSchema = z.object({ text: title })

export const slotSchema = z.enum(['breakfast', 'lunch', 'dinner'])
export const dateSchema = dateStr

export const copyWeekSchema = z.object({ week: dateStr })

export const recipeSchema = z.object({
  title,
  summary: long.optional(),
  serves: short.optional(),
  time: short.optional(),
  source: short.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  ingredients: recipeText.optional(),
  method: recipeText.optional(),
  notes: recipeText.optional(),
})
export const recipePatchSchema = recipeSchema.partial()

/** Each recipe is checked on its own, so that one bad one can't hold back the rest. */
export const recipeIntakeSchema = z.object({ recipes: z.array(z.unknown()).max(100) })

export const choreSchema = z.object({ name: title })
export const choreAssignSchema = z.object({ memberId: id })

export const settingsPatchSchema = z.object({
  breakfastEnabled: z.boolean().optional(),
  defaultListId: id.nullable().optional(),
})

export const mePatchSchema = z.object({
  displayName: title.optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

/** An admin renaming a member. Only the name: role and colour are not changed this way. */
export const memberRenameSchema = z.object({ displayName: title })

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['admin', 'member', 'display']),
})

export const eraseSchema = z.object({ confirm: z.literal('DELETE') })

/** The recent conversation, from the browser. The model and its settings can't be sent (S33). */
export const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(8000) }))
    .min(1)
    .max(20)
    .refine((m) => m[0]?.role === 'user' && m.at(-1)?.role === 'user', 'Must start and end with a question'),
})

/** S34: a wall display's name, and the key it presents once when paired. */
export const displayDeviceSchema = z.object({ name: z.string().trim().min(1, 'Required').max(60) })
export const displayPairSchema = z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Not a display key') })

export function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body ?? {})
  if (r.success) return r.data
  const issue = r.error.issues[0]
  const where = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
  throw new ValidationError(`${where}${issue?.message ?? 'Invalid request'}`)
}

export class ValidationError extends Error {}
