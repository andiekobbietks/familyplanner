import { describe, expect, it } from 'vitest'
import type { Task } from '../api/types'
import { openTodos, wallTodos } from './tasks'

const task = (id: string, dueDate: string | null, done = false) => ({ id, title: id, dueDate, done }) as Task

describe('wallTodos', () => {
  const today = '2026-11-06'
  const tasks = [
    task('later', '2026-11-20'),
    task('next-week', '2026-11-12'),
    task('undated', null),
    task('today', '2026-11-06'),
    task('done', null, true),
    task('overdue', '2026-11-01'),
    task('tomorrow', '2026-11-07'),
  ]

  it('shows undated to-dos, which the wall used to leave off', () => {
    expect(wallTodos(tasks, today).map((t) => t.id)).toContain('undated')
  })

  it('orders due and overdue, then undated, then the coming week; leaves off done and far-off ones', () => {
    expect(wallTodos(tasks, today).map((t) => t.id)).toEqual(['overdue', 'today', 'undated', 'tomorrow', 'next-week'])
  })
})

describe('openTodos, for the Lists page', () => {
  it('keeps far-off to-dos too, in the same order, and still leaves off done ones', () => {
    const tasks = [task('later', '2026-11-20'), task('undated', null), task('done', null, true), task('overdue', '2026-11-01'), task('tomorrow', '2026-11-07')]
    expect(openTodos(tasks, '2026-11-06').map((t) => t.id)).toEqual(['overdue', 'undated', 'tomorrow', 'later'])
  })
})
