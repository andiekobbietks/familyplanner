import type { Note } from '../api/types'

/** Notes under their category, in the order the API sends them. Uncategorised notes come last, under "Other". */
export function groupNotes(notes: Note[]): { category: string; notes: Note[] }[] {
  const groups = new Map<string, Note[]>()
  for (const n of notes) {
    const key = n.category?.trim() || ''
    groups.set(key, [...(groups.get(key) ?? []), n])
  }
  const out = [...groups].filter(([k]) => k).map(([category, notes]) => ({ category, notes }))
  const other = groups.get('')
  if (other) out.push({ category: 'Other', notes: other })
  return out
}

/** The categories in use, for the editor's suggestions and the wall's filter. */
export const noteCategories = (notes: Note[]) => [...new Set(notes.map((n) => n.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b))

export const matchesNote = (n: Note, search: string) => {
  const q = search.trim().toLowerCase()
  return !q || [n.title, n.category ?? '', n.body].some((s) => s.toLowerCase().includes(q))
}

/**
 * Splits text into plain runs and http(s) addresses, so a manual's address can be a link while everything
 * else stays text (S14). Punctuation that ends a sentence is left out of the address.
 */
export function linkParts(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = []
  let last = 0
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    const url = m[0].replace(/[.,;:!?)\]'’]+$/, '')
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    out.push({ text: url, url })
    last = at + url.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
