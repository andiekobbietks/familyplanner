import { z } from 'zod'
import { getChores } from '../handlers/chores'
import { planBetween } from '../handlers/plan'
import { getTasks } from '../handlers/tasks'
import { addDays, dateOf, wallClock } from './dates'
import { badRequest, HttpError, notFound } from './errors'
import { readCalendars } from './googleCalendars'
import type { Ctx } from './http'
import { dateSchema, parse, ValidationError } from './schemas'
import type { Item, List, Member, Recipe, Task } from './types'
import { TIME_ZONE } from './weather'

/**
 * What the chat assistant can see (S33). Every tool reads and none writes. Results carry names
 * rather than member ids, and never an email address.
 */
export interface ToolCtx extends Ctx {
  names: Map<string, string>
}

const MAX_RANGE_DAYS = 92

const range = z.object({
  from: dateSchema.describe('First day, YYYY-MM-DD'),
  to: dateSchema.describe(`Last day, YYYY-MM-DD, at most ${MAX_RANGE_DAYS} days after from`),
})

function checkRange({ from, to }: z.infer<typeof range>) {
  if (to < from || to > addDays(from, MAX_RANGE_DAYS)) throw badRequest(`to must be on or after from, and at most ${MAX_RANGE_DAYS} days later`)
}

function localTime(instant: string) {
  const date = new Date(instant)
  const { hh, mm } = wallClock(date, TIME_ZONE)
  return `${dateOf(date, TIME_ZONE)} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** A to-do ticked on the wall is completed by `display:<id>`, not a person. */
const nameOf = (names: Map<string, string>, id?: string | null) => (id ? (names.get(id) ?? (id.startsWith('display:') ? 'the wall display' : 'Someone')) : undefined)

interface Tool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  input: S
  run: (args: z.infer<S>, ctx: ToolCtx) => Promise<unknown>
}

const tool = <S extends z.ZodTypeAny>(t: Tool<S>): Tool => t as unknown as Tool

const TOOLS: Tool[] = [
  tool({
    name: 'get_calendar',
    description: 'Events on the family calendar between two dates, in UK local time. All-day events give dates only, and their end date is the last day they cover.',
    input: range,
    run: async (args, ctx) => {
      checkRange(args)
      const { events, unavailable } = await readCalendars(args.from, args.to, ctx.now.getTime())
      return {
        unavailable,
        events: events.map((e) => ({
          title: e.title,
          allDay: e.allDay,
          start: e.allDay ? e.start : localTime(e.start),
          end: e.allDay ? e.end : localTime(e.end),
          location: e.location,
          calendar: e.external.label,
        })),
      }
    },
  }),
  tool({
    name: 'get_meal_plan',
    description: 'What was or is planned for breakfast, lunch and dinner between two dates. A day or slot that is missing has nothing planned.',
    input: range,
    run: async (args, { store, caller }) => {
      checkRange(args)
      const plan = await planBetween(store, caller.familyId, args.from, args.to)
      return plan.map(({ date, slot, text }) => ({ date, slot, text })).sort((a, b) => a.date.localeCompare(b.date))
    },
  }),
  tool({
    name: 'get_recipes',
    description: "All the family's recipes with their ingredients, but not their methods. Use this to find or compare recipes.",
    input: z.object({}),
    run: async (_args, { store, caller }) => {
      const recipes = await store.byType<Recipe>(caller.familyId, 'recipe')
      return recipes.map(({ id, title, summary, serves, time, tags, ingredients }) => ({ id, title, summary, serves, time, tags, ingredients }))
    },
  }),
  tool({
    name: 'get_recipe',
    description: 'One recipe in full, including its method and notes.',
    input: z.object({ id: z.string().min(1).max(64).describe('The id from get_recipes') }),
    run: async ({ id }, { store, caller }) => {
      const recipe = await store.get<Recipe>(caller.familyId, id, 'recipe')
      if (!recipe) throw notFound('No recipe has that id')
      const { title, summary, serves, time, source, tags, ingredients, method, notes } = recipe
      return { title, summary, serves, time, source, tags, ingredients, method, notes }
    },
  }),
  tool({
    name: 'get_tasks',
    description: "Everyone's open to-dos, overdue first, and those finished in the last 30 days.",
    input: z.object({}),
    run: async (_args, ctx) => {
      const read = async (view: string) => (await getTasks(ctx, {}, new URLSearchParams({ view }), undefined)).body as Task[]
      const [open, done] = await Promise.all([read('all'), read('done')])
      return {
        open: open.map((t) => ({ title: t.title, dueDate: t.dueDate, assignee: nameOf(ctx.names, t.assignee), notes: t.notes })),
        recentlyDone: done.map((t) => ({ title: t.title, completedAt: t.completedAt, completedBy: nameOf(ctx.names, t.completedBy) })),
      }
    },
  }),
  tool({
    name: 'get_chores',
    description: 'Who has which chore in the week containing a date. A chore with no assignee is for anyone.',
    input: z.object({ date: dateSchema.describe('Any day in the week, YYYY-MM-DD') }),
    run: async ({ date }, ctx) => {
      const { body } = await getChores(ctx, {}, new URLSearchParams({ week: date }), undefined)
      const { chores, assignments } = body as { chores: { id: string; name: string }[]; assignments: { choreId: string; memberId: string }[] }
      return chores.map((c) => ({ chore: c.name, assignee: nameOf(ctx.names, assignments.find((a) => a.choreId === c.id)?.memberId) }))
    },
  }),
  tool({
    name: 'get_shopping_lists',
    description: 'Each shopping list with the items still to buy.',
    input: z.object({}),
    run: async (_args, { store, caller }) => {
      const [lists, items] = await Promise.all([store.byType<List>(caller.familyId, 'list'), store.byType<Item>(caller.familyId, 'item')])
      return lists
        .filter((l) => !l.archived)
        .map((l) => ({ list: l.name, items: items.filter((i) => i.listId === l.id && !i.checked).map(({ name, note }) => ({ name, note })) }))
    },
  }),
]

/** Sent to the model in a fixed order, so the same question costs the same. */
export const toolDefinitions = TOOLS.map(({ name, description, input }) => ({
  name,
  description,
  input_schema: z.toJSONSchema(input) as { type: 'object' },
}))

export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<{ content: string; isError: boolean }> {
  const found = TOOLS.find((t) => t.name === name)
  if (!found) return { content: `There is no tool called ${name}`, isError: true }
  try {
    return { content: JSON.stringify(await found.run(parse(found.input, input), ctx)), isError: false }
  } catch (e) {
    // Only messages written for the caller go back. Anything unexpected might hold a feed address (S30).
    const expected = e instanceof ValidationError || e instanceof HttpError
    return { content: expected ? e.message : 'That could not be read just now', isError: true }
  }
}

/** Every member's name, including anyone removed, whose name stays on old tasks. */
export async function memberNames({ store, caller }: Ctx) {
  const members = await store.byType<Member>(caller.familyId, 'member')
  return new Map(members.map((m) => [m.id, m.displayName]))
}
