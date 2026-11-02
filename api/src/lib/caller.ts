import { createHash, timingSafeEqual } from 'node:crypto'
import { HttpError } from './errors'
import type { Store } from './store'
import type { Caller, Member } from './types'
import { nowIso } from './util'

interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

/** No blue and pink, which read as boy and girl. White text on each of these meets 4.5:1 (section 8). */
export const PALETTE = ['#0f766e', '#b45309', '#4d7c0f', '#0e7490', '#a16207', '#7c3aed', '#57534e', '#b91c1c']

/** The two old defaults, as saved on existing members. Swapped when read, since a member's own choice is otherwise left alone. */
const RETIRED: Record<string, string> = { '#2563eb': PALETTE[0], '#db2777': PALETTE[1] }
export const memberColour = (colour: string) => RETIRED[colour.toLowerCase()] ?? colour

export function familyId(): string {
  return process.env.FAMILY_ID ?? 'home'
}

/** Role names only, for the auth failure log. Never log the header itself (S23). */
export function principalRoles(principalHeader: string | null | undefined): string {
  try {
    return (JSON.parse(Buffer.from(principalHeader ?? '', 'base64').toString('utf8')).userRoles ?? []).join(',') || 'none'
  } catch {
    return 'unreadable'
  }
}

/**
 * The single place that turns a request into a caller (section 6, S6).
 * Static Web Apps says who is signed in; the member documents say who belongs
 * and with what role (S3). SWA invitation roles are not used because they were
 * intermittently missing from sessions. An invited member has an email and no
 * providerUserId until first sign-in, which is the only time email can match:
 * a linked member cannot be claimed by another account using the same email.
 */
export async function getCaller(principalHeader: string | null | undefined, store: Store): Promise<Caller> {
  if (!principalHeader) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in required')

  let principal: ClientPrincipal
  try {
    principal = JSON.parse(Buffer.from(principalHeader, 'base64').toString('utf8'))
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Bad principal')
  }

  const fid = familyId()
  const email = (principal.userDetails ?? '').toLowerCase()
  const members = await store.byType<Member>(fid, 'member')
  const mine = members.filter((m) => m.providerUserId === principal.userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const extra of mine.slice(1)) await store.delete(fid, extra.id)
  const member = mine[0] ?? (email ? members.find((m) => !m.providerUserId && m.email.toLowerCase() === email) : undefined)

  if (!member) throw new HttpError(403, 'NOT_A_MEMBER', 'This account is not a member of the family')
  if (!member.active) throw new HttpError(403, 'MEMBER_REMOVED', 'This account has been removed from the family')

  const stale = !member.lastLoginAt || Date.now() - Date.parse(member.lastLoginAt) > 60 * 60 * 1000
  if (member.providerUserId !== principal.userId || stale) {
    await store.upsert({ ...member, providerUserId: principal.userId, lastLoginAt: nowIso() })
  }

  return { memberId: member.id, role: member.role, familyId: fid, displayName: member.displayName }
}

const digest = (s: string) => createHash('sha256').update(s).digest()

/**
 * The caller for a service on the home server (section 15.4). SWA has no login for a machine, so a route
 * marked `integration` is open at the edge and this token is all that guards it. With no token set, or
 * one too short to be safe, every request is refused. Answers 403 because SWA turns a 401 into a redirect.
 */
export function integrationCaller(tokenHeader: string | null | undefined): Caller {
  const expected = process.env.INTEGRATION_TOKEN
  if (!expected || expected.length < 32 || !tokenHeader || !timingSafeEqual(digest(tokenHeader), digest(expected))) {
    throw new HttpError(403, 'BAD_TOKEN', 'Not allowed')
  }
  return { memberId: 'integration', role: 'member', familyId: familyId(), displayName: 'Integration' }
}
