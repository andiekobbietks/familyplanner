import { beforeEach, describe, expect, it } from 'vitest'
import { getCaller } from '../src/lib/caller'
import { HttpError } from '../src/lib/errors'
import type { Ctx } from '../src/lib/http'
import { MemoryStore } from '../src/lib/memoryStore'
import { seed } from '../src/lib/seed'
import { shop, setPlanCell, copyWeek } from '../src/handlers/meals'
import { patchMe } from '../src/handlers/me'
import { createTask, deleteTask, patchTask } from '../src/handlers/tasks'
import { addItem, deleteItem, getItems, patchItem } from '../src/handlers/lists'
import { erase, invite, removeMember } from '../src/handlers/admin'
import type { BaseDoc, Caller, Item, List, Member } from '../src/lib/types'
import { ValidationError } from '../src/lib/schemas'
import { stamp } from '../src/lib/util'

process.env.FAMILY_ID = 'home'
const q = (s = '') => new URLSearchParams(s)
const principal = (userId: string, email: string, roles: string[]) =>
  Buffer.from(JSON.stringify({ identityProvider: 'aad', userId, userDetails: email, userRoles: ['anonymous', 'authenticated', ...roles] })).toString('base64')

let store: MemoryStore
let ctx: Ctx
const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }

beforeEach(async () => {
  store = await MemoryStore.create(undefined, seed)
  ctx = { store, caller: tim, now: new Date('2026-09-16T10:00:00Z') }
})

describe('getCaller', () => {
  it('A1: no principal is 401', async () => {
    await expect(getCaller(null, store)).rejects.toMatchObject({ status: 401 })
  })
  it('A2: a signed-in account with no role is 403', async () => {
    await expect(getCaller(principal('x', 'stranger@example.com', []), store)).rejects.toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })
  it('links the member document by email on first login', async () => {
    const c = await getCaller(principal('dev-jo', 'jo@example.com', ['admin']), store)
    expect(c.memberId).toBe('m-jo')
    expect(c.role).toBe('admin')
  })
  it('S3: a role in the session grants nothing without a member document', async () => {
    await expect(getCaller(principal('x', 'stranger@example.com', ['admin']), store)).rejects.toMatchObject({ status: 403, code: 'NOT_A_MEMBER' })
  })
  it('a member keeps their role when the session has no custom role', async () => {
    await getCaller(principal('dev-jo', 'jo@example.com', []), store)
    expect(await getCaller(principal('dev-jo', 'jo@example.com', []), store)).toMatchObject({ memberId: 'm-jo', role: 'admin' })
  })
  it('an invited member signs in, and their email cannot then be claimed by another account', async () => {
    await invite(ctx, {}, q(), { email: 'new@example.com', role: 'member' })
    const c = await getCaller(principal('new-user', 'new@example.com', []), store)
    expect(c.role).toBe('member')
    await expect(getCaller(principal('other-user', 'new@example.com', []), store)).rejects.toMatchObject({ status: 403 })
  })
  it('S29: erase keeps the admin who ran it', async () => {
    await erase(ctx, {}, q(), { confirm: 'DELETE' })
    expect((await store.byType<Member>('home', 'member')).map((m) => m.id)).toEqual(['m-tim'])
  })
  it('duplicate members collapse to the oldest', async () => {
    const dup = (id: string, createdAt: string) => stamp(tim, 'member', { displayName: 'Dup', email: 'dup@example.com', role: 'member' as const, colour: '#000000', active: true, providerUserId: 'dup', lastLoginAt: createdAt, createdAt }, id)
    await store.upsert({ ...dup('newer', 'x'), createdAt: '2026-11-01T21:24:37.150Z' })
    await store.upsert({ ...dup('oldest', 'x'), createdAt: '2026-11-01T21:24:37.131Z' })
    const c = await getCaller(principal('dup', 'dup@example.com', ['member']), store)
    expect(c.memberId).toBe('oldest')
    expect(await store.get('home', 'newer', 'member')).toBeUndefined()
  })
  it('A5: a removed member fails on the next request', async () => {
    await removeMember(ctx, { id: 'm-charlie' }, q(), undefined)
    await expect(getCaller(principal('dev-charlie', 'charlie@example.com', ['member']), store)).rejects.toMatchObject({ status: 403 })
  })
  it('never trusts a role in the body (A12)', async () => {
    const r = await patchMe(ctx, {}, q(), { displayName: 'Timothy', role: 'superadmin' })
    expect(r.body).toMatchObject({ displayName: 'Timothy', role: 'admin' })
  })
})

describe('validation', () => {
  it('A13: a 10,000 character title is rejected', async () => {
    await expect(createTask(ctx, {}, q(), { title: 'x'.repeat(10000) })).rejects.toBeInstanceOf(ValidationError)
  })
  it('a plan cell needs exactly one of mealId or text', async () => {
    await expect(setPlanCell(ctx, { date: '2026-09-16', slot: 'dinner' }, q(), { mealId: 'meal-1', text: 'Pizza' })).rejects.toBeInstanceOf(ValidationError)
    await expect(setPlanCell(ctx, { date: '2026-09-16', slot: 'brunch' }, q(), { text: 'Pizza' })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('shopping integration', () => {
  it('A9a: adds missing ingredients, skips those already unchecked, notes the meal', async () => {
    // Spaghetti bolognese has five ingredients. Put two of them on Groceries first.
    await addItem(ctx, { id: 'l-groceries' }, q(), { name: 'onion' })
    await addItem(ctx, { id: 'l-groceries' }, q(), { name: 'Spaghetti' })
    const r = await shop(ctx, {}, q(), { listId: 'l-groceries', mealIds: ['meal-1'] })
    expect(r.body).toEqual({ added: 3, skipped: 2 })
    const items = (await getItems(ctx, { id: 'l-groceries' }, q(), undefined)).body as Item[]
    const added = items.filter((i) => i.note === 'Spaghetti bolognese')
    expect(added.map((i) => i.name).sort()).toEqual(['500 g mince', 'Parmesan', 'Tinned tomatoes'])
    expect(added.every((i) => !i.checked)).toBe(true)
  })
  it('a checked item does not count as already on the list', async () => {
    // Bread is unchecked in the seed. Once it is checked off, a meal with Bread adds it again.
    await patchItem(ctx, { id: 'i-2' }, q(), { checked: true })
    const r = await shop(ctx, {}, q(), { listId: 'l-groceries', mealIds: ['meal-5'] })
    expect(r.body).toEqual({ added: 3, skipped: 0 })
  })
})

describe('copy week', () => {
  it('A9c: fills empty cells only', async () => {
    const week = '2026-09-21' // the week after the seeded one, assuming tests run in the seeded week
    // Seed plans the current week; make this test independent of the calendar by planning explicitly.
    await store.deleteAll('home')
    for (const d of ['2026-09-14', '2026-09-15', '2026-09-18']) await setPlanCell(ctx, { date: d, slot: 'dinner' }, q(), { text: `Prev ${d}` })
    await setPlanCell(ctx, { date: '2026-09-25', slot: 'dinner' }, q(), { text: 'Friday stays' })
    const r = await copyWeek(ctx, {}, q(), { week })
    expect(r.body).toEqual({ copied: 2 })
    const fri = await store.get<BaseDoc & { text: string }>('home', 'plan:2026-09-25:dinner', 'plan')
    expect(fri?.text).toBe('Friday stays')
  })
})

describe('document types', () => {
  it('S7: a member cannot delete a list through the item route', async () => {
    await expect(deleteItem(ctx, { id: 'l-groceries' }, q(), undefined)).rejects.toMatchObject({ status: 404 })
    expect(await store.get<List>('home', 'l-groceries', 'list')).toBeDefined()
  })
  it('S17: a removed member cannot be restored by deleting their record', async () => {
    await removeMember(ctx, { id: 'm-charlie' }, q(), undefined)
    await expect(deleteTask(ctx, { id: 'm-charlie' }, q(), undefined)).rejects.toMatchObject({ status: 404 })
    await expect(getCaller(principal('dev-charlie', 'charlie@example.com', ['member']), store)).rejects.toMatchObject({ status: 403 })
  })
  it('patch routes do not write to other document types', async () => {
    await expect(patchTask(ctx, { id: 'm-tim' }, q(), { title: 'x' })).rejects.toMatchObject({ status: 404 })
    await expect(patchItem(ctx, { id: 'm-tim' }, q(), { name: 'x' })).rejects.toMatchObject({ status: 404 })
    expect((await store.get<Member>('home', 'm-tim', 'member'))?.role).toBe('admin')
  })
})

describe('errors', () => {
  it('HttpError carries status and code', () => {
    const e = new HttpError(403, 'FORBIDDEN', 'no')
    expect(e.status).toBe(403)
  })
})
