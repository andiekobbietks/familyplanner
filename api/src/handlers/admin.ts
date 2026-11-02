import { badRequest, notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { eraseSchema, inviteSchema, parse, settingsPatchSchema } from '../lib/schemas'
import type { List, Member, Settings } from '../lib/types'
import { memberColour, PALETTE } from '../lib/caller'
import { stamp, touch } from '../lib/util'

export const getSettings: Handler = async ({ store, caller }) => {
  const s = await store.get<Settings>(caller.familyId, 'settings', 'settings')
  return { body: s ?? { breakfastEnabled: false, defaultListId: undefined } }
}

export const patchSettings: Handler = async ({ store, caller }, _p, _q, body) => {
  const patch = parse(settingsPatchSchema, body)
  if (patch.defaultListId) {
    const list = await store.get<List>(caller.familyId, patch.defaultListId, 'list')
    if (!list) throw badRequest('Unknown list')
  }
  const existing = await store.get<Settings>(caller.familyId, 'settings', 'settings')
  const fields = { breakfastEnabled: patch.breakfastEnabled ?? existing?.breakfastEnabled ?? false, defaultListId: patch.defaultListId === null ? undefined : (patch.defaultListId ?? existing?.defaultListId) }
  const saved = existing ? await store.upsert(touch(caller, existing, fields)) : await store.upsert(stamp(caller, 'settings', fields, 'settings'))
  return { body: saved }
}

export const getMembers: Handler = async ({ store, caller }) => {
  const members = await store.byType<Member>(caller.familyId, 'member')
  members.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return { body: members.map(({ providerUserId: _pid, ...m }) => ({ ...m, colour: memberColour(m.colour) })) }
}

/** The member document is the invitation (S3). It links to the account on first sign-in with this email. */
export const invite: Handler = async ({ store, caller }, _p, _q, body) => {
  const { email, role } = parse(inviteSchema, body)
  const members = await store.byType<Member>(caller.familyId, 'member')
  const existing = members.find((m) => m.email.toLowerCase() === email)
  if (existing?.active) throw badRequest('Already a member')
  const member = existing
    ? await store.upsert(touch(caller, existing, { active: true, role }))
    : await store.upsert(
        stamp(caller, 'member', { displayName: email.split('@')[0], email, role, colour: PALETTE[members.length % PALETTE.length], active: true }),
      )
  return {
    status: 201,
    body: {
      member,
      instructions: `Ask ${email} to sign in to this site with the Microsoft account for that address.`,
    },
  }
}

/** Revokes access on their next request (S17); history stays attributed. */
export const removeMember: Handler = async ({ store, caller }, params) => {
  const member = await store.get<Member>(caller.familyId, params.id, 'member')
  if (!member) throw notFound('Member not found')
  if (member.id === caller.memberId) throw badRequest('You cannot remove yourself')
  await store.upsert(touch(caller, member, { active: false }))
  return { status: 204 }
}

export const exportAll: Handler = async ({ store, caller, now }) => {
  const types = ['member', 'event', 'list', 'item', 'task', 'meal', 'plan', 'recipe', 'chore', 'choreWeek', 'settings'] as const
  const out: Record<string, unknown> = { exportedAt: now.toISOString(), familyId: caller.familyId }
  for (const t of types) out[t] = await store.byType(caller.familyId, t)
  return { body: out }
}

/** S29: one action empties the family's data, keeping only the caller's member so an admin can still sign in. */
export const erase: Handler = async ({ store, caller }, _p, _q, body) => {
  parse(eraseSchema, body)
  const me = await store.get<Member>(caller.familyId, caller.memberId, 'member')
  await store.deleteAll(caller.familyId)
  if (me) await store.upsert(me)
  return { status: 204 }
}
