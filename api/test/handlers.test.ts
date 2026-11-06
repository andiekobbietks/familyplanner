import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCaller, integrationCaller, PALETTE } from '../src/lib/caller'
import { HttpError } from '../src/lib/errors'
import { run, type Ctx } from '../src/lib/http'
import { MemoryStore } from '../src/lib/memoryStore'
import { seed } from '../src/lib/seed'
import { setPlanCell, copyWeek, getPlan } from '../src/handlers/plan'
import { getPeople, patchMe } from '../src/handlers/me'
import { createTask, deleteTask, patchTask } from '../src/handlers/tasks'
import { addItem, deleteItem, getItems, getShopping, patchItem } from '../src/handlers/lists'
import { erase, exportAll, getMembers, invite, removeMember } from '../src/handlers/admin'
import { getWeather } from '../src/handlers/weather'
import { assignChore, copyChoreWeek, createChore, deleteChore, getChores, patchChore, unassignChore } from '../src/handlers/chores'
import { createRecipe, deleteRecipe, getRecipes, intakeRecipes, patchRecipe } from '../src/handlers/recipes'
import type { BaseDoc, Caller, Chore, ChoreWeek, Item, List, Member, Recipe } from '../src/lib/types'
import { ValidationError } from '../src/lib/schemas'
import { setStore } from '../src/lib/store'
import { stamp } from '../src/lib/util'
import { clearWeatherCache, readForecast } from '../src/lib/weather'

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
  it('a plan cell needs text and a real slot', async () => {
    await expect(setPlanCell(ctx, { date: '2026-09-16', slot: 'dinner' }, q(), { text: '  ' })).rejects.toBeInstanceOf(ValidationError)
    await expect(setPlanCell(ctx, { date: '2026-09-16', slot: 'brunch' }, q(), { text: 'Pizza' })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('cells planned from the old meal library', () => {
  const planLegacy = async () => {
    await store.deleteAll('home')
    await store.upsert({ ...stamp(tim, 'meal', {}, 'meal-x'), name: 'Roast chicken' } as BaseDoc)
    await store.upsert({ ...stamp(tim, 'plan', { date: '2026-09-14', slot: 'dinner', mealId: 'meal-x' }, 'plan:2026-09-14:dinner') } as BaseDoc)
  }
  it('still show the meal name', async () => {
    await planLegacy()
    const r = await getPlan(ctx, {}, q('week=2026-09-14'), undefined)
    expect(r.body).toEqual([{ id: 'plan:2026-09-14:dinner', date: '2026-09-14', slot: 'dinner', text: 'Roast chicken' }])
  })
  it('copy forward as text', async () => {
    await planLegacy()
    await copyWeek(ctx, {}, q(), { week: '2026-09-21' })
    const copied = await store.get<BaseDoc & { text: string; mealId?: string }>('home', 'plan:2026-09-21:dinner', 'plan')
    expect(copied?.text).toBe('Roast chicken')
    expect(copied?.mealId).toBeUndefined()
  })
  it('take the new text when edited', async () => {
    await planLegacy()
    await setPlanCell(ctx, { date: '2026-09-14', slot: 'dinner' }, q(), { text: 'Takeaway' })
    const r = await getPlan(ctx, {}, q('week=2026-09-14'), undefined)
    expect((r.body as { text: string }[])[0].text).toBe('Takeaway')
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

describe('recipes', () => {
  const create = async (body: unknown) => (await createRecipe(ctx, {}, q(), body)).body as Recipe

  it('needs only a title, and fills in the empty text', async () => {
    const r = await create({ title: 'Beef and broccoli', source: 'https://example.com/beef' })
    expect(r).toMatchObject({ type: 'recipe', tags: [], ingredients: '', method: '', notes: '', createdBy: 'm-tim' })
  })
  it('lists alphabetically', async () => {
    await store.deleteAll('home')
    await create({ title: 'Paella' })
    await create({ title: 'Apple pancakes' })
    const { body } = await getRecipes(ctx, {}, q(), undefined)
    expect((body as Recipe[]).map((r) => r.title)).toEqual(['Apple pancakes', 'Paella'])
  })
  it('S8: audit fields in the body are ignored', async () => {
    const r = await create({ title: 'Paella', createdBy: 'm-charlie', familyId: 'other' })
    expect(r).toMatchObject({ createdBy: 'm-tim', familyId: 'home' })
  })
  it('caps the title at 200 and each text block at 10,000', async () => {
    await expect(create({ title: 'x'.repeat(201) })).rejects.toBeInstanceOf(ValidationError)
    await expect(create({ title: 'Paella', method: 'x'.repeat(10001) })).rejects.toBeInstanceOf(ValidationError)
    expect((await create({ title: 'Paella', method: 'x'.repeat(10000) })).method).toHaveLength(10000)
  })
  it('a patch changes only the fields sent', async () => {
    const r = await create({ title: 'Paella', ingredients: 'Rice', tags: ['rice'] })
    const { body } = await patchRecipe(ctx, { id: r.id }, q(), { method: 'Cook it' })
    expect(body).toMatchObject({ title: 'Paella', ingredients: 'Rice', tags: ['rice'], method: 'Cook it' })
  })
  it('delete removes it, and other document types are out of reach', async () => {
    const r = await create({ title: 'Paella' })
    await deleteRecipe(ctx, { id: r.id }, q(), undefined)
    expect(await store.get('home', r.id, 'recipe')).toBeUndefined()
    await expect(deleteRecipe(ctx, { id: 'm-tim' }, q(), undefined)).rejects.toMatchObject({ status: 404 })
    await expect(patchRecipe(ctx, { id: 'm-tim' }, q(), { title: 'x' })).rejects.toMatchObject({ status: 404 })
  })
})

describe('weather', () => {
  const reply = {
    current: { temperature_2m: 10.2, weather_code: 3, is_day: 1 },
    daily: { time: ['2026-11-02', '2026-11-03'], weather_code: [51, 3], temperature_2m_max: [12.4, 12.9], temperature_2m_min: [8.5, 8.4], precipitation_probability_max: [98, null] },
  }
  const fetchMock = vi.fn()
  const ok = (body: unknown) => async () => new Response(JSON.stringify(body))

  beforeEach(() => {
    clearWeatherCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('S32: gives the forecast for Reading, sending only its coordinates to the weather service', async () => {
    fetchMock.mockImplementation(ok(reply))
    const { body } = await getWeather(ctx, {}, q(), undefined)
    expect(body).toMatchObject({
      place: 'Reading, UK',
      forecast: { current: { temperature: 10.2, code: 3, isDay: true }, days: [{ date: '2026-11-02', code: 51, high: 12.4, low: 8.5, rainChance: 98 }, { rainChance: null }] },
    })
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.hostname).toBe('api.open-meteo.com')
    expect(url.searchParams.get('latitude')).toBe('51.46')
    expect(url.searchParams.get('longitude')).toBe('-0.97')
  })
  it('asks once in 30 minutes', async () => {
    fetchMock.mockImplementation(ok(reply))
    await readForecast(0)
    await readForecast(29 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await readForecast(31 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('keeps the last good forecast through an outage, without hammering the service, then gives up', async () => {
    fetchMock.mockImplementationOnce(ok(reply))
    await readForecast(1000)
    fetchMock.mockRejectedValue(new Error('down'))
    const later = 31 * 60_000
    expect(await readForecast(later)).toBeDefined()
    expect(await readForecast(later + 1000)).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await readForecast(7 * 60 * 60_000)).toBeUndefined()
  })
  it('a failed or garbled reply leaves the dashboard working', async () => {
    fetchMock.mockImplementation(ok({ nonsense: true }))
    expect((await getWeather(ctx, {}, q(), undefined)).body).toEqual({ place: 'Reading, UK', forecast: null })
    clearWeatherCache()
    fetchMock.mockImplementation(async () => new Response('', { status: 500 }))
    expect((await getWeather(ctx, {}, q(), undefined)).body).toEqual({ place: 'Reading, UK', forecast: null })
  })
})

describe('member colours', () => {
  const colourOf = async (id: string) => {
    const people = (await getPeople(ctx, {}, q(), undefined)).body as { id: string; colour: string }[]
    return people.find((p) => p.id === id)?.colour
  }
  const setColour = async (id: string, colour: string) => store.upsert({ ...(await store.get<Member>('home', id, 'member'))!, colour })

  it('shows members saved with the old blue and pink in the new defaults', async () => {
    await setColour('m-tim', '#2563eb')
    await setColour('m-jo', '#DB2777')
    expect(await colourOf('m-tim')).toBe('#0f766e')
    expect(await colourOf('m-jo')).toBe('#b45309')
    const members = (await getMembers(ctx, {}, q(), undefined)).body as Member[]
    expect(members.find((m) => m.id === 'm-jo')?.colour).toBe('#b45309')
  })
  it('leaves any other colour alone', async () => {
    await setColour('m-tim', '#123456')
    expect(await colourOf('m-tim')).toBe('#123456')
  })
  it('new members get no blue or pink, and white text is readable on every default', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(PALETTE).not.toContain('#2563eb')
    expect(PALETTE).not.toContain('#db2777')
    for (const c of PALETTE) expect(1.05 / (luminance(c) + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('recipe intake', () => {
  const token = 'a'.repeat(64)
  const service = () => ({ ...ctx, caller: integrationCaller(token) })
  const send = async (recipes: unknown[]) => (await intakeRecipes(service(), {}, q(), { recipes })).body as { added: string[]; skipped: string[]; failed: { title: string; error: string }[] }
  const post = (headers: Record<string, string>, body: unknown = { recipes: [{ title: 'Paella' }] }) =>
    run({ method: 'POST', headers: new Headers(headers), json: async () => body } as never, { log() {}, warn() {}, error() {} } as never, 'integration/recipes', { integration: true }, intakeRecipes)

  beforeEach(() => {
    process.env.INTEGRATION_TOKEN = token
    setStore(store)
  })

  it('adds new recipes, attributed to the service', async () => {
    expect(await send([{ title: 'Paella', tags: ['rice'] }])).toEqual({ added: ['Paella'], skipped: [], failed: [] })
    const saved = (await store.byType<Recipe>('home', 'recipe')).find((r) => r.title === 'Paella')
    expect(saved).toMatchObject({ createdBy: 'integration', tags: ['rice'], method: '' })
  })
  it('skips a title the app has, leaving the edited one alone', async () => {
    await createRecipe(ctx, {}, q(), { title: 'Paella', notes: 'Edited in the app' })
    expect((await send([{ title: ' PAELLA ', notes: 'From the file' }, { title: 'paella' }])).skipped).toHaveLength(2)
    const paellas = (await store.byType<Recipe>('home', 'recipe')).filter((r) => r.title.toLowerCase() === 'paella')
    expect(paellas).toHaveLength(1)
    expect(paellas[0].notes).toBe('Edited in the app')
  })
  it('adds a title repeated in one batch only once', async () => {
    expect(await send([{ title: 'Paella' }, { title: 'paella' }])).toMatchObject({ added: ['Paella'], skipped: ['paella'] })
  })
  it('one bad recipe does not hold back the rest', async () => {
    const r = await send([{ title: 'Long', method: 'x'.repeat(10001) }, null, { title: 'Paella' }])
    expect(r.added).toEqual(['Paella'])
    expect(r.failed.map((f) => f.title)).toEqual(['Long', 'Untitled'])
    expect(r.failed[0].error).toContain('method')
  })
  it('caps a batch at 100', async () => {
    await expect(send(Array.from({ length: 101 }, (_, i) => ({ title: `R${i}` })))).rejects.toBeInstanceOf(ValidationError)
  })
  it('the right token gets through the real request path', async () => {
    expect(await post({ 'x-integration-token': token })).toMatchObject({ status: 200, jsonBody: { added: ['Paella'] } })
  })
  it('refuses a wrong or missing token before reading the body or writing anything', async () => {
    const before = (await store.byType('home', 'recipe')).length
    for (const headers of [{}, { 'x-integration-token': 'wrong' }, { 'x-integration-token': token + 'x' }]) {
      expect(await post(headers)).toMatchObject({ status: 403, jsonBody: { code: 'BAD_TOKEN' } })
    }
    expect(await store.byType('home', 'recipe')).toHaveLength(before)
  })
  it('a signed-in family member cannot use the route without the token', async () => {
    expect(await post({ 'x-ms-client-principal': principal('dev-tim', 'tim@example.com', ['admin']) })).toMatchObject({ status: 403 })
  })
  it('refuses everything when no token, or a short one, is configured', async () => {
    delete process.env.INTEGRATION_TOKEN
    expect(() => integrationCaller('')).toThrow()
    expect(() => integrationCaller('undefined')).toThrow()
    process.env.INTEGRATION_TOKEN = 'short'
    expect(() => integrationCaller('short')).toThrow()
  })
  it('the token grants no route but this one', () => {
    const src = readFileSync(`${__dirname}/../src/index.ts`, 'utf8')
    expect(src.match(/integration: true/g)).toHaveLength(1)
  })
  it('S5: only the integration path is open at the edge, and its rule comes first', () => {
    const { routes } = JSON.parse(readFileSync(`${__dirname}/../../staticwebapp.config.json`, 'utf8')) as { routes: { route: string; allowedRoles?: string[] }[] }
    const open = routes.filter((r) => r.route.startsWith('/api') && r.allowedRoles?.includes('anonymous')).map((r) => r.route)
    // S31 and S34: the integration token and the display key are the only machine credentials.
    expect(open).toEqual(['/api/integration/*', '/api/display/*'])
    for (const r of open) expect(routes.findIndex((x) => x.route === r)).toBeLessThan(routes.findIndex((x) => x.route === '/api/*'))
  })
})

describe('chores', () => {
  const week = '2026-09-21'
  const next = '2026-09-28'
  const add = async (name: string) => ((await createChore(ctx, {}, q(), { name })).body as Chore).id
  const read = async (w: string) => (await getChores(ctx, {}, q(`week=${w}`), undefined)).body as { chores: { id: string; name: string }[]; assignments: { choreId: string; memberId: string }[] }

  beforeEach(() => store.deleteAll('home').then(() => store.upsert(stamp(tim, 'member', { displayName: 'Tim', email: 'tim@example.com', role: 'admin' as const, colour: '#000000', active: true }, 'm-tim'))))

  it('an assignment belongs to one week', async () => {
    const id = await add('Bins')
    await assignChore(ctx, { id, week }, q(), { memberId: 'm-tim' })
    expect((await read(week)).assignments).toEqual([{ choreId: id, memberId: 'm-tim' }])
    expect((await read(next)).assignments).toEqual([])
    expect((await read(next)).chores).toEqual([{ id, name: 'Bins' }])
  })
  it('any day of the week means that week', async () => {
    const id = await add('Bins')
    await assignChore(ctx, { id, week: '2026-09-24' }, q(), { memberId: 'm-tim' })
    expect((await read('2026-09-27')).assignments).toHaveLength(1)
  })
  it('reassigning replaces, and unassigning clears', async () => {
    await store.upsert(stamp(tim, 'member', { displayName: 'Jo', email: 'jo@example.com', role: 'admin' as const, colour: '#000000', active: true }, 'm-jo'))
    const id = await add('Bins')
    await assignChore(ctx, { id, week }, q(), { memberId: 'm-tim' })
    await assignChore(ctx, { id, week }, q(), { memberId: 'm-jo' })
    expect((await read(week)).assignments).toEqual([{ choreId: id, memberId: 'm-jo' }])
    await unassignChore(ctx, { id, week }, q(), undefined)
    expect((await read(week)).assignments).toEqual([])
  })
  it('rejects a person who is not an active member', async () => {
    const id = await add('Bins')
    await store.upsert(stamp(tim, 'member', { displayName: 'Gone', email: 'gone@example.com', role: 'member' as const, colour: '#000000', active: false }, 'm-gone'))
    await expect(assignChore(ctx, { id, week }, q(), { memberId: 'nobody' })).rejects.toMatchObject({ status: 400 })
    await expect(assignChore(ctx, { id, week }, q(), { memberId: 'm-gone' })).rejects.toMatchObject({ status: 400 })
  })
  it('rejects an unknown chore and a bad week', async () => {
    await expect(assignChore(ctx, { id: 'm-tim', week }, q(), { memberId: 'm-tim' })).rejects.toMatchObject({ status: 404 })
    await expect(getChores(ctx, {}, q('week=soon'), undefined)).rejects.toBeInstanceOf(ValidationError)
  })
  it('copy fills gaps from last week, keeps what is set and skips people who have left', async () => {
    await store.upsert(stamp(tim, 'member', { displayName: 'Jo', email: 'jo@example.com', role: 'admin' as const, colour: '#000000', active: true }, 'm-jo'))
    await store.upsert(stamp(tim, 'member', { displayName: 'Charlie', email: 'c@example.com', role: 'member' as const, colour: '#000000', active: true }, 'm-charlie'))
    const [bins, hoover, oven] = [await add('Bins'), await add('Hoover'), await add('Oven')]
    await assignChore(ctx, { id: bins, week }, q(), { memberId: 'm-tim' })
    await assignChore(ctx, { id: hoover, week }, q(), { memberId: 'm-tim' })
    await assignChore(ctx, { id: oven, week }, q(), { memberId: 'm-charlie' })
    await assignChore(ctx, { id: hoover, week: next }, q(), { memberId: 'm-jo' })
    await removeMember(ctx, { id: 'm-charlie' }, q(), undefined)

    expect((await copyChoreWeek(ctx, {}, q(), { week: next })).body).toEqual({ copied: 1 })
    const got = (await read(next)).assignments
    expect(got).toHaveLength(2)
    expect(got).toContainEqual({ choreId: bins, memberId: 'm-tim' })
    expect(got).toContainEqual({ choreId: hoover, memberId: 'm-jo' })
  })
  it('deleting a chore removes its weeks and no other chore\'s', async () => {
    const [bins, hoover] = [await add('Bins'), await add('Hoover')]
    await assignChore(ctx, { id: bins, week }, q(), { memberId: 'm-tim' })
    await assignChore(ctx, { id: bins, week: next }, q(), { memberId: 'm-tim' })
    await assignChore(ctx, { id: hoover, week }, q(), { memberId: 'm-tim' })
    await deleteChore(ctx, { id: bins }, q(), undefined)
    const left = await store.byType<ChoreWeek>('home', 'choreWeek')
    expect(left.map((a) => a.choreId)).toEqual([hoover])
  })
  it('renames', async () => {
    const id = await add('Bins')
    await patchChore(ctx, { id }, q(), { name: 'Recycling' })
    expect((await read(week)).chores[0].name).toBe('Recycling')
  })
})

describe('export', () => {
  it('A10: includes recipes and chores', async () => {
    const { body } = await exportAll(ctx, {}, q(), undefined)
    const out = body as Record<string, BaseDoc[]>
    expect(out.recipe.length).toBeGreaterThan(0)
    expect(out.chore.length).toBeGreaterThan(0)
    expect(out.choreWeek.length).toBeGreaterThan(0)
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

describe('the wall shopping panel', () => {
  type Shopping = { id: string; name: string; items: { name: string; category?: string }[] } | null
  const shopping = async () => (await getShopping(ctx, {}, q(), undefined)).body as Shopping

  it('shows the default list, unchecked items only, by category', async () => {
    const s = await shopping()
    expect(s?.id).toBe('l-groceries')
    expect(s?.items.map((i) => i.name)).toEqual(['Bananas', 'Milk', 'Bread', 'Washing-up liquid', 'Birthday candles'])
  })

  it('follows the default list setting, and falls back to the first list', async () => {
    const settings = (await store.get<BaseDoc & { defaultListId?: string }>('home', 'settings', 'settings'))!
    await store.upsert({ ...settings, defaultListId: 'l-hardware' } as never)
    expect((await shopping())?.items.map((i) => i.name)).toEqual(['Light bulbs'])
    await store.upsert({ ...settings, defaultListId: undefined } as never)
    expect((await shopping())?.id).toBe('l-groceries')
  })

  it('is null with no lists', async () => {
    for (const l of await store.byType<List>('home', 'list')) await store.delete('home', l.id)
    expect(await shopping()).toBeNull()
  })
})
