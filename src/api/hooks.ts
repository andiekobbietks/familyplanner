import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Chore, ChoreSchedule, ExternalEvents, Item, List, Me, MemberRecord, Person, PlanEntry, Recipe, RecipeInput, Settings, Task, Weather } from './types'

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') })
export const usePeople = () => useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('/people'), staleTime: 60_000 })
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings'), staleTime: 60_000 })
export const useLists = () => useQuery({ queryKey: ['lists'], queryFn: () => api<List[]>('/lists') })

export const useItems = (listId: string | undefined, poll = false) =>
  useQuery({
    queryKey: ['items', listId],
    queryFn: () => api<Item[]>(`/lists/${listId}/items`),
    enabled: !!listId,
    // Two people shopping together see each other's changes (section 5.4).
    refetchInterval: poll ? 30_000 : false,
    refetchIntervalInBackground: false,
  })

export const useTasks = (view: 'mine' | 'all' | 'done') =>
  useQuery({ queryKey: ['tasks', view], queryFn: () => api<Task[]>(`/tasks?view=${view}`) })

/** Events from the connected Google calendars. A failed read leaves the rest of the app working (section 5.3). */
export function useCalendarEvents(from: string, to: string) {
  const google = useQuery({
    queryKey: ['external-events', from, to],
    queryFn: () => api<ExternalEvents>(`/external-events?from=${from}&to=${to}`),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { events: google.data?.events ?? [], calendars: google.data?.calendars ?? [], unavailable: google.isError || !!google.data?.unavailable }
}

export const usePlan = (monday: string) => useQuery({ queryKey: ['plan', monday], queryFn: () => api<PlanEntry[]>(`/plan?week=${monday}`) })

/** The whole collection, so that search and plan cells work from one cached read. */
export const useRecipes = () => useQuery({ queryKey: ['recipes'], queryFn: () => api<Recipe[]>('/recipes'), staleTime: 5 * 60_000 })

export const useChores = (monday: string) => useQuery({ queryKey: ['chores', monday], queryFn: () => api<ChoreSchedule>(`/chores?week=${monday}`) })

export const useWeather = () => useQuery({ queryKey: ['weather'], queryFn: () => api<Weather>('/weather'), staleTime: 30 * 60_000, retry: false })

export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: () => api<MemberRecord[]>('/members') })

/** Mutation helper that invalidates the given query roots afterwards. */
export function useInvalidating<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>, keys: string[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })),
  })
}

export const mutations = {
  addItem: (listId: string, body: Partial<Item>) => api<Item>(`/lists/${listId}/items`, { method: 'POST', json: body }),
  patchItem: (id: string, body: Partial<Item>) => api<Item>(`/items/${id}`, { method: 'PATCH', json: body }),
  deleteItem: (id: string) => api<void>(`/items/${id}`, { method: 'DELETE' }),
  clearChecked: (listId: string) => api<{ removed: number }>(`/lists/${listId}/items?checked=true`, { method: 'DELETE' }),
  createList: (name: string) => api<List>('/lists', { method: 'POST', json: { name } }),
  deleteList: (id: string) => api<void>(`/lists/${id}`, { method: 'DELETE' }),

  createTask: (body: Partial<Task>) => api<Task>('/tasks', { method: 'POST', json: body }),
  patchTask: (id: string, body: Partial<Task>) => api<Task>(`/tasks/${id}`, { method: 'PATCH', json: body }),
  deleteTask: (id: string) => api<void>(`/tasks/${id}`, { method: 'DELETE' }),

  setCell: (date: string, slot: string, body: { text: string }) =>
    api<PlanEntry>(`/plan/${date}/${slot}`, { method: 'PUT', json: body }),
  clearCell: (date: string, slot: string) => api<void>(`/plan/${date}/${slot}`, { method: 'DELETE' }),
  copyWeek: (week: string) => api<{ copied: number }>('/plan/copy-week', { method: 'POST', json: { week } }),

  createRecipe: (body: RecipeInput) => api<Recipe>('/recipes', { method: 'POST', json: body }),
  patchRecipe: (id: string, body: Partial<RecipeInput>) => api<Recipe>(`/recipes/${id}`, { method: 'PATCH', json: body }),
  deleteRecipe: (id: string) => api<void>(`/recipes/${id}`, { method: 'DELETE' }),

  createChore: (name: string) => api<Chore>('/chores', { method: 'POST', json: { name } }),
  renameChore: (id: string, name: string) => api<Chore>(`/chores/${id}`, { method: 'PATCH', json: { name } }),
  deleteChore: (id: string) => api<void>(`/chores/${id}`, { method: 'DELETE' }),
  assignChore: (id: string, week: string, memberId: string) => api<void>(`/chores/${id}/weeks/${week}`, { method: 'PUT', json: { memberId } }),
  unassignChore: (id: string, week: string) => api<void>(`/chores/${id}/weeks/${week}`, { method: 'DELETE' }),
  copyChoreWeek: (week: string) => api<{ copied: number }>('/chores/copy-week', { method: 'POST', json: { week } }),

  patchMe: (body: { displayName?: string; colour?: string }) => api<Me>('/me', { method: 'PATCH', json: body }),
  patchSettings: (body: { breakfastEnabled?: boolean; defaultListId?: string | null }) => api<Settings>('/settings', { method: 'PATCH', json: body }),
  invite: (email: string, role: string) => api<{ member: MemberRecord; instructions: string }>('/members/invite', { method: 'POST', json: { email, role } }),
  removeMember: (id: string) => api<void>(`/members/${id}`, { method: 'DELETE' }),
  erase: () => api<void>('/admin/erase', { method: 'POST', json: { confirm: 'DELETE' } }),
}
