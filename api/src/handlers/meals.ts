import { addDays, isValidDate } from '../lib/dates'
import { badRequest, notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { copyWeekSchema, dateSchema, mealPatchSchema, mealSchema, parse, planCellSchema, shopSchema, slotSchema } from '../lib/schemas'
import type { Item, List, Meal, PlanEntry } from '../lib/types'
import { stamp, touch } from '../lib/util'

const planId = (date: string, slot: string) => `plan:${date}:${slot}`

export const getMeals: Handler = async ({ store, caller }, _p, query) => {
  const q = (query.get('q') ?? '').trim().toLowerCase()
  const tag = query.get('tag')
  let meals = (await store.byType<Meal>(caller.familyId, 'meal')).filter((m) => !m.archived)
  if (q) meals = meals.filter((m) => m.name.toLowerCase().includes(q))
  if (tag) meals = meals.filter((m) => m.tags.includes(tag as Meal['tags'][number]))
  meals.sort((a, b) => (b.lastPlannedAt ?? '').localeCompare(a.lastPlannedAt ?? '') || a.name.localeCompare(b.name))
  return { body: meals }
}

export const createMeal: Handler = async ({ store, caller }, _p, _q, body) => {
  const data = parse(mealSchema, body)
  const saved = await store.upsert(stamp(caller, 'meal', { ...data, link: data.link || undefined, archived: false }))
  return { status: 201, body: saved }
}

export const patchMeal: Handler = async ({ store, caller }, params, _q, body) => {
  const meal = await store.get<Meal>(caller.familyId, params.id, 'meal')
  if (!meal || meal.archived) throw notFound('Meal not found')
  const patch = parse(mealPatchSchema, body)
  const saved = await store.upsert(touch(caller, meal, { ...patch, link: patch.link === '' ? undefined : (patch.link ?? meal.link) }))
  return { body: saved }
}

/** Admin only. Past plan entries keep the meal name as free text (section 5.6). */
export const archiveMeal: Handler = async ({ store, caller }, params) => {
  const meal = await store.get<Meal>(caller.familyId, params.id, 'meal')
  if (!meal) throw notFound('Meal not found')
  const plan = await store.byType<PlanEntry>(caller.familyId, 'plan')
  for (const p of plan) if (p.mealId === meal.id) await store.upsert(touch(caller, p, { mealId: undefined, text: meal.name }))
  await store.upsert(touch(caller, meal, { archived: true }))
  return { status: 204 }
}

export const getPlan: Handler = async ({ store, caller }, _p, query) => {
  const week = query.get('week') ?? ''
  if (!isValidDate(week)) throw badRequest('week must be the Monday as YYYY-MM-DD')
  const end = addDays(week, 6)
  const [plan, meals] = await Promise.all([store.byType<PlanEntry>(caller.familyId, 'plan'), store.byType<Meal>(caller.familyId, 'meal')])
  const names = new Map(meals.map((m) => [m.id, m.name]))
  const out = plan
    .filter((p) => p.date >= week && p.date <= end)
    .map((p) => ({ ...p, mealName: p.mealId ? names.get(p.mealId) : undefined }))
  return { body: out }
}

export const setPlanCell: Handler = async ({ store, caller }, params, _q, body) => {
  const date = parse(dateSchema, params.date)
  const slot = parse(slotSchema, params.slot)
  const cell = parse(planCellSchema, body)
  if (cell.mealId) {
    const meal = await store.get<Meal>(caller.familyId, cell.mealId, 'meal')
    if (!meal || meal.archived) throw notFound('Meal not found')
    if (!meal.lastPlannedAt || meal.lastPlannedAt < date) await store.upsert(touch(caller, meal, { lastPlannedAt: date }))
  }
  const id = planId(date, slot)
  const existing = await store.get<PlanEntry>(caller.familyId, id, 'plan')
  const fields = { date, slot, mealId: cell.mealId, text: cell.text?.trim() || undefined, cook: cell.cook ?? undefined, note: cell.note || undefined }
  const saved = existing ? await store.upsert(touch(caller, existing, fields)) : await store.upsert(stamp(caller, 'plan', fields, id))
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
  let copied = 0
  for (const p of plan.filter((p) => p.date >= prev && p.date < week)) {
    const date = addDays(p.date, 7)
    const id = planId(date, p.slot)
    if (have.has(id)) continue
    await store.upsert(stamp(caller, 'plan', { date, slot: p.slot, mealId: p.mealId, text: p.text, cook: p.cook, note: p.note }, id))
    copied++
  }
  return { body: { copied } }
}

/**
 * Add ingredient lines to a list as unchecked items. Lines already unchecked
 * on the list (case-insensitive by name) are skipped. The meal name goes in
 * the item note so it is clear why it is there (A9a).
 */
export const shop: Handler = async ({ store, caller }, _p, _q, body) => {
  const req = parse(shopSchema, body)
  const list = await store.get<List>(caller.familyId, req.listId, 'list')
  if (!list) throw notFound('List not found')

  let mealIds = req.mealIds ?? []
  if (req.week) {
    const plan = await store.byType<PlanEntry>(caller.familyId, 'plan')
    mealIds = plan.filter((p) => p.date >= req.week! && p.date <= addDays(req.week!, 6) && p.mealId).map((p) => p.mealId!)
  }
  const meals = (await Promise.all([...new Set(mealIds)].map((id) => store.get<Meal>(caller.familyId, id, 'meal')))).filter(
    (m): m is Meal => !!m && !m.archived,
  )
  const items = await store.byType<Item>(caller.familyId, 'item')
  const present = new Set(items.filter((i) => i.listId === list.id && !i.checked).map((i) => i.name.toLowerCase()))

  let added = 0
  let skipped = 0
  const recent = [...list.recentNames]
  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      const key = ing.text.trim().toLowerCase()
      if (!key) continue
      if (present.has(key)) {
        skipped++
        continue
      }
      present.add(key)
      await store.upsert(stamp(caller, 'item', { listId: list.id, name: ing.text.trim(), category: ing.category, note: meal.name, checked: false }))
      if (!recent.some((n) => n.toLowerCase() === key)) recent.unshift(ing.text.trim())
      added++
    }
  }
  if (added) await store.upsert(touch(caller, list, { recentNames: recent.slice(0, 300) }))
  return { body: { added, skipped } }
}
