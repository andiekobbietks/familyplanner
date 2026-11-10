import { badRequest, notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { docPageSchema, documentPatchSchema, documentSchema, MAX_PAGES, parse } from '../lib/schemas'
import type { Store } from '../lib/store'
import { looksLike } from '../lib/images'
import type { DocPage, FamilyDocument } from '../lib/types'
import { newId, stamp, touch } from '../lib/util'

/**
 * The family's document store: photos of paperwork with a title and description to find them by.
 * Members only. The wall display can't reach any of it, and nothing here is sent to the chat model but
 * the title and description (see chatTools).
 */

async function findDocument(store: Store, familyId: string, id: string) {
  const doc = await store.get<FamilyDocument>(familyId, id, 'document')
  if (!doc) throw notFound('Document not found')
  return doc
}

/** Newest first. Pages stay out: each is fetched on its own when the document is opened. */
export const getDocuments: Handler = async ({ store, caller }) => {
  const docs = await store.byType<FamilyDocument>(caller.familyId, 'document')
  docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { body: docs }
}

export const createDocument: Handler = async ({ store, caller }, _p, _q, body) => {
  const { thumb, ...data } = parse(documentSchema, body)
  if (thumb && !looksLike('image/jpeg', thumb)) throw badRequest('The thumbnail must be a JPEG')
  const saved = await store.upsert(stamp(caller, 'document', { description: '', ...data, ...(thumb && { thumb }), pageIds: [] as string[] }))
  return { status: 201, body: saved }
}

export const patchDocument: Handler = async ({ store, caller }, params, _q, body) => {
  const doc = await findDocument(store, caller.familyId, params.id)
  const saved = await store.upsert(touch(caller, doc, parse(documentPatchSchema, body)))
  return { body: saved }
}

export const deleteDocument: Handler = async ({ store, caller }, params) => {
  const doc = await findDocument(store, caller.familyId, params.id)
  for (const pageId of doc.pageIds) await store.delete(caller.familyId, pageId)
  await store.delete(caller.familyId, doc.id)
  return { status: 204 }
}

/** Adds one page at the end. One page per request keeps each upload small enough to survive a phone signal. */
export const addPage: Handler = async ({ store, caller }, params, _q, body) => {
  const page = parse(docPageSchema, body)
  if (!looksLike(page.contentType, page.data)) throw badRequest(`That isn't a ${page.contentType.slice(6).toUpperCase()} image`)
  const doc = await findDocument(store, caller.familyId, params.id)
  if (doc.pageIds.length >= MAX_PAGES) throw badRequest(`A document can have at most ${MAX_PAGES} pages`)
  const saved = await store.upsert(stamp(caller, 'docPage', { documentId: doc.id, ...page }, `docpage:${doc.id}:${newId()}`))
  const updated = await store.upsert(touch(caller, doc, { pageIds: [...doc.pageIds, saved.id] }))
  return { status: 201, body: updated }
}

/** A page only through the document that lists it, so a page id alone opens nothing. */
export const getPage: Handler = async ({ store, caller }, params) => {
  const doc = await findDocument(store, caller.familyId, params.id)
  const page = doc.pageIds.includes(params.pageId) ? await store.get<DocPage>(caller.familyId, params.pageId, 'docPage') : undefined
  if (!page || page.documentId !== doc.id) throw notFound('Page not found')
  return { body: { contentType: page.contentType, data: page.data } }
}

export const deletePage: Handler = async ({ store, caller }, params) => {
  const doc = await findDocument(store, caller.familyId, params.id)
  if (!doc.pageIds.includes(params.pageId)) throw notFound('Page not found')
  await store.delete(caller.familyId, params.pageId)
  const updated = await store.upsert(touch(caller, doc, { pageIds: doc.pageIds.filter((p) => p !== params.pageId) }))
  return { body: updated }
}
