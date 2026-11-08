import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDocuments } from '../api/hooks'
import { DocumentUpload } from '../components/DocumentUpload'
import { Icon } from '../components/Icons'
import { dateOfInstant, fmtDay } from '../lib/dates'
import { matchesDocument } from '../lib/images'

/** The family's document store: photographed paperwork, found by its title and description. */
export function Documents() {
  const { data: docs = [], isLoading } = useDocuments()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const shown = docs.filter((d) => matchesDocument(d, search))

  return (
    <>
      <div className="page-head">
        <h1 className="grow">Documents</h1>
        <button className="btn sm primary" type="button" onClick={() => setAdding(true)}>
          <Icon name="camera" size={18} />
          Add
        </button>
      </div>

      {docs.length > 0 && (
        <input className="recipe-search notes-search" type="search" aria-label="Search documents" placeholder="Search titles and descriptions…" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}

      <div className="card">
        {isLoading && <p className="loading">Loading…</p>}
        {!isLoading && docs.length === 0 && <p className="empty">No documents yet. Photograph a letter, warranty or certificate and give it a title you'd search for.</p>}
        {!isLoading && docs.length > 0 && shown.length === 0 && <p className="empty">Nothing matches.</p>}
        <ul className="list">
          {shown.map((d) => (
            <li key={d.id}>
              <Link className="doc-row" to={`/documents/${d.id}`}>
                <span className="doc-thumb">{d.thumb ? <img src={`data:image/jpeg;base64,${d.thumb}`} alt="" /> : <Icon name="doc" size={26} />}</span>
                <span className="doc-text">
                  <b>{d.title}</b>
                  {d.description && <span className="doc-desc">{d.description}</span>}
                  <span className="sub">
                    {fmtDay(dateOfInstant(d.createdAt))} · {d.pageIds.length} page{d.pageIds.length === 1 ? '' : 's'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {adding && <DocumentUpload onClose={() => setAdding(false)} onDone={(d) => navigate(`/documents/${d.id}`)} />}
    </>
  )
}
