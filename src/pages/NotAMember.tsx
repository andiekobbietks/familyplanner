import { Navigate, useSearchParams } from 'react-router-dom'
import { usePrincipal } from '../auth'

/**
 * Signing in and out both return to the previous page, so this page has to
 * move anyone who no longer belongs on it. `?from=api` means the API refused
 * them despite a role in the session (a removed member): staying put is what
 * stops a redirect loop with the home page.
 */
export function NotAMember() {
  const { data, isLoading } = usePrincipal()
  const [params] = useSearchParams()
  if (isLoading) return <div className="loading">Loading…</div>
  if (!data) return <Navigate to="/login" replace />
  const hasRole = data.userRoles.includes('member') || data.userRoles.includes('admin')
  if (hasRole && !params.has('from')) return <Navigate to="/" replace />

  return (
    <div className="auth">
      <div className="card">
        <img className="logo" src="/icons/icon.svg" alt="" />
        <h1>Not a member of this family</h1>
        <p className="muted">You have signed in, but this account has not been invited to the family planner. Ask a parent for an invitation link, then sign in again with the same account.</p>
        <a className="btn" href="/.auth/logout?post_logout_redirect_uri=/login" style={{ width: '100%' }}>
          Sign out
        </a>
      </div>
    </div>
  )
}
