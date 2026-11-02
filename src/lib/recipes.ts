import type { Recipe } from '../api/types'

export interface TextBlock {
  heading?: string
  lines: string[]
}

/** Splits recipe text into runs of lines. A line ending in a colon starts a new run under that heading. */
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.endsWith(':')) blocks.push({ heading: line.slice(0, -1), lines: [] })
    else {
      if (blocks.length === 0) blocks.push({ lines: [] })
      blocks[blocks.length - 1].lines.push(line)
    }
  }
  return blocks
}

/** The recipe a meal plan cell refers to, if its text is exactly a recipe's title. */
export function findRecipe(recipes: Recipe[], text: string): Recipe | undefined {
  const wanted = text.trim().toLowerCase()
  return wanted ? recipes.find((r) => r.title.toLowerCase() === wanted) : undefined
}

/** A source can be a name, a web address or both. Only http(s) ever becomes a link. */
export function sourceUrl(source: string | undefined): string | undefined {
  return source?.match(/https?:\/\/[^\s)]+/)?.[0]
}

export function matchesSearch(recipe: Recipe, search: string): boolean {
  const q = search.trim().toLowerCase()
  return !q || [recipe.title, recipe.ingredients, ...recipe.tags].some((s) => s.toLowerCase().includes(q))
}
