import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useMe, useMembers } from '../api/hooks'
import { Avatar } from '../components/People'
import { useToast } from '../components/Toast'
import { fmtDay } from '../lib/dates'

export function Members() {
  const { data: members = [] } = useMembers()
  const { data: me } = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [instructions, setInstructions] = useState('')
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['members'] })
    void qc.invalidateQueries({ queryKey: ['people'] })
  }

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await mutations.invite(email.trim(), role)
      setInstructions(r.instructions)
      setEmail('')
      invalidate()
    } catch (err) {
      toast((err as Error).message)
    }
  }

  return (
    <>
      <h1>Members</h1>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} style={m.active ? undefined : { opacity: 0.5 }}>
                <td>
                  <span className="row">
                    <Avatar person={m} /> {m.displayName}
                  </span>
                </td>
                <td>{m.email}</td>
                <td>
                  <span className={`pill ${m.role === 'admin' ? '' : 'grey'}`}>{m.role}</span>
                  {!m.active && <span className="pill grey"> removed</span>}
                </td>
                <td className="muted small">{m.lastLoginAt ? fmtDay(m.lastLoginAt.slice(0, 10)) : 'Never'}</td>
                <td>
                  {m.active && m.id !== me?.id && (
                    <button
                      className="btn sm danger"
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Remove ${m.displayName}? Their past actions stay attributed. Remember to also remove their role in the Azure portal.`)) return
                        await mutations.removeMember(m.id)
                        invalidate()
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={invite}>
        <h2>Invite a member</h2>
        <div className="form-grid">
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={!email.trim()}>
          Record invitation
        </button>
        {instructions && <p className="small warn" style={{ marginTop: '0.75rem' }}>{instructions}</p>}
        <p className="muted small" style={{ marginTop: '0.75rem' }}>
          Access itself is granted by Static Web Apps: the invitation link comes from the Azure portal and expires after 24 hours. This form pre-registers the member so their name and colour are ready on first login.
        </p>
      </form>
    </>
  )
}
