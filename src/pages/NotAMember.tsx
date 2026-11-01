import { Navigate, useSearchParams } from 'react-router-dom'
import { usePrincipal } from '../auth'

/**
 * Only the API's refusal (`?from=api`) proves someone is not a member. Anyone
 * else arriving here, such as back from signing in, goes home to be rechecked.
 */
export function NotAMember() {
  const { data, isLoading } = usePrincipal()
  const [params] = useSearchParams()
  if (isLoading) return <div className="loading">Loading…</div>
  if (!data) return <Navigate to="/login" replace />
  if (!params.has('from')) return <Navigate to="/" replace />

  return (
    <div className="auth">
      <div className="card">
        <img className="logo" src="/icons/icon.svg" alt="" />
        <h1>Not a member of this family</h1>
        <p className="muted">You have signed in, but this account has not been invited to the family planner. Ask a parent to add your email on the Members page, then try again.</p>
        <a className="btn primary" href="/" style={{ width: '100%', marginBottom: '0.5rem' }}>
          Try again
        </a>
        <a className="btn" href="/.auth/logout?post_logout_redirect_uri=/login" style={{ width: '100%' }}>
          Sign out
        </a>
      </div>
    </div>
  )
}
