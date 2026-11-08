import type { NoteInput } from '../api/types'

/** Org properties that are bookkeeping, not something the family wants to read. */
const HIDDEN_PROPS = new Set(['CATEGORY', 'ID', 'ADDED', 'CREATED', 'CUSTOM_ID'])

/**
 * Reads family notes out of an org-mode file, one per top-level heading, the way recipes are read.
 * The category is the `:CATEGORY:` property, else the heading's first tag. Everything under the heading is
 * the note, as plain text: subheadings become "Heading:" lines, other properties become "Name: value"
 * lines at the top, and an org link keeps its address so it can still be followed. Runs in the browser
 * and on the home server, so the file is never uploaded.
 */
export function parseOrgNotes(org: string): NoteInput[] {
  const notes: NoteInput[] = []
  let lines: string[] | undefined
  for (const line of org.split(/\r?\n/)) {
    if (/^\* /.test(line)) {
      if (lines) notes.push(parseNote(lines))
      lines = [line]
    } else {
      lines?.push(line)
    }
  }
  if (lines) notes.push(parseNote(lines))
  return notes.filter((n) => n.title)
}

function parseNote([head, ...body]: string[]): NoteInput {
  const heading = /^\*\s+(.*?)(?:\s+:([^\s:]+(?::[^\s:]+)*):)?\s*$/.exec(head)!
  const props = new Map<string, string>()
  const text: string[] = []
  let drawer: string | undefined

  for (const raw of body) {
    const line = raw.trim()
    if (drawer) {
      const prop = /^:([^:]+):\s*(.*)$/.exec(line)
      if (line === ':END:') drawer = undefined
      else if (drawer === 'PROPERTIES' && prop?.[2]) props.set(prop[1].toUpperCase(), prop[2].trim())
      continue
    }
    const opens = /^:([A-Z]+):$/.exec(line)
    if (opens) {
      drawer = opens[1]
      continue
    }
    // File settings, comments and planning lines are org's own, not part of the note.
    if (/^#\+/.test(line) || /^# /.test(line) || /^(SCHEDULED|DEADLINE|CLOSED):/.test(line)) continue
    const sub = /^\*\*+\s+(.*?)(?:\s+:[^\s:]+(?::[^\s:]+)*:)?\s*$/.exec(raw)
    if (sub) {
      if (text.length) text.push('')
      text.push(`${plain(sub[1])}:`)
      continue
    }
    if (/^\|[-+]+\|?$/.test(line)) continue
    text.push(line.startsWith('|') ? line.split('|').slice(1, -1).map((c) => plain(c)).filter(Boolean).join(' · ') : plain(line))
  }

  const category = props.get('CATEGORY') || heading[2]?.split(':')[0]
  const facts = [...props].filter(([k]) => !HIDDEN_PROPS.has(k)).map(([k, v]) => `${k[0]}${k.slice(1).toLowerCase()}: ${plain(v)}`)
  const lines = [...facts, ...(facts.length && text.some(Boolean) ? [''] : []), ...text]
  return {
    title: plain(heading[1]),
    ...(category && { category: category.replace(/_/g, ' ') }),
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  }
}

/**
 * Removes org markup but keeps link addresses, since a note is often there for the link.
 * Emphasis needs a space or edge either side, so `1/2` and `and/or` survive.
 */
function plain(s: string): string {
  return s
    .replace(/\[\[([^\]]*)\]\[([^\]]*)\]\]/g, (_, url: string, desc: string) => (/^https?:\/\//.test(url) && desc !== url ? `${desc} (${url})` : desc))
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/(^|[\s(])\*(\S(?:[^*]*\S)?)\*(?=$|[\s.,:;)])/g, '$1$2')
    .replace(/(^|[\s(])\/(\S(?:[^/]*\S)?)\/(?=$|[\s.,:;)])/g, '$1$2')
    .replace(/(^|[\s(])[=~](\S(?:[^=~]*\S)?)[=~](?=$|[\s.,:;)])/g, '$1$2')
    .trim()
}
