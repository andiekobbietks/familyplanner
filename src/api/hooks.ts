import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { EventInput, ExternalEvents, Item, List, Me, MemberRecord, Occurrence, Person, PlanEntry, Settings, Task } from './types'

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

export const useEvents = (from: string, to: string) =>
  useQuery({ queryKey: ['events', from, to], queryFn: () => api<Occurrence[]>(`/events?from=${from}&to=${to}`) })

/** Planner events and connected Google calendars together. A Google failure leaves the planner's own events showing (section 5.3.1). */
export function useCalendarEvents(from: string, to: string) {
  const own = useEvents(from, to)
  const google = useQuery({
    queryKey: ['external-events', from, to],
    queryFn: () => api<ExternalEvents>(`/external-events?from=${from}&to=${to}`),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const events = useMemo(
    () => [...(own.data ?? []), ...(google.data?.events ?? [])].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)),
    [own.data, google.data],
  )
  return { events, calendars: google.data?.calendars ?? [], unavailable: google.isError || !!google.data?.unavailable }
}

export const usePlan = (monday: string) => useQuery({ queryKey: ['plan', monday], queryFn: () => api<PlanEntry[]>(`/plan?week=${monday}`) })

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

  createEvent: (body: EventInput) => api<Occurrence>('/events', { method: 'POST', json: body }),
  updateEvent: (id: string, body: EventInput, scope?: 'this' | 'future', date?: string) =>
    api<Occurrence>(`/events/${id}${scope ? `?scope=${scope}&date=${date}` : ''}`, { method: 'PUT', json: body }),
  deleteEvent: (id: string, date?: string) => api<void>(`/events/${id}${date ? `?date=${date}` : ''}`, { method: 'DELETE' }),

  setCell: (date: string, slot: string, body: { text: string }) =>
    api<PlanEntry>(`/plan/${date}/${slot}`, { method: 'PUT', json: body }),
  clearCell: (date: string, slot: string) => api<void>(`/plan/${date}/${slot}`, { method: 'DELETE' }),
  copyWeek: (week: string) => api<{ copied: number }>('/plan/copy-week', { method: 'POST', json: { week } }),

  patchMe: (body: { displayName?: string; colour?: string }) => api<Me>('/me', { method: 'PATCH', json: body }),
  patchSettings: (body: { breakfastEnabled?: boolean; defaultListId?: string | null }) => api<Settings>('/settings', { method: 'PATCH', json: body }),
  invite: (email: string, role: string) => api<{ member: MemberRecord; instructions: string }>('/members/invite', { method: 'POST', json: { email, role } }),
  removeMember: (id: string) => api<void>(`/members/${id}`, { method: 'DELETE' }),
  erase: () => api<void>('/admin/erase', { method: 'POST', json: { confirm: 'DELETE' } }),
}
