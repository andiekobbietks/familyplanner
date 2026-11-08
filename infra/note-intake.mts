// Copies new family notes from the org file into the app (requirements section 5.11). Hermes runs this daily,
// as it does the recipe intake. Whatever it prints is sent to WhatsApp, so a day with nothing to report prints nothing.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { parseOrgNotes } from '../src/lib/orgNotes.ts'

interface Result {
  added: string[]
  skipped: string[]
  failed: { title: string; error: string }[]
}

const env = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}
const key = (title: string) => title.trim().toLowerCase()

async function send(notes: unknown[]): Promise<Result> {
  const res = await fetch(`${env('INTAKE_URL')}/api/integration/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-integration-token': env('INTEGRATION_TOKEN') },
    body: JSON.stringify({ notes }),
    redirect: 'error',
  })
  if (!res.ok) throw new Error(`the app answered ${res.status}`)
  return (await res.json()) as Result
}

async function main() {
  const stateFile = env('NOTE_STATE_FILE')
  const seen = new Set<string>(existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : [])
  const notes = parseOrgNotes(readFileSync(env('NOTE_FILE'), 'utf8'))
  // An empty file is far more likely to be a broken sync than a family with no notes.
  if (notes.length === 0) throw new Error('found no notes in the org file')

  const fresh = notes.filter((n) => !seen.has(key(n.title)))
  const added: string[] = []
  const failed: Result['failed'] = []
  for (let i = 0; i < fresh.length; i += 100) {
    const result = await send(fresh.slice(i, i + 100))
    added.push(...result.added)
    failed.push(...result.failed)
    // Recorded batch by batch, so a later failure doesn't lose track of what already went in.
    for (const title of [...result.added, ...result.skipped]) seen.add(key(title))
    writeFileSync(`${stateFile}.tmp`, JSON.stringify([...seen].sort(), null, 1))
    renameSync(`${stateFile}.tmp`, stateFile)
  }

  if (added.length > 0) console.log(`📝 Added to FamilyPlanner notes: ${added.join(', ')}`)
  for (const f of failed) console.log(`⚠️ FamilyPlanner refused the note "${f.title}": ${f.error}`)
}

main().catch((e) => {
  console.error(`Note intake failed: ${(e as Error).message}`)
  process.exit(1)
})
