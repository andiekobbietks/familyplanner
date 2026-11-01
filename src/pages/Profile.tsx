import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations, useMe } from '../api/hooks'
import { Avatar } from '../components/People'
import { useToast } from '../components/Toast'

export function Profile() {
  const { data: me } = useMe()
  const [name, setName] = useState('')
  const [colour, setColour] = useState('#2563eb')
  const qc = useQueryClient()
  const toast = useToast()
  useEffect(() => {
    if (me) {
      setName(me.displayName)
      setColour(me.colour)
    }
  }, [me])

  const save = async () => {
    try {
      await mutations.patchMe({ displayName: name.trim(), colour })
      void qc.invalidateQueries({ queryKey: ['me'] })
      void qc.invalidateQueries({ queryKey: ['people'] })
      toast('Saved')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <>
      <h1>My profile</h1>
      <div className="card">
        <div className="row" style={{ marginBottom: '1rem' }}>
          <Avatar person={me ? { ...me, displayName: name || me.displayName, colour } : undefined} size={48} />
          <div>
            <div>{me?.email}</div>
            <div className="muted small">{me?.role}</div>
          </div>
        </div>
        <label className="field">
          <span>Display name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span>Colour</span>
          <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} />
        </label>
        <button className="btn primary" type="button" onClick={save} disabled={!name.trim()}>
          Save
        </button>
      </div>
      <p className="muted small">Signed in through Microsoft. Passwords are never handled by this app.</p>
      <a className="btn" href="/.auth/logout">
        Log out
      </a>
    </>
  )
}
