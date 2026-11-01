import type { BaseDoc, DocType } from './types'

/**
 * The only thing the handlers know about persistence. One family, one
 * container, every call scoped by familyId (S16). Two implementations:
 * MemoryStore for local development and tests, CosmosStore for Azure.
 */
export interface Store {
  /** Undefined unless the document exists and is of this type, so a route for one type cannot reach another. */
  get<T extends BaseDoc>(familyId: string, id: string, type: DocType): Promise<T | undefined>
  byType<T extends BaseDoc>(familyId: string, type: DocType): Promise<T[]>
  upsert<T extends BaseDoc>(doc: T): Promise<T>
  delete(familyId: string, id: string): Promise<void>
  deleteAll(familyId: string): Promise<void>
}

let current: Store | undefined

export async function getStore(): Promise<Store> {
  if (current) return current
  if (process.env.COSMOS_ENDPOINT && process.env.STORE !== 'memory') {
    const { CosmosStore } = await import('./cosmosStore')
    current = await CosmosStore.create(process.env.COSMOS_ENDPOINT)
  } else {
    const { MemoryStore } = await import('./memoryStore')
    const { seed } = await import('./seed')
    current = await MemoryStore.create(process.env.STORE_FILE ?? `${__dirname}/../../.data/db.json`, seed)
  }
  return current
}

/** Tests inject their own store. */
export function setStore(store: Store | undefined) {
  current = store
}
