import { badRequest, notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { eraseSchema, inviteSchema, parse, settingsPatchSchema } from '../lib/schemas'
import type { List, Member, Settings } from '../lib/types'
import { PALETTE } from '../lib/caller'
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
  return { body: members.map(({ providerUserId: _pid, ...m }) => m) }
}

/**
 * Records who is expected. The invitation link itself is issued by Static Web
 * Apps (portal or management API), which is what actually grants the role (S3).
 * The member document created here is linked to the account on first login.
 */
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
      instructions: `Create an invitation in the Azure portal (Static Web App > Role management > Invite) for ${email} with role "${role}". Invitations expire after 24 hours.`,
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
  const types = ['member', 'event', 'list', 'item', 'task', 'meal', 'plan', 'settings'] as const
  const out: Record<string, unknown> = { exportedAt: now.toISOString(), familyId: caller.familyId }
  for (const t of types) out[t] = await store.byType(caller.familyId, t)
  return { body: out }
}

/** S29: one action empties the family's data. The caller is recreated on their next request. */
export const erase: Handler = async ({ store, caller }, _p, _q, body) => {
  parse(eraseSchema, body)
  await store.deleteAll(caller.familyId)
  return { status: 204 }
}
