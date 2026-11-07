import { notFound } from '../lib/errors'
import type { Handler } from '../lib/http'
import { itemCheckedSchema, itemPatchSchema, itemSchema, listSchema, parse } from '../lib/schemas'
import { CATEGORIES, type Item, type List, type Settings } from '../lib/types'
import { nowIso, stamp, touch } from '../lib/util'

export const getLists: Handler = async ({ store, caller }) => {
  const [lists, items] = await Promise.all([store.byType<List>(caller.familyId, 'list'), store.byType<Item>(caller.familyId, 'item')])
  const counts = new Map<string, number>()
  for (const i of items) if (!i.checked) counts.set(i.listId, (counts.get(i.listId) ?? 0) + 1)
  const out = lists
    .filter((l) => !l.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((l) => ({ ...l, uncheckedCount: counts.get(l.id) ?? 0 }))
  return { body: out }
}

export const createList: Handler = async ({ store, caller }, _p, _q, body) => {
  const { name } = parse(listSchema, body)
  const lists = await store.byType<List>(caller.familyId, 'list')
  const saved = await store.upsert(stamp(caller, 'list', { name, sortOrder: lists.length, archived: false, recentNames: [] }))
  return { status: 201, body: { ...saved, uncheckedCount: 0 } }
}

export const deleteList: Handler = async ({ store, caller }, params) => {
  const list = await store.get<List>(caller.familyId, params.id, 'list')
  if (!list) throw notFound('List not found')
  const items = await store.byType<Item>(caller.familyId, 'item')
  for (const i of items) if (i.listId === list.id) await store.delete(caller.familyId, i.id)
  await store.delete(caller.familyId, list.id)
  return { status: 204 }
}

export const getItems: Handler = async ({ store, caller }, params) => {
  const list = await store.get<List>(caller.familyId, params.id, 'list')
  if (!list) throw notFound('List not found')
  const items = (await store.byType<Item>(caller.familyId, 'item')).filter((i) => i.listId === list.id)
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { body: items }
}

export const addItem: Handler = async ({ store, caller }, params, _q, body) => {
  const list = await store.get<List>(caller.familyId, params.id, 'list')
  if (!list) throw notFound('List not found')
  const data = parse(itemSchema, body)
  const saved = await store.upsert(stamp(caller, 'item', { listId: list.id, ...data, checked: false }))
  const recentNames = [data.name, ...list.recentNames.filter((n) => n.toLowerCase() !== data.name.toLowerCase())].slice(0, 300)
  await store.upsert(touch(caller, list, { recentNames }))
  return { status: 201, body: saved }
}

export const patchItem: Handler = async ({ store, caller }, params, _q, body) => {
  const item = await store.get<Item>(caller.familyId, params.id, 'item')
  if (!item) throw notFound('Item not found')
  const { checked, ...rest } = parse(itemPatchSchema, body)
  const patch: Partial<Item> = { ...rest }
  if (checked !== undefined && checked !== item.checked) {
    patch.checked = checked
    patch.checkedAt = checked ? nowIso() : undefined
    patch.checkedBy = checked ? caller.memberId : undefined
  }
  const saved = await store.upsert(touch(caller, item, patch))
  return { body: saved }
}

export const deleteItem: Handler = async ({ store, caller }, params) => {
  const item = await store.get<Item>(caller.familyId, params.id, 'item')
  if (!item) throw notFound('Item not found')
  await store.delete(caller.familyId, item.id)
  return { status: 204 }
}

/** DELETE /lists/{id}/items?checked=true clears the Done section. */
export const clearChecked: Handler = async ({ store, caller }, params, query) => {
  const list = await store.get<List>(caller.familyId, params.id, 'list')
  if (!list) throw notFound('List not found')
  if (query.get('checked') !== 'true') return { status: 400, body: { error: 'Only ?checked=true is supported', code: 'BAD_REQUEST' } }
  const items = await store.byType<Item>(caller.familyId, 'item')
  let removed = 0
  for (const i of items) if (i.listId === list.id && i.checked) (await store.delete(caller.familyId, i.id), removed++)
  return { body: { removed } }
}

/** Open lists in their order, and a list's unchecked items as the wall shows them: by category, then when added. */
async function wallData({ store, caller }: Parameters<Handler>[0]) {
  const [lists, items, settings] = await Promise.all([
    store.byType<List>(caller.familyId, 'list'),
    store.byType<Item>(caller.familyId, 'item'),
    store.get<Settings>(caller.familyId, 'settings', 'settings'),
  ])
  const open = lists.filter((l) => !l.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const rank = (c?: string) => (c ? CATEGORIES.indexOf(c as (typeof CATEGORIES)[number]) : CATEGORIES.length)
  const unchecked = (list: List) =>
    items
      .filter((i) => i.listId === list.id && !i.checked)
      .sort((a, b) => rank(a.category) - rank(b.category) || a.createdAt.localeCompare(b.createdAt))
      .map((i) => ({ id: i.id, name: i.name, note: i.note, category: i.category }))
  const defaultList = open.find((l) => l.id === settings?.defaultListId) ?? open[0]
  return { open, unchecked, defaultList }
}

/**
 * The wall's shopping panel: the default list (else the first), with its unchecked items only,
 * by category then when they were added. Just what the panel shows.
 */
export const getShopping: Handler = async (ctx) => {
  const { unchecked, defaultList: list } = await wallData(ctx)
  if (!list) return { body: null }
  return { body: { id: list.id, name: list.name, items: unchecked(list) } }
}

/**
 * The wall's Lists page: every open list with its unchecked items, the default first.
 * Names and items only: no checked items, recent names or who added what.
 */
export const getWallLists: Handler = async (ctx) => {
  const { open, unchecked, defaultList } = await wallData(ctx)
  const ordered = defaultList ? [defaultList, ...open.filter((l) => l !== defaultList)] : open
  return { body: ordered.map((l) => ({ id: l.id, name: l.name, isDefault: l === defaultList, items: unchecked(l) })) }
}

/**
 * Ticks a list item or unticks it and changes nothing else. One of the wall display's two writes (S34),
 * so a copied display key can tick items but not add, edit or delete them.
 * checkedBy is the caller: `display:<device id>` for a paired frame.
 */
export const setItemChecked: Handler = async ({ store, caller }, params, _q, body) => {
  const { checked } = parse(itemCheckedSchema, body)
  const item = await store.get<Item>(caller.familyId, params.id, 'item')
  if (!item) throw notFound('Item not found')
  if (checked === item.checked) return { body: item }
  const saved = await store.upsert(touch(caller, item, { checked, checkedAt: checked ? nowIso() : undefined, checkedBy: checked ? caller.memberId : undefined }))
  return { body: saved }
}
