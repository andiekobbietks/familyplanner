import { app, type HttpMethod, type HttpRequest, type InvocationContext } from '@azure/functions'
import { getCaller, principalRoles } from './caller'
import { HttpError } from './errors'
import { ValidationError } from './schemas'
import { getStore, type Store } from './store'
import type { Caller, Role } from './types'

export interface Ctx {
  store: Store
  caller: Caller
  now: Date
}

export interface Result {
  status?: number
  body?: unknown
}

export type Handler = (ctx: Ctx, params: Record<string, string>, query: URLSearchParams, body: unknown) => Promise<Result>

interface RouteOptions {
  roles?: Role[]
}

/**
 * Every API function follows the same shape (section 6): resolve the caller,
 * check the role, hand the handler a validated body, return JSON. Logging
 * covers method, route, status, latency and user id and never the body or
 * the principal header (S23). Failed authorisation is logged at warning (S24).
 */
export function route(name: string, method: HttpMethod, path: string, opts: RouteOptions, handler: Handler): void {
  app.http(name, {
    methods: [method],
    route: path,
    authLevel: 'anonymous', // SWA route rules gate the network edge (S5); the caller check below gates the function (S6).
    handler: (req, context) => run(req, context, path, opts, handler),
  })
}

export async function run(
  req: HttpRequest,
  context: InvocationContext,
  path: string,
  opts: RouteOptions,
  handler: Handler,
) {
  const started = Date.now()
  let status = 500
  let userId = '-'
  try {
    const store = await getStore()
    const caller = await getCaller(req.headers.get('x-ms-client-principal'), store)
    userId = caller.memberId
    if (opts.roles && !opts.roles.includes(caller.role)) throw new HttpError(403, 'FORBIDDEN', 'Admin only')

    let body: unknown
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      body = await req.json().catch(() => {
        throw new HttpError(400, 'BAD_JSON', 'Body must be JSON')
      })
    }
    const result = await handler({ store, caller, now: new Date() }, req.params, req.query, body)
    status = result.status ?? 200
    return status === 204 ? { status } : { status, jsonBody: result.body }
  } catch (e) {
    if (e instanceof HttpError) {
      status = e.status
      if (status === 401 || status === 403) context.warn(`auth failed: ${e.code} user=${userId} roles=${principalRoles(req.headers.get('x-ms-client-principal'))}`)
      return { status, jsonBody: { error: e.message, code: e.code } }
    }
    if (e instanceof ValidationError) {
      status = 400
      return { status, jsonBody: { error: e.message, code: 'VALIDATION' } }
    }
    status = 500
    context.error(`unhandled: ${req.method} /api/${path}: ${(e as Error).message}`)
    return { status, jsonBody: { error: 'Something went wrong', code: 'INTERNAL' } }
  } finally {
    context.log(`${req.method} /api/${path} ${status} ${Date.now() - started}ms user=${userId}`)
  }
}
