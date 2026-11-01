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
 * Client-side gate for being signed in. In production the SWA route rules
 * already do this before any HTML is served. Membership is the API's decision:
 * its 403 sends an uninvited account to /not-a-member (api/client.ts).
 */
export function RequireMember({ children }: { children: ReactNode }) {
  const { data, isLoading } = usePrincipal()
  const loc = useLocation()
  if (isLoading) return <div className="loading">Loading…</div>
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return <>{children}</>
}
