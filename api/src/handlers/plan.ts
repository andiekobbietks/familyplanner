import { addDays, isValidDate } from '../lib/dates'
import { badRequest } from '../lib/errors'
import type { Handler } from '../lib/http'
import { copyWeekSchema, dateSchema, parse, planCellSchema, slotSchema } from '../lib/schemas'
import type { Meal, PlanEntry } from '../lib/types'
import type { Store } from '../lib/store'
import { stamp, touch } from '../lib/util'

const planId = (date: string, slot: string) => `plan:${date}:${slot}`

/** Cells planned before the meal library was removed hold a mealId rather than text, so look up the name. */
async function legacyNames(store: Store, familyId: string, plan: PlanEntry[]) {
  if (!plan.some((p) => p.mealId && !p.text)) return new Map<string, string>()
  const meals = await store.byType<Meal>(familyId, 'meal')
  return new Map(meals.map((m) => [m.id, m.name]))
}

const textOf = (p: PlanEntry, names: Map<string, string>) => p.text ?? (p.mealId ? names.get(p.mealId) : undefined)

export async function planBetween(store: Store, familyId: string, from: string, to: string) {
  const plan = (await store.byType<PlanEntry>(familyId, 'plan')).filter((p) => p.date >= from && p.date <= to)
  const names = await legacyNames(store, familyId, plan)
  return plan.flatMap((p) => {
    const text = textOf(p, names)
    return text ? [{ id: p.id, date: p.date, slot: p.slot, text }] : []
  })
}

export const getPlan: Handler = async ({ store, caller }, _p, query) => {
  const week = query.get('week') ?? ''
  if (!isValidDate(week)) throw badRequest('week must be the Monday as YYYY-MM-DD')
  return { body: await planBetween(store, caller.familyId, week, addDays(week, 6)) }
}

export const setPlanCell: Handler = async ({ store, caller }, params, _q, body) => {
  const date = parse(dateSchema, params.date)
  const slot = parse(slotSchema, params.slot)
  const { text } = parse(planCellSchema, body)
  const id = planId(date, slot)
  const existing = await store.get<PlanEntry>(caller.familyId, id, 'plan')
  const saved = existing ? await store.upsert(touch(caller, existing, { text })) : await store.upsert(stamp(caller, 'plan', { date, slot, text }, id))
  return { body: saved }
}

export const clearPlanCell: Handler = async ({ store, caller }, params) => {
  const date = parse(dateSchema, params.date)
  const slot = parse(slotSchema, params.slot)
  await store.delete(caller.familyId, planId(date, slot))
  return { status: 204 }
}

/** Fill the given week from the one before, skipping cells already filled (A9c). */
export const copyWeek: Handler = async ({ store, caller }, _p, _q, body) => {
  const { week } = parse(copyWeekSchema, body)
  const prev = addDays(week, -7)
  const plan = await store.byType<PlanEntry>(caller.familyId, 'plan')
  const have = new Set(plan.filter((p) => p.date >= week && p.date <= addDays(week, 6)).map((p) => p.id))
  const source = plan.filter((p) => p.date >= prev && p.date < week)
  const names = await legacyNames(store, caller.familyId, source)
  let copied = 0
  for (const p of source) {
    const date = addDays(p.date, 7)
    const id = planId(date, p.slot)
    const text = textOf(p, names)
    if (have.has(id) || !text) continue
    await store.upsert(stamp(caller, 'plan', { date, slot: p.slot, text }, id))
    copied++
  }
  return { body: { copied } }
}
