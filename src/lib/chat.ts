import type { ChatMessage } from '../api/types'

/** The API takes 20 messages, starting with a question, so the oldest drop out of a long chat. */
export const MAX_MESSAGES = 20

export function recentMessages(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_MESSAGES)
  const start = recent.findIndex((m) => m.role === 'user')
  return start < 0 ? [] : recent.slice(start)
}
