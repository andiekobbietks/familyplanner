import { addDays, mondayOf } from '../lib/dates'
import { badRequest, notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { choreAssignSchema, choreSchema, copyWeekSchema, dateSchema, parse } from '../lib/schemas'
import type { Store } from '../lib/store'
import type { Chore, ChoreWeek, Member } from '../lib/types'
import { stamp, touch } from '../lib/util'

const assignmentId = (week: string, choreId: string) => `chorewk:${week}:${choreId}`
const weekOf = (date: unknown) => mondayOf(parse(dateSchema, date))

async function getChore(store: Store, familyId: string, id: string) {
  const chore = await store.get<Chore>(familyId, id, 'chore')
  if (!chore) throw notFound('Chore not found')
  return chore
}

async function activeMemberIds(store: Store, familyId: string) {
  const members = await store.byType<Member>(familyId, 'member')
  return new Set(members.filter((m) => m.active).map((m) => m.id))
}

export const getChores: Handler = async ({ store, caller }, _p, query) => {
  const week = weekOf(query.get('week'))
  const [chores, assignments] = await Promise.all([store.byType<Chore>(caller.familyId, 'chore'), store.byType<ChoreWeek>(caller.familyId, 'choreWeek')])
  chores.sort((a, b) => a.name.localeCompare(b.name))
  return {
    body: {
      chores: chores.map(({ id, name }) => ({ id, name })),
      assignments: assignments.filter((a) => a.week === week).map(({ choreId, memberId }) => ({ choreId, memberId })),
    },
  }
}

export const createChore: Handler = async ({ store, caller }, _p, _q, body) => {
  const { name } = parse(choreSchema, body)
  const saved = await store.upsert(stamp(caller, 'chore', { name }))
  return { status: 201, body: saved }
}

export const patchChore: Handler = async ({ store, caller }, params, _q, body) => {
  const chore = await getChore(store, caller.familyId, params.id)
  const { name } = parse(choreSchema, body)
  return { body: await store.upsert(touch(caller, chore, { name })) }
}

/** Takes the chore's past and future weeks with it. */
export const deleteChore: Handler = async ({ store, caller }, params) => {
  const chore = await getChore(store, caller.familyId, params.id)
  const assignments = await store.byType<ChoreWeek>(caller.familyId, 'choreWeek')
  for (const a of assignments) if (a.choreId === chore.id) await store.delete(caller.familyId, a.id)
  await store.delete(caller.familyId, chore.id)
  return { status: 204 }
}

export const assignChore: Handler = async ({ store, caller }, params, _q, body) => {
  const week = weekOf(params.week)
  const chore = await getChore(store, caller.familyId, params.id)
  const { memberId } = parse(choreAssignSchema, body)
  if (!(await activeMemberIds(store, caller.familyId)).has(memberId)) throw badRequest('Unknown member')
  const id = assignmentId(week, chore.id)
  const existing = await store.get<ChoreWeek>(caller.familyId, id, 'choreWeek')
  const saved = existing ? await store.upsert(touch(caller, existing, { memberId })) : await store.upsert(stamp(caller, 'choreWeek', { week, choreId: chore.id, memberId }, id))
  return { body: saved }
}

export const unassignChore: Handler = async ({ store, caller }, params) => {
  await store.delete(caller.familyId, assignmentId(weekOf(params.week), params.id))
  return { status: 204 }
}

/** Fill the given week from the one before, leaving chores already assigned alone. Mirrors the meal plan's copy. */
export const copyChoreWeek: Handler = async ({ store, caller }, _p, _q, body) => {
  const week = weekOf(parse(copyWeekSchema, body).week)
  const prev = addDays(week, -7)
  const assignments = await store.byType<ChoreWeek>(caller.familyId, 'choreWeek')
  const taken = new Set(assignments.filter((a) => a.week === week).map((a) => a.choreId))
  const active = await activeMemberIds(store, caller.familyId)
  let copied = 0
  for (const a of assignments) {
    if (a.week !== prev || taken.has(a.choreId) || !active.has(a.memberId)) continue
    await store.upsert(stamp(caller, 'choreWeek', { week, choreId: a.choreId, memberId: a.memberId }, assignmentId(week, a.choreId)))
    copied++
  }
  return { body: { copied } }
}
