import { z } from 'zod'
import { isValidDate, isValidInstant } from './dates'
import { CATEGORIES, MEAL_TAGS } from './types'

/**
 * Every request body passes through one of these before use (S13). Zod's
 * default object mode strips unknown keys, so a smuggled `role` field never
 * reaches a handler (A12). Lengths are capped: titles 200, notes 2000.
 */
const title = z.string().trim().min(1, 'Required').max(200)
const short = z.string().trim().max(200)
const long = z.string().trim().max(2000)
const id = z.string().min(1).max(64)
const dateStr = z.string().refine(isValidDate, 'Expected YYYY-MM-DD')
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Only http and https links are allowed')

export const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(52).default(1),
  until: dateStr.optional(),
  exceptions: z.array(dateStr).max(500).default([]),
})

export const eventSchema = z
  .object({
    title,
    allDay: z.boolean().default(false),
    start: z.string(),
    end: z.string(),
    tz: z.string().max(64).default('Europe/London'),
    assignees: z.array(id).max(20).default([]),
    location: short.optional(),
    notes: long.optional(),
    recurrence: recurrenceSchema.nullable().optional(),
  })
  .superRefine((e, ctx) => {
    const ok = e.allDay ? isValidDate(e.start) && isValidDate(e.end) : isValidInstant(e.start) && isValidInstant(e.end)
    if (!ok) ctx.addIssue({ code: 'custom', message: e.allDay ? 'All-day events take dates' : 'Timed events take instants', path: ['start'] })
    else if ((e.allDay ? e.end < e.start : Date.parse(e.end) < Date.parse(e.start)))
      ctx.addIssue({ code: 'custom', message: 'End is before start', path: ['end'] })
  })

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

export const mealSchema = z.object({
  name: title,
  ingredients: z.array(z.object({ text: short.min(1), category: z.enum(CATEGORIES).optional() })).max(100).default([]),
  link: httpUrl.optional().or(z.literal('')),
  notes: long.optional(),
  tags: z.array(z.enum(MEAL_TAGS)).max(10).default([]),
})
export const mealPatchSchema = mealSchema.partial()

export const planCellSchema = z
  .object({
    mealId: id.optional(),
    text: short.optional(),
    cook: id.nullable().optional(),
    note: short.optional(),
  })
  .refine((c) => (c.mealId ? !c.text : !!c.text?.trim()), 'Exactly one of mealId or text is required')

export const slotSchema = z.enum(['breakfast', 'lunch', 'dinner'])
export const dateSchema = dateStr

export const copyWeekSchema = z.object({ week: dateStr })
export const shopSchema = z
  .object({ listId: id, mealIds: z.array(id).max(100).optional(), week: dateStr.optional() })
  .refine((s) => !!s.mealIds !== !!s.week, 'Provide mealIds or week')

export const settingsPatchSchema = z.object({
  breakfastEnabled: z.boolean().optional(),
  defaultListId: id.nullable().optional(),
})

export const mePatchSchema = z.object({
  displayName: title.optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['admin', 'member']),
})

export const eraseSchema = z.object({ confirm: z.literal('DELETE') })

export function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body ?? {})
  if (r.success) return r.data
  const issue = r.error.issues[0]
  const where = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
  throw new ValidationError(`${where}${issue?.message ?? 'Invalid request'}`)
}

export class ValidationError extends Error {}
