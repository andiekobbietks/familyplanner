import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useMe, useMembers } from '../api/hooks'
import type { Role } from '../api/types'
import { Avatar } from '../components/People'
import { useToast } from '../components/Toast'
import { fmtDay } from '../lib/dates'

export function Members() {
  const { data: members = [] } = useMembers()
  const { data: me } = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
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
                        if (!confirm(`Remove ${m.displayName}? Their past actions stay attributed.`)) return
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
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="display">Display (wall screen, read-only)</option>
            </select>
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={!email.trim()}>
          Record invitation
        </button>
        {instructions && <p className="small warn" style={{ marginTop: '0.75rem' }}>{instructions}</p>}
        <p className="muted small" style={{ marginTop: '0.75rem' }}>
          This record is the invitation: they sign in with the Microsoft account for that address, and nothing is needed in the Azure portal. A display account sees only the wall page and can't change anything, use chat or see members.
        </p>
      </form>
    </>
  )
}
