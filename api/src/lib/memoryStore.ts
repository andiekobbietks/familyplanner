import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Store } from './store'
import type { BaseDoc, DocType } from './types'

/**
 * In-memory store with an optional JSON file behind it, so a local dev server
 * survives restarts. Not for production.
 */
export class MemoryStore implements Store {
  private docs = new Map<string, BaseDoc>()
  private saveTimer: NodeJS.Timeout | undefined

  private constructor(private file?: string) {}

  static async create(file?: string, seed?: (familyId: string) => BaseDoc[]): Promise<MemoryStore> {
    const store = new MemoryStore(file)
    if (file) {
      try {
        const raw = await readFile(file, 'utf8')
        for (const d of JSON.parse(raw) as BaseDoc[]) store.docs.set(store.key(d.familyId, d.id), d)
        return store
      } catch {
        /* no file yet: fall through to seed */
      }
    }
    if (seed) for (const d of seed(process.env.FAMILY_ID ?? 'home')) store.docs.set(store.key(d.familyId, d.id), d)
    await store.flush()
    return store
  }

  private key(familyId: string, id: string) {
    return `${familyId}|${id}`
  }

  async get<T extends BaseDoc>(familyId: string, id: string, type: DocType) {
    const doc = this.docs.get(this.key(familyId, id))
    return doc?.type === type ? (doc as T) : undefined
  }

  async byType<T extends BaseDoc>(familyId: string, type: DocType) {
    const out: T[] = []
    for (const d of this.docs.values()) if (d.familyId === familyId && d.type === type) out.push(d as T)
    return out
  }

  async upsert<T extends BaseDoc>(doc: T) {
    this.docs.set(this.key(doc.familyId, doc.id), structuredClone(doc))
    this.scheduleSave()
    return doc
  }

  async delete(familyId: string, id: string) {
    this.docs.delete(this.key(familyId, id))
    this.scheduleSave()
  }

  async deleteAll(familyId: string) {
    for (const k of [...this.docs.keys()]) if (k.startsWith(`${familyId}|`)) this.docs.delete(k)
    this.scheduleSave()
  }

  private scheduleSave() {
    if (!this.file) return
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), 250)
  }

  async flush() {
    if (!this.file) return
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify([...this.docs.values()], null, 1))
  }
}
