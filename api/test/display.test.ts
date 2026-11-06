import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStore } from '../src/lib/memoryStore'
import { seed } from '../src/lib/seed'
import { setStore } from '../src/lib/store'
import type { Ctx } from '../src/lib/http'
import type { Caller, Member } from '../src/lib/types'

/** Every route index.ts registers, captured instead of handed to the Functions host. */
const registered = vi.hoisted(() => [] as { name: string; methods: string[]; route: string; handler: (req: unknown, ctx: unknown) => Promise<{ status: number; jsonBody?: { code?: string } }> }[])
vi.mock('@azure/functions', () => ({ app: { http: (name: string, o: object) => registered.push({ name, ...(o as never) }) } }))

await import('../src/index')
const { route } = await import('../src/lib/http')
const { getPeople } = await import('../src/handlers/me')
const { assignChore } = await import('../src/handlers/chores')
const { invite } = await import('../src/handlers/admin')
const { getCaller } = await import('../src/lib/caller')

process.env.FAMILY_ID = 'home'

/** What the wall display may read. Anything added here should be something its page shows. */
const DISPLAY_CAN_READ = ['me-get', 'people-get', 'external-events-list', 'tasks-get', 'plan-get', 'chores-get', 'weather-get', 'settings-get', 'shopping-get']

const principal = (userId: string, email: string) =>
  Buffer.from(JSON.stringify({ identityProvider: 'aad', userId, userDetails: email, userRoles: ['anonymous', 'authenticated'] })).toString('base64')
const quiet = { log() {}, warn() {}, error() {} }

function call(r: (typeof registered)[number], who = principal('dev-display', 'display@example.com')) {
  const params = Object.fromEntries([...r.route.matchAll(/\{(\w+)\}/g)].map(([, k]) => [k, k === 'date' || k === 'week' ? '2026-09-14' : k === 'slot' ? 'dinner' : 'x']))
  const req = { method: r.methods[0], headers: new Headers({ 'x-ms-client-principal': who }), params, query: new URLSearchParams('week=2026-09-14&from=2026-09-14&to=2026-09-20'), json: async () => ({}) }
  return r.handler(req, quiet)
}

let store: MemoryStore
beforeEach(async () => {
  store = await MemoryStore.create(undefined, seed)
  setStore(store)
  // Weather and calendars must not reach the network from a test.
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline')
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('display role', () => {
  it('every allowed route exists and is a GET', () => {
    for (const name of DISPLAY_CAN_READ) expect(registered.find((r) => r.name === name)?.methods).toEqual(['GET'])
  })

  it.each(// display/* (the key aliases and pairing) is S34's, tested in displayKey.test.ts.
  registered.filter((r) => !DISPLAY_CAN_READ.includes(r.name) && !['integration', 'display'].includes(r.route.split('/')[0])).map((r) => [r.name, r] as const))(
    'is refused %s',
    async (_name, r) => {
      const res = await call(r)
      expect(res.status).toBe(403)
      expect(res.jsonBody?.code).toBe('DISPLAY_READ_ONLY')
    },
  )

  it.each(DISPLAY_CAN_READ)('can read %s', async (name) => {
    const res = await call(registered.find((r) => r.name === name)!)
    expect(res.status).toBe(200)
  })

  it('cannot chat, write, export or list members, and nothing changes', async () => {
    const before = JSON.stringify(await store.byType('home', 'task'))
    for (const name of ['chat-post', 'tasks-create', 'items-add', 'plan-set', 'export-get', 'members-get', 'me-patch']) {
      expect((await call(registered.find((r) => r.name === name)!)).status).toBe(403)
    }
    expect(JSON.stringify(await store.byType('home', 'task'))).toBe(before)
  })

  it('a member is unaffected by the display rule', async () => {
    const res = await call(registered.find((r) => r.name === 'tasks-create')!, principal('dev-charlie', 'charlie@example.com'))
    expect(res.status).not.toBe(403)
  })

  it('a display route that writes is rejected when it is registered', () => {
    expect(() => route('bad', 'POST', 'bad', { display: true }, async () => ({}))).toThrow(/only read/)
  })

  it('an admin can invite a display, which signs in with that role', async () => {
    const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }
    const ctx: Ctx = { store, caller: tim, now: new Date('2026-09-16T10:00:00Z') }
    await invite(ctx, {}, new URLSearchParams(), { email: 'frame@example.com', role: 'display' })
    expect(await getCaller(principal('frame', 'frame@example.com'), store)).toMatchObject({ role: 'display' })
  })

  it('is not a person: absent from pickers and cannot be given a chore', async () => {
    const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }
    const ctx: Ctx = { store, caller: tim, now: new Date('2026-09-16T10:00:00Z') }
    const people = (await getPeople(ctx, {}, new URLSearchParams(), undefined)).body as { id: string }[]
    expect(people.map((p) => p.id)).not.toContain('m-kitchen')
    expect((await store.get<Member>('home', 'm-kitchen', 'member'))?.role).toBe('display')
    await expect(assignChore(ctx, { id: 'c-bins', week: '2026-09-14' }, new URLSearchParams(), { memberId: 'm-kitchen' })).rejects.toMatchObject({ status: 400 })
  })
})
