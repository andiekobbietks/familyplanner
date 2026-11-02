import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../api/types'
import { MAX_MESSAGES, recentMessages } from './chat'

const turns = (n: number): ChatMessage[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }))

describe('recentMessages', () => {
  it('sends a short chat as it is', () => {
    expect(recentMessages(turns(3))).toEqual(turns(3))
  })
  it('keeps to the limit and still starts with a question', () => {
    const sent = recentMessages(turns(41))
    expect(sent.length).toBeLessThanOrEqual(MAX_MESSAGES)
    expect(sent[0].role).toBe('user')
    expect(sent[sent.length - 1].content).toBe('40')
  })
  it('drops a leading answer left by the cut', () => {
    const sent = recentMessages(turns(42).slice(0, 41).concat({ role: 'user', content: 'again' }))
    expect(sent[0].role).toBe('user')
    expect(sent[sent.length - 1].content).toBe('again')
  })
})
