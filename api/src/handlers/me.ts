import { memberColour } from '../lib/caller'
import type { Handler } from '../lib/http'
import { mePatchSchema, parse } from '../lib/schemas'
import type { Member } from '../lib/types'
import { touch } from '../lib/util'

const publicMember = (m: Member) => ({ id: m.id, displayName: m.displayName, colour: memberColour(m.colour), role: m.role })

export const getMe: Handler = async ({ store, caller }) => {
  const m = (await store.get<Member>(caller.familyId, caller.memberId, 'member'))!
  return { body: { ...publicMember(m), email: m.email } }
}

/** Own display name and colour only. A `role` in the body is stripped by the schema (A12). */
export const patchMe: Handler = async ({ store, caller }, _p, _q, body) => {
  const patch = parse(mePatchSchema, body)
  const m = (await store.get<Member>(caller.familyId, caller.memberId, 'member'))!
  const saved = await store.upsert(touch(caller, m, patch))
  return { body: { ...publicMember(saved), email: saved.email } }
}

/** Active members' public fields, for pickers and colours. Visible to every member. The display is not a person, so it can't be picked. */
export const getPeople: Handler = async ({ store, caller }) => {
  const members = await store.byType<Member>(caller.familyId, 'member')
  return { body: members.filter((m) => m.active && m.role !== 'display').map(publicMember) }
}
