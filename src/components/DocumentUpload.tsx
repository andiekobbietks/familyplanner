import { useRef, useState, type ChangeEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations } from '../api/hooks'
import type { DocPageImage, FamilyDocument } from '../api/types'
import { MAX_PAGES, prepareImage, preparePhoto } from '../lib/images'
import { isPdf, openPdf, titleFromFileName, tooManyPages } from '../lib/pdf'
import { Icon } from './Icons'
import { Modal } from './Modal'
import { useToast } from './Toast'

type Prepared = { key: string; page: DocPageImage; thumb: string }

/**
 * Photos chosen or taken on the phone, or a PDF, shrunk in the browser as they are picked, so the preview is
 * ready and the upload is small. Each page of a PDF becomes a page here, just as a photo does. With no `document`, it also asks for a title and description and creates one.
 * Pages go up one at a time; if one fails, the ones before it are kept and the error says so.
 */
export function DocumentUpload({ document, onClose, onDone }: { document?: FamilyDocument; onClose: () => void; onDone: (d: FamilyDocument) => void }) {
  const [photos, setPhotos] = useState<Prepared[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string>()
  const [preparing, setPreparing] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const busy = !!status

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    const add = ({ page, thumb }: { page: DocPageImage; thumb?: string }) =>
      setPhotos((p) => [...p, { key: `${Date.now()}-${Math.random()}`, page, thumb: thumb! }])
    // Pages already in the document or picked, so a PDF that won't fit is refused before any page is drawn.
    let taken = (document?.pageIds.length ?? 0) + photos.length
    setPreparing((n) => n + files.length)
    for (const file of files) {
      // How many of this file's pages still count as "Preparing…".
      let pending = 1
      try {
        if (isPdf(file)) {
          const pdf = await openPdf(file)
          try {
            const refused = tooManyPages(pdf.numPages, MAX_PAGES - taken, MAX_PAGES)
            if (refused) throw new Error(refused)
            if (!document) setTitle((t) => t || titleFromFileName(file.name))
            setPreparing((n) => n + pdf.numPages - 1)
            pending = pdf.numPages
            for (let n = 1; n <= pdf.numPages; n++) {
              add(prepareImage(await pdf.render(n), true))
              taken++
              pending--
              setPreparing((c) => c - 1)
            }
          } finally {
            pdf.close()
          }
        } else {
          add(await preparePhoto(file, true))
          taken++
        }
      } catch (err) {
        toast(`${file.name}: ${(err as Error).message}`)
      } finally {
        setPreparing((n) => n - pending)
      }
    }
  }

  const save = async () => {
    let doc = document
    try {
      if (!doc) {
        setStatus('Saving…')
        doc = await mutations.createDocument({ title: title.trim(), description: description.trim(), thumb: photos[0]?.thumb })
      }
      for (const [i, p] of photos.entries()) {
        setStatus(`Uploading page ${i + 1} of ${photos.length}…`)
        try {
          doc = await mutations.addDocPage(doc.id, p.page)
        } catch (err) {
          toast(`Page ${i + 1} didn't upload (${(err as Error).message}). The pages before it are saved; add the rest from the document.`)
          break
        }
      }
      await qc.invalidateQueries({ queryKey: ['documents'] })
      onDone(doc)
    } catch (err) {
      toast((err as Error).message)
      setStatus(undefined)
    }
  }

  const ready = photos.length > 0 && preparing === 0 && (document || title.trim())
  return (
    <Modal
      title={document ? 'Add pages' : 'New document'}
      onClose={busy ? () => {} : onClose}
      footer={
        <button className="btn primary" type="button" onClick={save} disabled={!ready || busy}>
          {status ?? (document ? `Add ${photos.length || ''} page${photos.length === 1 ? '' : 's'}` : 'Save')}
        </button>
      }
    >
      {/* No `capture`, so a phone offers the camera, the photo library and its files (for a PDF). */}
      <input ref={input} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={choose} />
      <div className="doc-picks">
        {photos.map((p, i) => (
          <figure key={p.key} className="doc-pick">
            <img src={`data:image/jpeg;base64,${p.thumb}`} alt={`Page ${i + 1}`} />
            {!busy && (
              <button type="button" className="doc-pick-remove" aria-label={`Remove page ${i + 1}`} onClick={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))}>
                <Icon name="close" size={16} />
              </button>
            )}
            <figcaption>{i + 1}</figcaption>
          </figure>
        ))}
        <button type="button" className="doc-pick doc-pick-add" onClick={() => input.current?.click()} disabled={busy}>
          <Icon name="camera" size={28} />
          {preparing > 0 ? 'Preparing…' : photos.length ? 'Add page' : 'Take or choose photos, or a PDF'}
        </button>
      </div>
      {!document && (
        <>
          <label className="field">
            <span>Title</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Boiler warranty" disabled={busy} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} disabled={busy} placeholder="Who it's from, dates, reference or model numbers…" />
          </label>
          <p className="muted small">The pages aren't read, so the title and description are how you and the chat assistant will find this later. Put in the words you'd search for.</p>
        </>
      )}
    </Modal>
  )
}
