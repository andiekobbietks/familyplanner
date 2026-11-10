import { beforeEach, describe, expect, it } from 'vitest'
import { exportAll } from '../src/handlers/admin'
import { createNote, deleteNote, deleteNotePhoto, getNotePhoto, getNotes, patchNote, putNotePhoto } from '../src/handlers/notes'
import type { Ctx } from '../src/lib/http'
import { MemoryStore } from '../src/lib/memoryStore'
import { PAGE_MAX_CHARS, ValidationError } from '../src/lib/schemas'
import { seed } from '../src/lib/seed'
import type { Caller, Note } from '../src/lib/types'

process.env.FAMILY_ID = 'home'
const q = () => new URLSearchParams()
const b64 = (...bytes: number[]) => Buffer.from([...bytes, ...Array(20).fill(0)]).toString('base64')
const JPEG = b64(0xff, 0xd8, 0xff, 0xe0)
const PNG = b64(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }
let store: MemoryStore
let ctx: Ctx
beforeEach(async () => {
  store = await MemoryStore.create(undefined, seed)
  ctx = { store, caller: tim, now: new Date('2026-11-09T10:00:00Z') }
})

const create = async (body: unknown) => (await createNote(ctx, {}, q(), body)).body as Note
const put = async (id: string, contentType = 'image/jpeg', data = JPEG) => (await putNotePhoto(ctx, { id }, q(), { contentType, data })).body as Note
const photo = async (id: string) => (await getNotePhoto(ctx, { id }, q(), undefined)).body

describe('note photos', () => {
  it('a note starts without one, and gets one back through the note', async () => {
    const n = await create({ title: 'Dishwasher cycles' })
    expect(n.photoId).toBeUndefined()
    await expect(photo(n.id)).rejects.toMatchObject({ status: 404 })
    const withPhoto = await put(n.id)
    expect(withPhoto.photoId).toMatch(new RegExp(`^notephoto:${n.id}:`))
    expect(await photo(n.id)).toEqual({ contentType: 'image/jpeg', data: JPEG })
  })

  it('the notes list carries the photo id, never the picture', async () => {
    const n = await create({ title: 'Dishwasher cycles' })
    await put(n.id)
    const listed = ((await getNotes(ctx, {}, q(), undefined)).body as Note[]).find((x) => x.id === n.id)!
    expect(listed.photoId).toBeTruthy()
    expect(JSON.stringify(listed)).not.toContain(JPEG)
  })

  it('replacing gives a new id and removes the old photo', async () => {
    const n = await create({ title: 'Dishwasher cycles' })
    const first = (await put(n.id)).photoId!
    const second = (await put(n.id, 'image/png', PNG)).photoId!
    expect(second).not.toBe(first)
    expect(await store.get('home', first, 'notePhoto')).toBeUndefined()
    expect(await photo(n.id)).toEqual({ contentType: 'image/png', data: PNG })
  })

  it('removing it, or deleting the note, deletes the photo', async () => {
    const a = await create({ title: 'Oven' })
    const aPhoto = (await put(a.id)).photoId!
    const cleared = (await deleteNotePhoto(ctx, { id: a.id }, q(), undefined)).body as Note
    expect(cleared.photoId).toBeUndefined()
    expect(await store.get('home', aPhoto, 'notePhoto')).toBeUndefined()

    const b = await create({ title: 'Fridge' })
    const bPhoto = (await put(b.id)).photoId!
    await deleteNote(ctx, { id: b.id }, q(), undefined)
    expect(await store.get('home', bPhoto, 'notePhoto')).toBeUndefined()
  })

  it('editing the note keeps its photo, and the body cannot set or move one', async () => {
    const n = await create({ title: 'Oven' })
    const id = (await put(n.id)).photoId
    const other = await create({ title: 'Fridge', photoId: id })
    expect(other.photoId).toBeUndefined()
    const edited = (await patchNote(ctx, { id: n.id }, q(), { body: 'Fan 180', photoId: 'notephoto:x' })).body as Note
    expect(edited.photoId).toBe(id)
  })

  it('refuses an upload that is not the image it claims to be, or is too large', async () => {
    const n = await create({ title: 'Oven' })
    await expect(put(n.id, 'image/png', JPEG)).rejects.toMatchObject({ status: 400 })
    await expect(put(n.id, 'image/jpeg', Buffer.from('<svg onload=alert(1)>').toString('base64'))).rejects.toMatchObject({ status: 400 })
    await expect(put(n.id, 'image/svg+xml', JPEG)).rejects.toBeInstanceOf(ValidationError)
    await expect(put(n.id, 'image/jpeg', 'A'.repeat(PAGE_MAX_CHARS + 4))).rejects.toBeInstanceOf(ValidationError)
    expect((await store.get<Note>('home', n.id, 'note'))!.photoId).toBeUndefined()
  })

  it('a photo is reached only through its own note, and an unknown note is 404', async () => {
    const a = await create({ title: 'Oven' })
    await put(a.id)
    await expect(put('nope')).rejects.toMatchObject({ status: 404 })
    await expect(photo('r-chicken')).rejects.toMatchObject({ status: 404 })
    await expect(getNotePhoto(ctx, { id: 'm-tim' }, q(), undefined)).rejects.toMatchObject({ status: 404 })
  })

  it('the export keeps the note and leaves the picture out', async () => {
    const n = await create({ title: 'Oven' })
    await put(n.id)
    const out = (await exportAll(ctx, {}, q(), undefined)).body as Record<string, unknown>
    expect(JSON.stringify(out)).not.toContain(JPEG)
    expect((out.note as Note[]).some((x) => x.id === n.id)).toBe(true)
  })
})
