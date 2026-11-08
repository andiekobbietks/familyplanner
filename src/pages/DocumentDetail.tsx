import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { mutations, useDocPage, useDocuments } from '../api/hooks'
import type { FamilyDocument } from '../api/types'
import { DocumentUpload } from '../components/DocumentUpload'
import { Icon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { usePersonMap } from '../components/People'
import { useToast } from '../components/Toast'
import { dateOfInstant, fmtDay } from '../lib/dates'
import { dataUrl } from '../lib/images'

export function DocumentDetail() {
  const { id = '' } = useParams()
  const { data: docs, isLoading } = useDocuments()
  const people = usePersonMap()
  const [sheet, setSheet] = useState<'edit' | 'add' | null>(null)
  const doc = docs?.find((d) => d.id === id)

  const back = (
    <Link className="back-link" to="/documents">
      <Icon name="left" size={18} />
      Documents
    </Link>
  )
  if (isLoading) return <p className="loading">Loading…</p>
  if (!doc) {
    return (
      <>
        {back}
        <p className="empty">This document has gone.</p>
      </>
    )
  }

  return (
    <>
      {back}
      <header className="recipe-head">
        <h1>{doc.title}</h1>
        <p className="muted recipe-meta">
          Added {fmtDay(dateOfInstant(doc.createdAt))}
          {people.get(doc.createdBy) && ` by ${people.get(doc.createdBy)!.displayName}`} · {doc.pageIds.length} page{doc.pageIds.length === 1 ? '' : 's'}
        </p>
        {doc.description && <p className="note-body">{doc.description}</p>}
      </header>

      <div className="recipe-actions">
        <button className="btn sm" type="button" onClick={() => setSheet('add')}>
          <Icon name="camera" size={18} />
          Add pages
        </button>
        <button className="btn sm" type="button" onClick={() => setSheet('edit')}>
          <Icon name="edit" size={18} />
          Edit
        </button>
      </div>

      {doc.pageIds.length === 0 && <p className="empty">No pages yet.</p>}
      {doc.pageIds.map((pageId, i) => (
        <Page key={pageId} doc={doc} pageId={pageId} number={i + 1} />
      ))}

      {sheet === 'add' && <DocumentUpload document={doc} onClose={() => setSheet(null)} onDone={() => setSheet(null)} />}
      {sheet === 'edit' && <DocumentEditor doc={doc} onClose={() => setSheet(null)} />}
    </>
  )
}

/** One page, loaded when the document is opened. Tapping it opens the full-size picture to zoom into. */
function Page({ doc, pageId, number }: { doc: FamilyDocument; pageId: string; number: number }) {
  const { data, isError } = useDocPage(doc.id, pageId)
  const [full, setFull] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()

  const remove = async () => {
    if (!confirm(`Delete page ${number}?`)) return
    try {
      await mutations.deleteDocPage(doc.id, pageId)
      await qc.invalidateQueries({ queryKey: ['documents'] })
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <figure className="card doc-page">
      {data ? (
        <button type="button" className="doc-page-img" aria-label={`Page ${number}, full size`} onClick={() => setFull(true)}>
          <img src={dataUrl(data)} alt={`${doc.title}, page ${number}`} />
        </button>
      ) : (
        <p className="loading">{isError ? "This page couldn't be loaded." : 'Loading page…'}</p>
      )}
      <figcaption className="doc-page-foot">
        <span className="grow muted small">
          Page {number} of {doc.pageIds.length}
        </span>
        <button type="button" className="icon-btn" aria-label={`Delete page ${number}`} onClick={remove}>
          <Icon name="close" size={18} />
        </button>
      </figcaption>
      {full && data && (
        <div className="doc-full" role="dialog" aria-modal="true" aria-label={`Page ${number}`} onClick={() => setFull(false)}>
          <img src={dataUrl(data)} alt={`${doc.title}, page ${number}`} />
          <button type="button" className="doc-full-close" aria-label="Close" onClick={() => setFull(false)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </figure>
  )
}

function DocumentEditor({ doc, onClose }: { doc: FamilyDocument; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title)
  const [description, setDescription] = useState(doc.description)
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()

  const save = async () => {
    try {
      await mutations.patchDocument(doc.id, { title: title.trim(), description: description.trim() })
      await qc.invalidateQueries({ queryKey: ['documents'] })
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }
  const remove = async () => {
    if (!confirm(`Delete ${doc.title} and all ${doc.pageIds.length} of its pages?`)) return
    try {
      await mutations.deleteDocument(doc.id)
      await qc.invalidateQueries({ queryKey: ['documents'] })
      navigate('/documents')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Modal
      title="Edit document"
      onClose={onClose}
      footer={
        <>
          <button className="btn danger" type="button" onClick={remove}>
            Delete
          </button>
          <button className="btn primary" type="button" onClick={save} disabled={!title.trim()}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} />
      </label>
      <p className="muted small">The chat assistant finds documents by these words only.</p>
    </Modal>
  )
}
