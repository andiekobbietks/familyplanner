import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStore } from '../src/lib/memoryStore'
import { seed } from '../src/lib/seed'
import { setStore } from '../src/lib/store'
import type { Ctx } from '../src/lib/http'
import type { Caller, DisplayDevice } from '../src/lib/types'

/**
 * S34: the wall display's own key, so the frame needs no Microsoft sign-in.
 * The key only opens /api/display/*, which reads what the wall page shows.
 */
type Res = { status: number; jsonBody?: { code?: string } & Record<string, unknown>; headers?: Record<string, string> }
const registered = vi.hoisted(() => [] as { name: string; methods: string[]; route: string; handler: (req: unknown, ctx: unknown) => Promise<Res> }[])
vi.mock('@azure/functions', () => ({ app: { http: (name: string, o: object) => registered.push({ name, ...(o as never) }) } }))

await import('../src/index')
const { createDisplayDevice, listDisplayDevices, revokeDisplayDevice } = await import('../src/handlers/displayDevices')
const { DISPLAY_COOKIE } = await import('../src/lib/displayKey')
const { ValidationError } = await import('../src/lib/schemas')

process.env.FAMILY_ID = 'home'

/** The same list as display.test.ts: what the wall page reads. */
const DISPLAY_CAN_READ = ['me-get', 'people-get', 'external-events-list', 'tasks-get', 'plan-get', 'chores-get', 'weather-get', 'settings-get', 'shopping-get']
const quiet = { log() {}, warn() {}, error() {} }
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const principal = (userId: string, email: string) =>
  Buffer.from(JSON.stringify({ identityProvider: 'aad', userId, userDetails: email, userRoles: ['anonymous', 'authenticated'] })).toString('base64')

const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }
const charlie: Caller = { memberId: 'm-charlie', role: 'member', familyId: 'home', displayName: 'Charlie' }

let store: MemoryStore
let ctx: Ctx
beforeEach(async () => {
  store = await MemoryStore.create(undefined, seed)
  setStore(store)
  ctx = { store, caller: tim, now: new Date('2026-11-06T09:00:00Z') }
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline')
  })
})
afterEach(() => vi.unstubAllGlobals())

const byName = (name: string) => {
  const r = registered.find((x) => x.name === name)
  if (!r) throw new Error(`no route ${name}`)
  return r
}

function request(r: (typeof registered)[number], opts: { cookie?: string; principal?: string; body?: unknown } = {}) {
  const headers = new Headers()
  if (opts.cookie) headers.set('cookie', opts.cookie)
  if (opts.principal) headers.set('x-ms-client-principal', opts.principal)
  const req = {
    method: r.methods[0],
    headers,
    params: {},
    query: new URLSearchParams('view=all&week=2026-11-02&from=2026-11-02&to=2026-11-08'),
    json: async () => opts.body ?? {},
  }
  return r.handler(req, quiet)
}

async function newKey(name = 'Kitchen') {
  const res = await createDisplayDevice(ctx, {}, new URLSearchParams(), { name })
  return res.body as { id: string; name: string; key: string }
}
const cookieFor = (key: string) => `other=1; ${DISPLAY_COOKIE}=${key}`
const aliasFor = (name: string) => `display-${name}`

describe('display key: creating, listing, revoking', () => {
  it('returns the key once and stores only its SHA-256', async () => {
    const { id, key } = await newKey()
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)   // 32 random bytes, base64url
    const doc = await store.get<DisplayDevice>('home', id, 'displayDevice')
    expect(doc?.keyHash).toBe(sha(key))
    expect(JSON.stringify(doc)).not.toContain(key)
  })

  it('two keys are different', async () => {
    expect((await newKey('A')).key).not.toBe((await newKey('B')).key)
  })

  it('the list never contains a key or a hash', async () => {
    const { key } = await newKey()
    const list = JSON.stringify((await listDisplayDevices(ctx, {}, new URLSearchParams(), undefined)).body)
    expect(list).toContain('Kitchen')
    expect(list).not.toContain(key)
    expect(list).not.toContain(sha(key))
    expect(list).not.toContain('keyHash')
  })

  it('is admin only: a member and the display are refused all three', async () => {
    for (const name of ['display-devices-get', 'display-devices-create', 'display-devices-revoke']) {
      expect((await request(byName(name), { principal: principal('dev-charlie', 'charlie@example.com') })).status).toBe(403)
      expect((await request(byName(name), { principal: principal('dev-display', 'display@example.com') })).status).toBe(403)
    }
  })

  it('rejects a missing or overlong name', async () => {
    await expect(createDisplayDevice(ctx, {}, new URLSearchParams(), { name: '' })).rejects.toBeInstanceOf(ValidationError)
    await expect(createDisplayDevice(ctx, {}, new URLSearchParams(), { name: 'x'.repeat(61) })).rejects.toBeInstanceOf(ValidationError)
  })

  it('a revoked key stops working at once', async () => {
    const { id, key } = await newKey()
    expect((await request(byName(aliasFor('tasks-get')), { cookie: cookieFor(key) })).status).toBe(200)
    await revokeDisplayDevice(ctx, { id }, new URLSearchParams(), undefined)
    const res = await request(byName(aliasFor('tasks-get')), { cookie: cookieFor(key) })
    expect(res.status).toBe(403)
    expect(res.jsonBody?.code).toBe('NOT_PAIRED')
    const doc = await store.get<DisplayDevice>('home', id, 'displayDevice')
    expect(doc?.active).toBe(false)
    expect(doc?.keyHash).toBe('')
  })

  it('revoking an unknown id is a 404', async () => {
    await expect(revokeDisplayDevice(ctx, { id: 'nope' }, new URLSearchParams(), undefined)).rejects.toMatchObject({ status: 404 })
  })

  it('the export leaves display keys out', async () => {
    await newKey()
    const res = await request(byName('export-get'), { principal: principal('dev-tim', 'tim@example.com') })
    expect(JSON.stringify(res.jsonBody)).not.toContain('displayDevice')
  })
})

describe('display key: pairing', () => {
  it('a good key sets the cookie with exact flags', async () => {
    const { key } = await newKey()
    const res = await request(byName('display-pair'), { body: { key } })
    expect(res.status).toBe(204)
    expect(res.headers?.['Set-Cookie']).toBe(`${DISPLAY_COOKIE}=${key}; Path=/; Max-Age=34560000; Secure; HttpOnly; SameSite=Strict`)
  })

  it('a wrong, revoked or malformed key sets no cookie', async () => {
    const { id, key } = await newKey()
    const wrong = await request(byName('display-pair'), { body: { key: 'A'.repeat(43) } })
    expect(wrong.status).toBe(403)
    expect(wrong.headers?.['Set-Cookie']).toBeUndefined()

    await revokeDisplayDevice(ctx, { id }, new URLSearchParams(), undefined)
    const revoked = await request(byName('display-pair'), { body: { key } })
    expect(revoked.status).toBe(403)
    expect(revoked.headers?.['Set-Cookie']).toBeUndefined()

    for (const body of [{}, { key: 'short' }, { key: `${'A'.repeat(42)}!` }, { key: 123 }]) {
      const res = await request(byName('display-pair'), { body })
      expect(res.status).toBe(400)
      expect(res.headers?.['Set-Cookie']).toBeUndefined()
    }
  })

  it('pairing is a POST and needs no sign-in', () => {
    expect(byName('display-pair').methods).toEqual(['POST'])
    expect(byName('display-pair').route).toBe('display/pair')
  })
})

describe('display key: what it opens', () => {
  it('there is a GET alias under display/ for exactly what the wall page reads', () => {
    const aliases = registered.filter((r) => r.route.startsWith('display/') && r.name !== 'display-pair' && !r.name.startsWith('display-devices'))
    expect(aliases.map((r) => r.name).sort()).toEqual(DISPLAY_CAN_READ.map(aliasFor).sort())
    for (const r of aliases) expect(r.methods).toEqual(['GET'])
  })

  it.each(DISPLAY_CAN_READ)('the key reads display/%s', async (name) => {
    const { key } = await newKey()
    const res = await request(byName(aliasFor(name)), { cookie: cookieFor(key) })
    expect(res.status).toBe(200)
  })

  it('no key and no sign-in is NOT_PAIRED, never 401 (SWA would redirect a 401)', async () => {
    const res = await request(byName(aliasFor('tasks-get')))
    expect(res.status).toBe(403)
    expect(res.jsonBody?.code).toBe('NOT_PAIRED')
  })

  it('a wrong key is NOT_PAIRED', async () => {
    await newKey()
    const res = await request(byName(aliasFor('tasks-get')), { cookie: cookieFor('B'.repeat(43)) })
    expect(res.status).toBe(403)
    expect(res.jsonBody?.code).toBe('NOT_PAIRED')
  })

  it('the key opens nothing outside display/: other routes still need a sign-in', async () => {
    const { key } = await newKey()
    for (const r of registered.filter((x) => !x.route.startsWith('display') && x.route.split('/')[0] !== 'integration')) {
      expect((await request(r, { cookie: cookieFor(key) })).status, r.name).toBe(401)
    }
  })

  it('the display caller has the display role, so it cannot write even if a route slipped through', async () => {
    const { key } = await newKey()
    const res = await request(byName(aliasFor('me-get')), { cookie: cookieFor(key) })
    expect(res.jsonBody?.role).toBe('display')
  })

  it('a signed-in member can still open the wall page through the aliases', async () => {
    const res = await request(byName(aliasFor('tasks-get')), { principal: principal('dev-charlie', 'charlie@example.com') })
    expect(res.status).toBe(200)
  })

  it('an uninvited account is still refused on the aliases', async () => {
    const res = await request(byName(aliasFor('tasks-get')), { principal: principal('x', 'stranger@example.com') })
    expect(res.status).toBe(403)
    expect(res.jsonBody?.code).toBe('NOT_A_MEMBER')
  })

  it('the key in the cookie must be the whole cookie value, not a prefix', async () => {
    const { key } = await newKey()
    expect((await request(byName(aliasFor('tasks-get')), { cookie: `${DISPLAY_COOKIE}=${key}x` })).status).toBe(403)
    expect((await request(byName(aliasFor('tasks-get')), { cookie: `x${DISPLAY_COOKIE}=${key}` })).status).toBe(403)
  })
})

describe('display key: staying paired', () => {
  it('renews the cookie and last seen at most once a day', async () => {
    const { id, key } = await newKey()
    const first = await request(byName(aliasFor('tasks-get')), { cookie: cookieFor(key) })
    expect(first.headers?.['Set-Cookie']).toContain(`${DISPLAY_COOKIE}=${key}`)
    const seen = (await store.get<DisplayDevice>('home', id, 'displayDevice'))?.lastSeenAt
    expect(seen).toBeTruthy()

    const second = await request(byName(aliasFor('tasks-get')), { cookie: cookieFor(key) })
    expect(second.headers?.['Set-Cookie']).toBeUndefined()

    const doc = (await store.get<DisplayDevice>('home', id, 'displayDevice'))!
    await store.upsert({ ...doc, lastSeenAt: new Date(Date.now() - 25 * 3600_000).toISOString() })
    const later = await request(byName(aliasFor('tasks-get')), { cookie: cookieFor(key) })
    expect(later.headers?.['Set-Cookie']).toContain(`${DISPLAY_COOKIE}=${key}`)
  })

  it('a member reading the aliases gets no display cookie', async () => {
    const res = await request(byName(aliasFor('tasks-get')), { principal: principal('dev-charlie', 'charlie@example.com') })
    expect(res.headers?.['Set-Cookie']).toBeUndefined()
  })
})

describe('display key: the edge (staticwebapp.config.json)', () => {
  const { routes } = JSON.parse(readFileSync(`${__dirname}/../../staticwebapp.config.json`, 'utf8')) as { routes: { route: string; allowedRoles?: string[] }[] }
  const at = (route: string) => routes.findIndex((r) => r.route === route)
  it('opens the wall page shells and the display API, before the catch-all rules', () => {
    for (const r of ['/display', '/display/pair', '/api/display/*']) {
      expect(routes[at(r)]?.allowedRoles).toEqual(['anonymous', 'authenticated'])
    }
    expect(at('/api/display/*')).toBeLessThan(at('/api/*'))
    expect(at('/display')).toBeLessThan(at('/*'))
    expect(at('/display/pair')).toBeLessThan(at('/*'))
  })
  it('opens no other page to anonymous visitors', () => {
    const pages = routes.filter((r) => !r.route.startsWith('/api') && r.allowedRoles?.includes('anonymous')).map((r) => r.route)
    expect(pages).toEqual(['/.auth/*', '/login', '/not-a-member', '/assets/*', '/icons/*', '/manifest.webmanifest', '/sw.js', '/display', '/display/pair'])
  })
})

void charlie
