import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '../src/handlers/chat'
import { CHAT_MODEL } from '../src/lib/chat'
import { runTool, toolDefinitions } from '../src/lib/chatTools'
import type { Ctx } from '../src/lib/http'
import { MemoryStore } from '../src/lib/memoryStore'
import { ValidationError } from '../src/lib/schemas'
import { seed } from '../src/lib/seed'
import type { Caller, Recipe } from '../src/lib/types'

process.env.FAMILY_ID = 'home'
const q = new URLSearchParams()
const tim: Caller = { memberId: 'm-tim', role: 'admin', familyId: 'home', displayName: 'Tim' }
const ask = { messages: [{ role: 'user', content: "What's for dinner?" }] }

let ctx: Ctx
let requests: any[]
let replies: Array<object | Response>

const message = (stop_reason: string, content: object[]) => ({ id: 'msg', type: 'message', role: 'assistant', model: CHAT_MODEL, stop_reason, content, usage: { input_tokens: 1, output_tokens: 1 } })
const text = (t: string) => message('end_turn', [{ type: 'text', text: t }])
const toolCall = (name: string, input: object = {}, id = 'call-1') => message('tool_use', [{ type: 'tool_use', id, name, input }])
const errorResponse = (status: number) => new Response(JSON.stringify({ type: 'error', error: { type: 'error', message: 'no' } }), { status, headers: { 'content-type': 'application/json' } })

beforeEach(async () => {
  ctx = { store: await MemoryStore.create(undefined, seed), caller: tim, now: new Date('2026-09-16T10:00:00Z') }
  requests = []
  replies = []
  process.env.ANTHROPIC_API_KEY = 'test-key'
  // Stubbed at the HTTP boundary, so the real SDK builds each request and raises its real errors.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)))
      const next = replies.shift() ?? text('Done')
      return next instanceof Response ? next : new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /chat', () => {
  it('answers directly when no tool is needed', async () => {
    replies = [text('Hello Tim')]
    expect((await chat(ctx, {}, q, ask)).body).toEqual({ reply: 'Hello Tim' })
  })

  it('A9j: always uses Haiku, and a request cannot choose another model', async () => {
    await chat(ctx, {}, q, { ...ask, model: 'claude-fable-5-1', max_tokens: 100000, system: 'x', tools: [] })
    expect(requests[0].model).toBe('claude-haiku-5-5')
    expect(requests[0].max_tokens).toBe(4000)
    expect(requests[0].system).toContain('You are talking to Tim')
    expect(requests[0].tools).toHaveLength(toolDefinitions.length)
  })

  it('tells the model the date in the UK and who is in the family, with no email addresses', async () => {
    const lateEvening = { ...ctx, now: new Date('2026-07-01T23:30:00Z') }
    await chat(lateEvening, {}, q, ask)
    expect(requests[0].system).toContain('Thursday, 2 July 2026')
    expect(requests[0].system).toContain('Tim, Jo, Charlie, Robin')
    expect(JSON.stringify(requests[0])).not.toContain('@example.com')
  })

  it('runs a tool, returns the result and then answers', async () => {
    replies = [toolCall('get_shopping_lists'), text('Milk')]
    expect((await chat(ctx, {}, q, ask)).body).toEqual({ reply: 'Milk' })
    const sent = requests[1].messages
    expect(sent[1].role).toBe('assistant')
    expect(sent[1].content[0]).toMatchObject({ type: 'tool_use', id: 'call-1' })
    expect(sent[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'call-1', is_error: false })
    expect(sent[2].content[0].content).toContain('Groceries')
  })

  it('returns every result of parallel calls in one message', async () => {
    replies = [
      message('tool_use', [
        { type: 'tool_use', id: 'a', name: 'get_tasks', input: {} },
        { type: 'tool_use', id: 'b', name: 'get_recipes', input: {} },
      ]),
      text('Done'),
    ]
    await chat(ctx, {}, q, ask)
    expect(requests[1].messages[2].content.map((b: { tool_use_id: string }) => b.tool_use_id)).toEqual(['a', 'b'])
  })

  it('gives a bad tool call back as an error the model can correct', async () => {
    replies = [toolCall('get_meal_plan', { from: 'tomorrow', to: '2026-09-20' }), text('Done')]
    await chat(ctx, {}, q, ask)
    expect(requests[1].messages[2].content[0]).toMatchObject({ is_error: true })
  })

  it('takes tools away on the fifth round, so that it has to answer', async () => {
    replies = [toolCall('get_tasks'), toolCall('get_tasks'), toolCall('get_tasks'), toolCall('get_tasks'), text('Enough')]
    expect((await chat(ctx, {}, q, ask)).body).toEqual({ reply: 'Enough' })
    expect(requests).toHaveLength(5)
    expect(requests[3].tool_choice).toEqual({ type: 'auto' })
    expect(requests[4].tool_choice).toEqual({ type: 'none' })
  })

  it('stops rather than loop if the model ignores that', async () => {
    replies = [toolCall('get_tasks'), toolCall('get_tasks'), toolCall('get_tasks'), toolCall('get_tasks'), toolCall('get_tasks'), text('Late')]
    await chat(ctx, {}, q, ask).catch(() => undefined)
    expect(requests.length).toBeLessThanOrEqual(5)
  })

  it('says when an answer was cut short', async () => {
    replies = [message('max_tokens', [{ type: 'text', text: 'Monday is' }])]
    expect((await chat(ctx, {}, q, ask)).body).toEqual({ reply: 'Monday is…\n\n(That answer was cut short.)' })
  })

  it('handles a refusal', async () => {
    replies = [message('refusal', [])]
    expect((await chat(ctx, {}, q, ask)).body).toEqual({ reply: "Sorry, I can't help with that one." })
  })

  it('is refused cleanly until a key is set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(chat(ctx, {}, q, ask)).rejects.toMatchObject({ status: 503, code: 'CHAT_OFF' })
    expect(requests).toHaveLength(0)
  })

  it.each([
    [429, 503, 'CHAT_BUSY'],
    [529, 503, 'CHAT_BUSY'],
    [401, 502, 'CHAT_FAILED'],
    [400, 502, 'CHAT_FAILED'],
  ])('turns a %i from the model into a %i', async (from, to, code) => {
    replies = [errorResponse(from)]
    await expect(chat(ctx, {}, q, ask)).rejects.toMatchObject({ status: to, code })
    expect(requests).toHaveLength(1)
  })

  it.each([
    ['empty', { messages: [] }],
    ['ending on an answer', { messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }] }],
    ['starting with an answer', { messages: [{ role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Hi' }] }],
    ['with an unknown role', { messages: [{ role: 'system', content: 'Hi' }] }],
    ['with a very long question', { messages: [{ role: 'user', content: 'x'.repeat(8001) }] }],
    ['with too many messages', { messages: Array(21).fill({ role: 'user', content: 'Hi' }) }],
  ])('rejects a conversation %s', async (_name, body) => {
    await expect(chat(ctx, {}, q, body)).rejects.toBeInstanceOf(ValidationError)
    expect(requests).toHaveLength(0)
  })
})

describe('chat tools', () => {
  const run = async (name: string, input: object = {}) => {
    const names = new Map([['m-tim', 'Tim'], ['m-jo', 'Jo']])
    const out = await runTool(name, input, { ...ctx, names })
    return { ...out, data: out.isError ? undefined : JSON.parse(out.content) }
  }

  it('A9j: none of them can change anything', async () => {
    const before = JSON.stringify(await ctx.store.byType(tim.familyId, 'task'))
    const write = vi.spyOn(ctx.store, 'upsert')
    const remove = vi.spyOn(ctx.store, 'delete')
    for (const { name } of toolDefinitions) await run(name, { from: '2026-09-14', to: '2026-09-20', date: '2026-09-16', id: 'r-chicken' })
    expect(write).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(JSON.stringify(await ctx.store.byType(tim.familyId, 'task'))).toBe(before)
  })

  it('each has a schema of type object', () => {
    for (const t of toolDefinitions) expect(t.input_schema.type).toBe('object')
    expect(new Set(toolDefinitions.map((t) => t.name)).size).toBe(toolDefinitions.length)
  })

  it('refuses a tool that does not exist', async () => {
    expect(await run('delete_everything')).toMatchObject({ isError: true })
  })

  it('reads tasks for the whole family, with names rather than ids', async () => {
    const { data, content } = await run('get_tasks')
    expect(data.open.map((t: { assignee: string }) => t.assignee)).toContain('Tim')
    expect(data.recentlyDone.length).toBeGreaterThan(0)
    expect(content).not.toContain('m-tim')
  })

  it('reads a range of the meal plan', async () => {
    const monday = (await ctx.store.byType<{ date: string } & Recipe>(tim.familyId, 'plan')).map((p) => p.date).sort()[0]
    const { data } = await run('get_meal_plan', { from: monday, to: monday })
    expect(data).toEqual(expect.arrayContaining([expect.objectContaining({ slot: 'dinner', text: 'Fish finger sandwiches' })]))
  })

  it('refuses a backwards or very long range, rather than cut it short', async () => {
    expect(await run('get_meal_plan', { from: '2026-09-20', to: '2026-09-14' })).toMatchObject({ isError: true })
    expect(await run('get_calendar', { from: '2026-01-01', to: '2026-12-31' })).toMatchObject({ isError: true })
    expect((await run('get_meal_plan', { from: '2026-06-01', to: '2026-09-01' })).isError).toBe(false)
  })

  it('leaves methods out of the list and puts them in the full recipe', async () => {
    const list = await run('get_recipes')
    expect(list.data[0].ingredients).toBeDefined()
    expect(list.data[0].method).toBeUndefined()
    const one = await run('get_recipe', { id: 'r-chicken' })
    expect(one.data.method).toBeTruthy()
    expect(await run('get_recipe', { id: 'nope' })).toMatchObject({ isError: true })
  })

  it('leaves out ticked items', async () => {
    const { content } = await run('get_shopping_lists')
    expect(content).not.toContain('Eggs')
  })

  it('shows chores for any day in the week, and who has them', async () => {
    const weeks = (await ctx.store.byType<{ week: string } & Recipe>(tim.familyId, 'choreWeek')).map((c) => c.week)
    const { data } = await run('get_chores', { date: weeks[0] })
    expect(data).toEqual(expect.arrayContaining([expect.objectContaining({ assignee: 'Tim' })]))
  })

  it('shows calendar times in UK local time', async () => {
    const google = await import('../src/lib/googleCalendars')
    vi.spyOn(google, 'readCalendars').mockResolvedValue({
      calendars: [],
      unavailable: false,
      events: [
        { id: 'a', title: 'Dentist', allDay: false, start: '2026-07-01T09:00:00.000Z', end: '2026-07-01T09:30:00.000Z', occurrenceDate: '2026-07-01', recurring: false, external: { label: 'Family', colour: '#000000' } },
      ],
    })
    const { data } = await run('get_calendar', { from: '2026-07-01', to: '2026-07-01' })
    expect(data.events[0]).toMatchObject({ title: 'Dentist', start: '2026-07-01 10:00', end: '2026-07-01 10:30', calendar: 'Family' })
    vi.restoreAllMocks()
  })

  it('never gives the model the text of an unexpected failure', async () => {
    vi.spyOn(ctx.store, 'byType').mockRejectedValueOnce(new Error('secret feed address'))
    const { content, isError } = await run('get_recipes')
    expect(isError).toBe(true)
    expect(content).not.toContain('secret')
  })
})
