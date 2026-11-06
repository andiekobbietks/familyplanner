import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getCaller, familyId } from './caller'
import { HttpError } from './errors'
import type { Store } from './store'
import type { Caller, DisplayDevice } from './types'

/**
 * S34: a wall display authenticates with its own key instead of a Microsoft
 * sign-in. The key is 32 random bytes (base64url), held by the display in an
 * HttpOnly, Secure, SameSite=Strict, __Host- cookie. The store keeps only its
 * SHA-256. The key is accepted only on the /api/display/* aliases, which read
 * what the wall page shows, and it makes the caller the read-only display role.
 */
export const DISPLAY_COOKIE = '__Host-DisplayKey'
/** Gecko and Chrome cap cookie lifetimes at 400 days. Renewed daily while in use (RENEW_MS). */
const MAX_AGE_S = 400 * 24 * 3600
const RENEW_MS = 24 * 3600_000
const KEY_RE = /^[A-Za-z0-9_-]{43}$/

export const notPaired = () => new HttpError(403, 'NOT_PAIRED', 'This display is not paired')

export const newDisplayKey = (): string => randomBytes(32).toString('base64url')
export const hashDisplayKey = (key: string): string => createHash('sha256').update(key).digest('hex')

export const displayCookie = (key: string) => `${DISPLAY_COOKIE}=${key}; Path=/; Max-Age=${MAX_AGE_S}; Secure; HttpOnly; SameSite=Strict`

/** The display key from a Cookie header, only if it is exactly one well-formed key. */
export function readDisplayKey(cookieHeader: string | null | undefined): string | undefined {
  if (!cookieHeader) return undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== DISPLAY_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    return KEY_RE.test(value) ? value : undefined
  }
  return undefined
}

/** The active device whose key this is, compared in constant time. */
export async function findDisplayDevice(store: Store, key: string): Promise<DisplayDevice | undefined> {
  const want = Buffer.from(hashDisplayKey(key), 'hex')
  const devices = await store.byType<DisplayDevice>(familyId(), 'displayDevice')
  let match: DisplayDevice | undefined
  for (const d of devices) {
    if (!d.active || d.keyHash.length !== 64) continue
    if (timingSafeEqual(Buffer.from(d.keyHash, 'hex'), want)) match = d
  }
  return match
}

/**
 * The caller on a /api/display/* alias. A signed-in member is resolved as usual (S6),
 * so anyone in the family can open the wall page. Otherwise the display key decides.
 * Answers 403 NOT_PAIRED, never 401, because SWA turns a 401 into a sign-in redirect.
 * Returns a cookie to send back when the daily renewal is due.
 */
export async function displayCaller(
  principalHeader: string | null | undefined,
  cookieHeader: string | null | undefined,
  store: Store,
  now: Date,
): Promise<{ caller: Caller; setCookie?: string }> {
  if (principalHeader) return { caller: await getCaller(principalHeader, store) }

  const key = readDisplayKey(cookieHeader)
  if (!key) throw notPaired()
  const device = await findDisplayDevice(store, key)
  if (!device) throw notPaired()

  let setCookie: string | undefined
  if (!device.lastSeenAt || now.getTime() - Date.parse(device.lastSeenAt) >= RENEW_MS) {
    await store.upsert({ ...device, lastSeenAt: now.toISOString() })
    setCookie = displayCookie(key)
  }
  return {
    caller: { memberId: `display:${device.id}`, role: 'display', familyId: familyId(), displayName: device.name },
    setCookie,
  }
}
