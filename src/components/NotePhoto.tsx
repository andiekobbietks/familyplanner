import { useState } from 'react'
import { useNotePhoto } from '../api/hooks'
import type { Note } from '../api/types'
import { dataUrl } from '../lib/images'
import { Icon } from './Icons'

/**
 * A note's photo, such as an appliance's programme chart. Tapping it opens it full screen. With `fit`, as on the
 * wall, the full-screen picture is shrunk to fit the screen whole; otherwise it fills the width and scrolls, for zooming on a phone.
 */
export function NotePhoto({ note, fit = false, className = 'note-photo' }: { note: Note; fit?: boolean; className?: string }) {
  const { data, isError } = useNotePhoto(note)
  const [full, setFull] = useState(false)
  if (!note.photoId) return null
  if (!data) return <p className="muted small">{isError ? "The photo couldn't be loaded." : 'Loading photo…'}</p>
  const src = dataUrl(data)
  return (
    <>
      <button type="button" className={className} aria-label={`${note.title}: photo, full size`} onClick={() => setFull(true)}>
        <img src={src} alt={`${note.title}: photo`} />
      </button>
      {full && (
        <div className={fit ? 'doc-full doc-full-fit' : 'doc-full'} role="dialog" aria-modal="true" aria-label={`${note.title}: photo`} onClick={() => setFull(false)}>
          <img src={src} alt={`${note.title}: photo`} />
          <button type="button" className="doc-full-close" aria-label="Close" onClick={() => setFull(false)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  )
}
