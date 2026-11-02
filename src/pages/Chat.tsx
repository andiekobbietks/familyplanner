import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { mutations } from '../api/hooks'
import type { ChatMessage } from '../api/types'
import { recentMessages } from '../lib/chat'

const EXAMPLES = ["What's on this week?", "What's for dinner tonight?", 'Which recipes could we make with chicken?']

const ERRORS: Record<string, string> = {
  CHAT_OFF: "Chat hasn't been set up yet.",
  CHAT_BUSY: 'The assistant is busy. Please try again in a moment.',
  CHAT_TIMEOUT: 'That took too long. Try asking something narrower.',
}

/** Kept here rather than in storage: it survives moving between pages and goes on reload or log out (S33). */
let saved: ChatMessage[] = []

export function Chat() {
  const [messages, setMessages] = useState(saved)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, busy])

  const show = (next: ChatMessage[]) => {
    saved = next
    setMessages(next)
  }

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const before = messages
    const next: ChatMessage[] = [...before, { role: 'user', content: question }]
    show(next)
    setDraft('')
    setError('')
    setBusy(true)
    try {
      const { reply } = await mutations.chat(recentMessages(next))
      show([...next, { role: 'assistant', content: reply }])
    } catch (e) {
      show(before)
      setDraft(question)
      setError((e instanceof ApiError && ERRORS[e.code]) || "Sorry, I couldn't get an answer. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(draft)
  }

  return (
    <>
      <div className="page-head">
        <h1 className="grow">Chat</h1>
        {messages.length > 0 && (
          <button className="btn link" type="button" disabled={busy} onClick={() => show([])}>
            New chat
          </button>
        )}
      </div>

      <div className="card chat-log" role="log" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && (
          <>
            <p className="empty">Ask about the calendar, meals, recipes, shopping, to-dos or chores. Chat can read the planner but can't change it.</p>
            <div className="chat-examples">
              {EXAMPLES.map((example) => (
                <button key={example} className="btn sm" type="button" disabled={busy} onClick={() => void ask(example)}>
                  {example}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <p key={i} className={`chat-msg ${m.role}`}>
            {m.content}
          </p>
        ))}
        {busy && <p className="chat-msg assistant muted">Looking that up…</p>}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <div ref={end} />
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} placeholder="Ask a question" aria-label="Ask a question" autoComplete="off" />
        <button className="btn primary" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </>
  )
}
