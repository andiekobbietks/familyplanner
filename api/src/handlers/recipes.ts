import { notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { parse, recipePatchSchema, recipeSchema } from '../lib/schemas'
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
