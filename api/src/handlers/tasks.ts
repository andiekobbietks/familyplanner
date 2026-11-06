import { notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { parse, taskDoneSchema, taskPatchSchema, taskSchema } from '../lib/schemas'
import type { Task } from '../lib/types'
import { nowIso, stamp, touch } from '../lib/util'

export const getTasks: Handler = async ({ store, caller, now }, _p, query) => {
  const view = query.get('view') ?? 'mine'
  const all = await store.byType<Task>(caller.familyId, 'task')
  const today = now.toISOString().slice(0, 10)
  let out: Task[]
  if (view === 'done') {
    const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString()
    out = all.filter((t) => t.done && (t.completedAt ?? '') >= cutoff)
    out.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  } else {
    out = all.filter((t) => !t.done && (view === 'all' || t.assignee === caller.memberId))
    // Overdue first, then by due date, then undated (section 5.5).
    const rank = (t: Task) => (t.dueDate ? (t.dueDate < today ? 0 : 1) : 2)
    out.sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.createdAt.localeCompare(b.createdAt))
  }
  return { body: out }
}

export const createTask: Handler = async ({ store, caller }, _p, _q, body) => {
  const data = parse(taskSchema, body)
  const saved = await store.upsert(stamp(caller, 'task', { ...data, done: false }))
  return { status: 201, body: saved }
}

export const patchTask: Handler = async ({ store, caller }, params, _q, body) => {
  const task = await store.get<Task>(caller.familyId, params.id, 'task')
  if (!task) throw notFound('Task not found')
  const { done, ...rest } = parse(taskPatchSchema, body)
  const patch: Partial<Task> = { ...rest }
  if (done !== undefined && done !== task.done) {
    patch.done = done
    patch.completedAt = done ? nowIso() : null
    patch.completedBy = done ? caller.memberId : null
  }
  const saved = await store.upsert(touch(caller, task, patch))
  return { body: saved }
}

/**
 * Marks a to-do done or not done and changes nothing else. The wall display's only write (S34),
 * so a copied display key can tick to-dos but not edit, add or delete them.
 * completedBy is the caller: `display:<device id>` for a paired frame.
 */
export const setTaskDone: Handler = async ({ store, caller }, params, _q, body) => {
  const { done } = parse(taskDoneSchema, body)
  const task = await store.get<Task>(caller.familyId, params.id, 'task')
  if (!task) throw notFound('Task not found')
  if (done === task.done) return { body: task }
  const saved = await store.upsert(
    touch(caller, task, { done, completedAt: done ? nowIso() : null, completedBy: done ? caller.memberId : null }),
  )
  return { body: saved }
}

export const deleteTask: Handler = async ({ store, caller }, params) => {
  const task = await store.get<Task>(caller.familyId, params.id, 'task')
  if (!task) throw notFound('Task not found')
  await store.delete(caller.familyId, task.id)
  return { status: 204 }
}
