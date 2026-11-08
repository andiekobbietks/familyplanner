import { beforeEach, describe, expect, it } from 'vitest'
import { addPage, createDocument, deleteDocument, deletePage, getDocuments, getPage, patchDocument } from '../src/handlers/documents'
import { exportAll } from '../src/handlers/admin'
import { rankDocuments, runTool } from '../src/lib/chatTools'
import type { Ctx } from '../src/lib/http'
import { MemoryStore } from '../src/lib/memoryStore'
import { PAGE_MAX_CHARS, ValidationError } from '../src/lib/schemas'
import { seed } from '../src/lib/seed'
import type { Caller, FamilyDocument } from '../src/lib/types'

process.env.FAMILY_ID = 'home'
const q = () => new URLSearchParams()
const b64 = (...bytes: number[]) => Buffer.from([...bytes, ...Array(20).fill(0)]).toString('base64')
const JPEG = b64(0xff, 0xd8, 0xff, 0xe0)
const PNG = b64(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(12)]).toString('base64')

const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }
const jo: Caller = { memberId: 'm-jo', role: 'admin', familyId: 'home', displayName: 'Jo' }
let store: MemoryStore
let ctx: Ctx

beforeEach(async () => {
  store = await MemoryStore.create(undefined, seed)
  ctx = { store, caller: tim, now: new Date('2026-11-08T10:00:00Z') }
})

const create = async (body: unknown) => (await createDocument(ctx, {}, q(), body)).body as FamilyDocument
const add = async (id: string, contentType = 'image/jpeg', data = JPEG) => (await addPage(ctx, { id }, q(), { contentType, data })).body as FamilyDocument

describe('documents', () => {
  it('needs only a title, starts with no pages, and lists newest first', async () => {
    const a = await create({ title: 'Boiler warranty' })
    expect(a).toMatchObject({ type: 'document', title: 'Boiler warranty', description: '', pageIds: [], createdBy: 'm-tim' })
    await new Promise((r) => setTimeout(r, 5))
    await create({ title: 'Passport renewal letter', description: 'Charlie, expires 2031' })
    const list = (await getDocuments(ctx, {}, q(), undefined)).body as FamilyDocument[]
    expect(list.map((d) => d.title)).toEqual(['Passport renewal letter', 'Boiler warranty'])
  })

  it('S8: audit fields and page ids in the body are ignored', async () => {
    const d = await create({ title: 'Letter', createdBy: 'm-jo', familyId: 'other', pageIds: ['docpage:x'] })
    expect(d).toMatchObject({ createdBy: 'm-tim', familyId: 'home', pageIds: [] })
  })

  it('adds pages in order and gives each back through its document', async () => {
    const d = await create({ title: 'Lease' })
    await add(d.id)
    await add(d.id, 'image/png', PNG)
    const after = await add(d.id, 'image/webp', WEBP)
    expect(after.pageIds).toHaveLength(3)
    const second = (await getPage(ctx, { id: d.id, pageId: after.pageIds[1] }, q(), undefined)).body
    expect(second).toEqual({ contentType: 'image/png', data: PNG })
  })

  it('refuses an upload that is not the image it claims to be, or is too large', async () => {
    const d = await create({ title: 'Lease' })
    await expect(add(d.id, 'image/png', JPEG)).rejects.toMatchObject({ status: 400 })
    await expect(add(d.id, 'image/jpeg', Buffer.from('<svg onload=alert(1)>').toString('base64'))).rejects.toMatchObject({ status: 400 })
    await expect(add(d.id, 'image/svg+xml', JPEG)).rejects.toBeInstanceOf(ValidationError)
    await expect(add(d.id, 'image/jpeg', 'not base64!')).rejects.toBeInstanceOf(ValidationError)
    await expect(add(d.id, 'image/jpeg', JPEG + 'A'.repeat(PAGE_MAX_CHARS))).rejects.toBeInstanceOf(ValidationError)
    await expect(create({ title: 'x', thumb: PNG })).rejects.toMatchObject({ status: 400 })
    expect(((await getDocuments(ctx, {}, q(), undefined)).body as FamilyDocument[]).find((x) => x.id === d.id)?.pageIds).toEqual([])
  })

  it('a page is only reachable through the document that lists it', async () => {
    const a = await add((await create({ title: 'A' })).id)
    const b = await create({ title: 'B' })
    await expect(getPage(ctx, { id: b.id, pageId: a.pageIds[0] }, q(), undefined)).rejects.toMatchObject({ status: 404 })
    await expect(getPage(ctx, { id: a.id, pageId: 'm-tim' }, q(), undefined)).rejects.toMatchObject({ status: 404 })
    await expect(addPage(ctx, { id: 'r-chicken' }, q(), { contentType: 'image/jpeg', data: JPEG })).rejects.toMatchObject({ status: 404 })
  })

  it('any member can edit the title and description, and nothing else', async () => {
    const d = await add((await create({ title: 'Letter' })).id)
    const { body } = await patchDocument({ ...ctx, caller: jo }, { id: d.id }, q(), { description: 'From the council about bins', pageIds: [], title: 'Council letter' })
    expect(body).toMatchObject({ title: 'Council letter', description: 'From the council about bins', pageIds: d.pageIds, updatedBy: 'm-jo' })
  })

  it('deleting a page removes it, and deleting the document removes every page', async () => {
    const d = await create({ title: 'Lease' })
    await add(d.id)
    const two = await add(d.id)
    const [first, second] = two.pageIds
    const left = (await deletePage(ctx, { id: d.id, pageId: first }, q(), undefined)).body as FamilyDocument
    expect(left.pageIds).toEqual([second])
    expect(await store.get('home', first, 'docPage')).toBeUndefined()
    await deleteDocument(ctx, { id: d.id }, q(), undefined)
    expect(await store.get('home', second, 'docPage')).toBeUndefined()
    expect(await store.get('home', d.id, 'document')).toBeUndefined()
  })

  it('caps a document at 50 pages', async () => {
    const d = await create({ title: 'Big' })
    await store.upsert({ ...d, pageIds: Array.from({ length: 50 }, (_, i) => `p${i}`) })
    await expect(add(d.id)).rejects.toMatchObject({ status: 400 })
  })

  it('A10: the export has titles and descriptions but no images', async () => {
    const d = await add((await create({ title: 'Lease', thumb: JPEG })).id)
    const out = (await exportAll(ctx, {}, q(), undefined)).body as Record<string, Record<string, unknown>[]>
    expect(out.document).toEqual([expect.objectContaining({ title: 'Lease', pageIds: d.pageIds })])
    expect(out.document[0].thumb).toBeUndefined()
    expect(out.docPage).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain(JPEG)
  })
})

describe('chat: find_documents', () => {
  const doc = (title: string, description = '', createdAt = '2026-01-01T00:00:00Z') => ({ title, description, createdAt, pageIds: [] }) as unknown as FamilyDocument

  it('matches any word of the query in the title or description, best match first, forgiving endings', () => {
    const docs = [doc('Boiler service receipt'), doc('Car insurance', 'Renews in March'), doc('Boiler warranty', 'Acme Heating, ten years')]
    expect(rankDocuments(docs, 'boiler warranties').map((d) => d.title)).toEqual(['Boiler warranty', 'Boiler service receipt'])
    expect(rankDocuments(docs, 'when does the insurance renew?').map((d) => d.title)).toEqual(['Car insurance'])
    expect(rankDocuments(docs, 'passport')).toEqual([])
  })

  it('without a query, gives the newest', () => {
    const docs = [doc('Old', '', '2025-01-01T00:00:00Z'), doc('New', '', '2026-06-01T00:00:00Z')]
    expect(rankDocuments(docs, '').map((d) => d.title)).toEqual(['New', 'Old'])
  })

  it('gives the model words only: never a page, a thumbnail or an id', async () => {
    const d = await add((await create({ title: 'Boiler warranty', description: 'Ten years', thumb: JPEG })).id)
    const { content, isError } = await runTool('find_documents', { query: 'boiler' }, { ...ctx, names: new Map([['m-tim', 'Tim']]) })
    expect(isError).toBe(false)
    expect(JSON.parse(content)).toEqual([{ title: 'Boiler warranty', description: 'Ten years', pages: 1, added: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), addedBy: 'Tim' }])
    expect(content).not.toContain(JPEG)
    expect(content).not.toContain(d.id)
  })
})
