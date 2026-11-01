import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

async function fetchPrincipal(): Promise<ClientPrincipal | null> {
  const res = await fetch('/.auth/me', { credentials: 'same-origin' })
  if (!res.ok) return null
  const data = (await res.json()) as { clientPrincipal: ClientPrincipal | null }
  return data.clientPrincipal
}

export const usePrincipal = () => useQuery({ queryKey: ['principal'], queryFn: fetchPrincipal, staleTime: 5 * 60_000 })

/**
 * Client-side gate. In production the SWA route rules already send an
 * unauthenticated visitor to login before any HTML is served; this keeps the
 * SPA honest about the same states (logged out, signed in but not invited).
 */
export function RequireMember({ children }: { children: ReactNode }) {
  const { data, isLoading } = usePrincipal()
  const loc = useLocation()
  if (isLoading) return <div className="loading">Loading…</div>
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  const ok = data.userRoles.includes('member') || data.userRoles.includes('admin')
  if (!ok) return <Navigate to="/not-a-member" replace />
  return <>{children}</>
}
