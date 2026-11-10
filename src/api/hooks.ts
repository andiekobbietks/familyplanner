import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { ChatMessage, Chore, ChoreSchedule, DisplayDevice, ExternalEvents, Item, List, Me, DocPageImage, FamilyDocument, MemberRecord, Note, NoteInput, Person, PlanEntry, Recipe, RecipeInput, Settings, Shopping, Task, WallList, Weather } from './types'

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me') })
export const usePeople = () => useQuery({ queryKey: ['people'], queryFn: () => api<Person[]>('/people'), staleTime: 60_000 })
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings'), staleTime: 60_000 })
export const useShopping = () => useQuery({ queryKey: ['shopping'], queryFn: () => api<Shopping | null>('/shopping') })
/** The wall's Lists page: every open list with its unchecked items, the default first. */
export const useWallLists = () => useQuery({ queryKey: ['wall-lists'], queryFn: () => api<WallList[]>('/shopping/lists') })
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

/** Family notes, by category then title. The wall reads them too. */
export const useNotes = () => useQuery({ queryKey: ['notes'], queryFn: () => api<Note[]>('/notes'), staleTime: 5 * 60_000 })
/** A note's photo. A replaced photo has a new id, so one fetched is kept for good. The wall reads it too. */
export const useNotePhoto = (note: Note) =>
  useQuery({
    queryKey: ['note-photo', note.photoId],
    queryFn: () => api<DocPageImage>(`/notes/${note.id}/photo`),
    enabled: !!note.photoId,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })

export const useDocuments = () => useQuery({ queryKey: ['documents'], queryFn: () => api<FamilyDocument[]>('/documents') })
/** A page never changes once uploaded, so it is fetched once and kept while the app is open. */
export const useDocPage = (documentId: string, pageId: string) =>
  useQuery({ queryKey: ['doc-page', pageId], queryFn: () => api<DocPageImage>(`/documents/${documentId}/pages/${pageId}`), staleTime: Infinity, gcTime: 30 * 60_000 })

export const useChores = (monday: string) => useQuery({ queryKey: ['chores', monday], queryFn: () => api<ChoreSchedule>(`/chores?week=${monday}`) })

export const useWeather = () => useQuery({ queryKey: ['weather'], queryFn: () => api<Weather>('/weather'), staleTime: 30 * 60_000, retry: false })

export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: () => api<MemberRecord[]>('/members') })
export const useDisplayDevices = () => useQuery({ queryKey: ['display-devices'], queryFn: () => api<DisplayDevice[]>('/display-devices') })

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
  /** Wall page only: the display key's two writes, under /api/display (S34). */
  wallSetTaskDone: (id: string, done: boolean) => api<Task>(`/tasks/${id}/done`, { method: 'POST', json: { done } }),
  wallSetItemChecked: (id: string, checked: boolean) => api<Item>(`/items/${id}/checked`, { method: 'POST', json: { checked } }),

  setCell: (date: string, slot: string, body: { text: string }) =>
    api<PlanEntry>(`/plan/${date}/${slot}`, { method: 'PUT', json: body }),
  clearCell: (date: string, slot: string) => api<void>(`/plan/${date}/${slot}`, { method: 'DELETE' }),
  copyWeek: (week: string) => api<{ copied: number }>('/plan/copy-week', { method: 'POST', json: { week } }),

  createRecipe: (body: RecipeInput) => api<Recipe>('/recipes', { method: 'POST', json: body }),
  patchRecipe: (id: string, body: Partial<RecipeInput>) => api<Recipe>(`/recipes/${id}`, { method: 'PATCH', json: body }),
  deleteRecipe: (id: string) => api<void>(`/recipes/${id}`, { method: 'DELETE' }),

  createNote: (body: NoteInput) => api<Note>('/notes', { method: 'POST', json: body }),
  patchNote: (id: string, body: Partial<NoteInput>) => api<Note>(`/notes/${id}`, { method: 'PATCH', json: body }),
  deleteNote: (id: string) => api<void>(`/notes/${id}`, { method: 'DELETE' }),
  setNotePhoto: (id: string, photo: DocPageImage) => api<Note>(`/notes/${id}/photo`, { method: 'PUT', json: photo }),
  deleteNotePhoto: (id: string) => api<Note>(`/notes/${id}/photo`, { method: 'DELETE' }),

  createDocument: (body: { title: string; description: string; thumb?: string }) => api<FamilyDocument>('/documents', { method: 'POST', json: body }),
  patchDocument: (id: string, body: { title?: string; description?: string }) => api<FamilyDocument>(`/documents/${id}`, { method: 'PATCH', json: body }),
  deleteDocument: (id: string) => api<void>(`/documents/${id}`, { method: 'DELETE' }),
  addDocPage: (id: string, page: DocPageImage) => api<FamilyDocument>(`/documents/${id}/pages`, { method: 'POST', json: page }),
  deleteDocPage: (id: string, pageId: string) => api<FamilyDocument>(`/documents/${id}/pages/${pageId}`, { method: 'DELETE' }),

  createChore: (name: string) => api<Chore>('/chores', { method: 'POST', json: { name } }),
  renameChore: (id: string, name: string) => api<Chore>(`/chores/${id}`, { method: 'PATCH', json: { name } }),
  deleteChore: (id: string) => api<void>(`/chores/${id}`, { method: 'DELETE' }),
  assignChore: (id: string, week: string, memberId: string) => api<void>(`/chores/${id}/weeks/${week}`, { method: 'PUT', json: { memberId } }),
  unassignChore: (id: string, week: string) => api<void>(`/chores/${id}/weeks/${week}`, { method: 'DELETE' }),
  copyChoreWeek: (week: string) => api<{ copied: number }>('/chores/copy-week', { method: 'POST', json: { week } }),

  chat: (messages: ChatMessage[]) => api<{ reply: string }>('/chat', { method: 'POST', json: { messages } }),

  patchMe: (body: { displayName?: string; colour?: string }) => api<Me>('/me', { method: 'PATCH', json: body }),
  patchSettings: (body: { breakfastEnabled?: boolean; defaultListId?: string | null }) => api<Settings>('/settings', { method: 'PATCH', json: body }),
  invite: (email: string, role: string) => api<{ member: MemberRecord; instructions: string }>('/members/invite', { method: 'POST', json: { email, role } }),
  renameMember: (id: string, displayName: string) => api<MemberRecord>(`/members/${id}`, { method: 'PATCH', json: { displayName } }),
  removeMember: (id: string) => api<void>(`/members/${id}`, { method: 'DELETE' }),
  createDisplay: (name: string) => api<{ id: string; name: string; key: string }>('/display-devices', { method: 'POST', json: { name } }),
  revokeDisplay: (id: string) => api<void>(`/display-devices/${id}`, { method: 'DELETE' }),
  pairDisplay: (key: string) => api<void>('/pair', { method: 'POST', json: { key } }),
  erase: () => api<void>('/admin/erase', { method: 'POST', json: { confirm: 'DELETE' } }),
}
