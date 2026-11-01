import { HttpError } from './errors'
import type { Store } from './store'
import type { Caller, Member, Role } from './types'
import { nowIso } from './util'

interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

export const PALETTE = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626']

export function familyId(): string {
  return process.env.FAMILY_ID ?? 'home'
}

/**
 * The single place that turns a request into a caller (section 6, S6).
 * Static Web Apps is the authority on who is invited and with what role;
 * the member document only carries display name, colour and history.
 * In v2 a service credential for the home server is added here and nowhere else.
 */
export async function getCaller(principalHeader: string | null | undefined, store: Store): Promise<Caller> {
  if (!principalHeader) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in required')

  let principal: ClientPrincipal
  try {
    principal = JSON.parse(Buffer.from(principalHeader, 'base64').toString('utf8'))
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Bad principal')
  }

  const roles = principal.userRoles ?? []
  const role: Role | null = roles.includes('admin') ? 'admin' : roles.includes('member') ? 'member' : null
  if (!role) throw new HttpError(403, 'NOT_A_MEMBER', 'This account is not a member of the family')

  const fid = familyId()
  const email = (principal.userDetails ?? '').toLowerCase()
  const members = await store.byType<Member>(fid, 'member')
  const mine = members.filter((m) => m.providerUserId === principal.userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const extra of mine.slice(1)) await store.delete(fid, extra.id)
  let member = mine[0] ?? (email ? members.find((m) => m.email.toLowerCase() === email) : undefined)

  const now = nowIso()
  if (!member) {
    // A first page load sends several requests at once. A fixed id makes them all write the same member.
    member = {
      id: `member-${principal.userId}`,
      familyId: fid,
      type: 'member',
      displayName: email.split('@')[0] || 'New member',
      email,
      role,
      colour: PALETTE[members.length % PALETTE.length],
      active: true,
      providerUserId: principal.userId,
      lastLoginAt: now,
      createdAt: now,
      createdBy: 'system',
      updatedAt: now,
      updatedBy: 'system',
    }
    await store.upsert(member)
  } else if (!member.active) {
    throw new HttpError(403, 'MEMBER_REMOVED', 'This account has been removed from the family')
  } else {
    const stale = !member.lastLoginAt || Date.now() - Date.parse(member.lastLoginAt) > 60 * 60 * 1000
    if (member.providerUserId !== principal.userId || member.role !== role || stale) {
      await store.upsert({ ...member, providerUserId: principal.userId, role, lastLoginAt: now })
    }
  }

  return { memberId: member.id, role, familyId: fid, displayName: member.displayName }
}
