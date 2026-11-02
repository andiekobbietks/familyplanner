import type { RecipeInput } from '../api/types'

/**
 * Reads recipes out of an org-mode file, one per top-level heading. Ingredients come as lists or
 * `| Amount | Ingredient |` tables, and any other `**` section can hold both, like a sub-recipe
 * with its own table and numbered steps. Runs in the browser, so the file is never uploaded.
 */
export function parseOrgRecipes(org: string): RecipeInput[] {
  const recipes: RecipeInput[] = []
  let lines: string[] | undefined
  for (const line of org.split(/\r?\n/)) {
    if (/^\* /.test(line)) {
      if (lines) recipes.push(parseRecipe(lines))
      lines = [line]
    } else {
      lines?.push(line)
    }
  }
  if (lines) recipes.push(parseRecipe(lines))
  return recipes
}

/** The text form of a run of entries: one per line. */
class Block {
  entries: string[] = []
  private open = false

  add(entry: string) {
    this.entries.push(entry)
    this.open = true
  }
  /** A wrapped line carries on the entry above. */
  extend(more: string) {
    if (!this.open) return this.add(more)
    const last = this.entries[this.entries.length - 1]
    // A step whose first line is only a bold label reads as a sentence of its own.
    const sep = /^\*[^*]+\*(\s*\(.*\))?$/.test(last) ? '. ' : ' '
    this.entries[this.entries.length - 1] = `${last}${sep}${more}`
  }
  heading(name: string) {
    this.add(`${name}:`)
    this.open = false
  }
  text() {
    return this.entries.map(plain).join('\n')
  }
}

type Kind = 'ingredients' | 'method' | 'notes' | 'mixed'

function parseRecipe([head, ...body]: string[]): RecipeInput {
  const heading = /^\*\s+(.*?)(?:\s+:([^\s:]+(?::[^\s:]+)*):)?\s*$/.exec(head)!
  const props = new Map<string, string>()
  const intro: string[] = []
  const ingredients = new Block()
  const method = new Block()
  const notes = new Block()

  let kind: Kind | undefined
  let inProps = false
  let prose = false
  // A heading waits until something lands under it, because a mixed section may fill only one block.
  let pendingIngredients: string | undefined
  let pendingMethod: string | undefined

  const toIngredients = (entry: string) => {
    if (pendingIngredients) ingredients.heading(pendingIngredients)
    pendingIngredients = undefined
    ingredients.add(entry)
  }
  const toMethod = (entry: string) => {
    if (pendingMethod) method.heading(pendingMethod)
    pendingMethod = undefined
    method.add(entry)
  }

  for (const raw of body) {
    const line = raw.trim()
    if (line === ':PROPERTIES:') inProps = true
    else if (inProps) {
      const prop = /^:([^:]+):\s*(.*)$/.exec(line)
      if (line === ':END:') inProps = false
      else if (prop?.[2]) props.set(prop[1].toUpperCase(), prop[2].trim())
      continue
    }
    if (!line) prose = false
    if (line === ':PROPERTIES:' || !line) continue

    const section = /^\*\*\s+(.*)$/.exec(raw)
    const sub = /^\*\*\*+\s+(.*)$/.exec(raw)
    if (sub) {
      if (kind === 'ingredients' || kind === 'mixed') pendingIngredients = sub[1].trim()
      if (kind === 'method' || kind === 'mixed') pendingMethod = sub[1].trim()
      continue
    }
    if (section) {
      const name = section[1].trim()
      const lower = name.toLowerCase()
      kind = lower === 'ingredients' ? 'ingredients' : lower === 'method' ? 'method' : lower === 'notes' || lower === 'variations' ? 'notes' : 'mixed'
      // After a sub-recipe the main list needs its own subheading, or it reads as part of that sub-recipe.
      if (kind === 'ingredients') pendingIngredients = ingredients.entries.length ? 'Main recipe' : undefined
      if (kind === 'method') pendingMethod = method.entries.length ? 'Main recipe' : undefined
      if (kind === 'mixed') pendingIngredients = pendingMethod = name
      if (lower === 'variations') notes.heading(name)
      continue
    }
    if (!kind) {
      intro.push(line)
      continue
    }

    if (line.startsWith('|')) {
      if (/^\|[-+]+\|?$/.test(line)) continue
      const cells = line.split('|').slice(1, -1).map((c) => c.trim()).filter(Boolean)
      if (cells[0]?.toLowerCase() !== 'amount') toIngredients(cells.join(' '))
      continue
    }

    const step = /^\d+[.)]\s+(.*)$/.exec(line)
    const bullet = /^[-+]\s+(.*)$/.exec(line)
    const wrapped = !step && !bullet && /^\s/.test(raw)

    if (kind === 'ingredients') {
      if (wrapped) ingredients.extend(line)
      else toIngredients(bullet?.[1] ?? line)
    } else if (kind === 'method') {
      if (wrapped) method.extend(line)
      else toMethod(step?.[1] ?? line)
    } else if (kind === 'notes') {
      if (wrapped) notes.extend(line)
      else notes.add(bullet?.[1] ?? line)
    } else if (step) {
      toMethod(step[1])
    } else if (bullet) {
      toIngredients(bullet[1])
    } else {
      if (prose) notes.extend(line)
      else notes.add(line)
      prose = true
    }
  }

  const take = (...keys: string[]) => {
    for (const k of keys) {
      const v = props.get(k)
      props.delete(k)
      if (v) return v
    }
    return undefined
  }
  const serves = take('SERVINGS', 'SERVES')
  const source = take('SOURCE')
  const times = [['PREP', 'Prep'], ['COOK', 'Cook'], ['BAKE', 'Bake']].flatMap(([k, label]) => {
    const v = take(k)
    return v ? [`${label} ${v}`] : []
  })
  const total = take('TIME', 'READY-IN')
  if (total) times.push(total)
  props.delete('ADDED')
  // Whatever has no field of its own stays as a note, so that the import loses nothing.
  const facts = [...props].map(([k, v]) => `${k[0]}${k.slice(1).toLowerCase()}: ${v}`)

  const summary = plain(intro.join(' '))
  return {
    title: plain(heading[1]),
    ...(summary && { summary }),
    ...(serves && { serves }),
    ...(times.length > 0 && { time: times.join(', ') }),
    ...(source && { source }),
    tags: heading[2]?.split(':') ?? [],
    ingredients: ingredients.text(),
    method: method.text(),
    notes: [...facts, ...notes.entries.map(plain)].join('\n'),
  }
}

/** Removes org markup. Emphasis needs a space or edge either side, so `1/2 tsp` and `200°C / 400°F` survive. */
function plain(s: string): string {
  return s
    .replace(/\[\[([^\]]*)\]\[([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/(^|[\s(])\*(\S(?:[^*]*\S)?)\*(?=$|[\s.,:;)])/g, '$1$2')
    .replace(/(^|[\s(])\/(\S(?:[^/]*\S)?)\/(?=$|[\s.,:;)])/g, '$1$2')
    .trim()
}
