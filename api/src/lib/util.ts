import { randomUUID } from 'node:crypto'
import type { BaseDoc, Caller, DocType } from './types'

export const newId = (): string => randomUUID()
export const nowIso = () => new Date().toISOString()

/** Audit fields come from the principal, never from the body (S8). */
export function stamp<T extends object>(caller: Caller, type: DocType, fields: T, id = newId()): T & BaseDoc {
  const now = nowIso()
  return {
    ...fields,
    id,
    familyId: caller.familyId,
    type,
    createdAt: now,
    createdBy: caller.memberId,
    updatedAt: now,
    updatedBy: caller.memberId,
  }
}

export function touch<T extends BaseDoc>(caller: Caller, doc: T, patch: Partial<T>): T {
  return { ...doc, ...patch, updatedAt: nowIso(), updatedBy: caller.memberId }
}
