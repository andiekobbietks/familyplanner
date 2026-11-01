export function NotAMember() {
  return (
    <div className="auth">
      <div className="card">
        <img className="logo" src="/icons/icon.svg" alt="" />
        <h1>Not a member of this family</h1>
        <p className="muted">You have signed in, but this account has not been invited to the family planner. Ask a parent for an invitation link, then sign in again with the same account.</p>
        <a className="btn" href="/.auth/logout" style={{ width: '100%' }}>
          Sign out
        </a>
      </div>
    </div>
  )
}
