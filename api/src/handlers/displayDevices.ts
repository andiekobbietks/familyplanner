import { HttpError, notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { displayCookie, findDisplayDevice, hashDisplayKey, newDisplayKey } from '../lib/displayKey'
import { displayDeviceSchema, displayPairSchema, parse } from '../lib/schemas'
import type { DisplayDevice, Member } from '../lib/types'
import { stamp, touch } from '../lib/util'

/** Admin: create a wall display. The key is returned this once and never again (S34). */
export const createDisplayDevice: Handler = async ({ store, caller }, _p, _q, body) => {
  const { name } = parse(displayDeviceSchema, body)
  const key = newDisplayKey()
  const device = await store.upsert(stamp(caller, 'displayDevice', { name, keyHash: hashDisplayKey(key), active: true }))
  return { status: 201, body: { id: device.id, name: device.name, key } }
}

/** Admin: the family's displays, without keys or hashes. */
export const listDisplayDevices: Handler = async ({ store, caller }) => {
  const [devices, members] = await Promise.all([
    store.byType<DisplayDevice>(caller.familyId, 'displayDevice'),
    store.byType<Member>(caller.familyId, 'member'),
  ])
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? 'Unknown'
  devices.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return {
    body: devices.map((d) => ({
      id: d.id,
      name: d.name,
      active: d.active,
      createdAt: d.createdAt,
      createdBy: nameOf(d.createdBy),
      lastSeenAt: d.lastSeenAt ?? null,
    })),
  }
}

/** Admin: revoke a display. Its next request is refused. The record stays, without its hash. */
export const revokeDisplayDevice: Handler = async ({ store, caller }, params) => {
  const device = await store.get<DisplayDevice>(caller.familyId, params.id, 'displayDevice')
  if (!device) throw notFound('No such display')
  await store.upsert(touch(caller, device, { active: false, keyHash: '' }))
  return { status: 204 }
}

/** The display presents its key once, from the pairing page, and gets it back as a cookie. */
export const pairDisplay: Handler = async ({ store }, _p, _q, body) => {
  const { key } = parse(displayPairSchema, body)
  const device = await findDisplayDevice(store, key)
  if (!device) throw new HttpError(403, 'NOT_PAIRED', 'That display key is not valid')
  return { status: 204, headers: { 'Set-Cookie': displayCookie(key) } }
}
