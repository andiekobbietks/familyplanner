import { answer } from '../lib/chat'
import type { Handler } from '../lib/http'
import { chatSchema, parse } from '../lib/schemas'

/** Any member can ask, and the assistant only reads (section 5.10). The conversation lives in the browser. */
export const chat: Handler = async (ctx, _p, _q, body) => {
  const { messages } = parse(chatSchema, body)
  return { body: { reply: await answer(messages, ctx) } }
}
