import { Navigate, useSearchParams } from 'react-router-dom'
import { usePrincipal } from '../auth'
import { safeNext } from '../lib/redirect'

export function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { data, isLoading } = usePrincipal()
  if (!isLoading && data) return <Navigate to={next} replace />

  const login = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(next)}`
  return (
    <div className="auth">
      <div className="card">
        <img className="logo" src="/icons/icon.svg" alt="" />
        <h1>FamilyPlanner</h1>
        <p className="muted">Calendar, shopping, to-dos and meals for one household. Invited family members only.</p>
        <a className="btn primary" href={login} style={{ width: '100%', marginTop: '0.5rem' }}>
          Sign in with Microsoft
        </a>
        {import.meta.env.DEV && (
          <p className="devlinks">
            Local dev: sign in as
            <a href={`${login}&as=tim`}>Tim (admin)</a>
            <a href={`${login}&as=jo`}>Jo (admin)</a>
            <a href={`${login}&as=charlie`}>Charlie</a>
            <a href={`${login}&as=robin`}>Robin</a>
            <a href={`${login}&as=display`}>Kitchen display</a>
            <a href={`${login}&as=stranger`}>Stranger</a>
          </p>
        )}
      </div>
    </div>
  )
}
