import { useEffect, useState } from 'react'
import { mutations } from '../api/hooks'

/**
 * Pairs a wall display (S34). Opened once on the display with the link an admin
 * copied from Members: /display/pair#k=<key>. The key sits after the #, so it is never
 * sent in a request line or logged; the page clears it from the address straight away,
 * presents it once, and the API answers with the display's cookie.
 */
export function DisplayPair() {
  const [state, setState] = useState<'pairing' | 'failed'>('pairing')

  useEffect(() => {
    const key = new URLSearchParams(window.location.hash.slice(1)).get('k') ?? ''
    window.history.replaceState(null, '', '/display/pair')
    if (!key) {
      setState('failed')
      return
    }
    mutations
      .pairDisplay(key)
      .then(() => window.location.replace('/display'))
      .catch(() => setState('failed'))
  }, [])

  return (
    <div className="wall wall-unpaired">
      {state === 'pairing' ? (
        <h1>Pairing this display…</h1>
      ) : (
        <>
          <h1>This pairing link didn't work</h1>
          <p className="muted">It may have been revoked or copied wrongly. Create a new one under Members, Displays.</p>
        </>
      )}
    </div>
  )
}
