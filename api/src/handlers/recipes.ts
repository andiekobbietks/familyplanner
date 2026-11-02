import { notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { parse, recipeIntakeSchema, recipePatchSchema, recipeSchema } from '../lib/schemas'
import type { Recipe } from '../lib/types'
import { stamp, touch } from '../lib/util'

export const getRecipes: Handler = async ({ store, caller }) => {
  const recipes = await store.byType<Recipe>(caller.familyId, 'recipe')
  recipes.sort((a, b) => a.title.localeCompare(b.title))
  return { body: recipes }
}

export const createRecipe: Handler = async ({ store, caller }, _p, _q, body) => {
  const data = parse(recipeSchema, body)
  const saved = await store.upsert(stamp(caller, 'recipe', { tags: [], ingredients: '', method: '', notes: '', ...data }))
  return { status: 201, body: saved }
}

export const patchRecipe: Handler = async ({ store, caller }, params, _q, body) => {
  const recipe = await store.get<Recipe>(caller.familyId, params.id, 'recipe')
  if (!recipe) throw notFound('Recipe not found')
  const saved = await store.upsert(touch(caller, recipe, parse(recipePatchSchema, body)))
  return { body: saved }
}

export const deleteRecipe: Handler = async ({ store, caller }, params) => {
  const recipe = await store.get<Recipe>(caller.familyId, params.id, 'recipe')
  if (!recipe) throw notFound('Recipe not found')
  await store.delete(caller.familyId, recipe.id)
  return { status: 204 }
}

/**
 * For Hermes, which keeps the org file that recipes are texted into (section 5.8). It can add recipes and
 * learn whether a title it sent already exists. It can't read, change or delete anything.
 */
export const intakeRecipes: Handler = async ({ store, caller }, _p, _q, body) => {
  const { recipes } = parse(recipeIntakeSchema, body)
  const key = (title: string) => title.trim().toLowerCase()
  const have = new Set((await store.byType<Recipe>(caller.familyId, 'recipe')).map((r) => key(r.title)))
  const added: string[] = []
  const skipped: string[] = []
  const failed: { title: string; error: string }[] = []
  for (const raw of recipes) {
    const result = recipeSchema.safeParse(raw)
    if (!result.success) {
      const title = String((raw as { title?: unknown } | null)?.title ?? 'Untitled').slice(0, 200)
      const issue = result.error.issues[0]
      failed.push({ title, error: `${issue?.path.join('.')}: ${issue?.message}` })
    } else if (have.has(key(result.data.title))) {
      skipped.push(result.data.title)
    } else {
      await store.upsert(stamp(caller, 'recipe', { tags: [], ingredients: '', method: '', notes: '', ...result.data }))
      have.add(key(result.data.title))
      added.push(result.data.title)
    }
  }
  return { body: { added, skipped, failed } }
}
