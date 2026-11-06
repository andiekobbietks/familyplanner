import { app, type HttpMethod, type HttpRequest, type InvocationContext } from '@azure/functions'
import { getCaller, integrationCaller, principalRoles } from './caller'
import { displayCaller } from './displayKey'
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
  /** Response headers. Only the display pairing and renewal set any (a cookie, S34). */
  headers?: Record<string, string>
}

export type Handler = (ctx: Ctx, params: Record<string, string>, query: URLSearchParams, body: unknown) => Promise<Result>

interface RouteOptions {
  roles?: Role[]
  /** Called by a service holding the integration token, not a signed-in member. Needs its own rule in staticwebapp.config.json. */
  integration?: boolean
  /** Also open to the `display` role. Every route without it refuses that role, so a new route is closed to the wall screen by default. GET only, unless `displayWrite`. */
  display?: boolean
  /** A /api/display/* alias (S34): a signed-in member, or a wall display's key cookie. Read only, unless `displayWrite`. Open at the edge. */
  displayKey?: boolean
  /**
   * The one kind of write the wall display may make: marking a to-do done or not done (S34).
   * Must be a POST under display/ with `display` and `displayKey`, and the body must be sent as
   * JSON, which a page on another site can't do without the browser asking first.
   */
  displayWrite?: boolean
  /** The display pairing route: no caller yet, the body carries the key. Open at the edge. */
  pairing?: boolean
}

const PAIRING: Caller = { memberId: 'pairing', role: 'display', familyId: '', displayName: 'Pairing' }

/**
 * Every API function follows the same shape (section 6): resolve the caller,
 * check the role, hand the handler a validated body, return JSON. Logging
 * covers method, route, status, latency and user id and never the body or
 * the principal header (S23). Failed authorisation is logged at warning (S24).
 */
export function route(name: string, method: HttpMethod, path: string, opts: RouteOptions, handler: Handler): void {
  if (opts.displayWrite) {
    if (method !== 'POST' || !opts.display || !opts.displayKey || !path.startsWith('display/')) throw new Error(`${name}: a display write must be a POST display-key route under display/`)
  } else {
    if (opts.display && method !== 'GET') throw new Error(`${name}: the display role may only read`)
    if (opts.displayKey && (method !== 'GET' || !opts.display || !path.startsWith('display/'))) throw new Error(`${name}: a display-key route must be a GET under display/`)
  }
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
    // A custom header, because SWA does not reliably pass Authorization through to managed functions.
    let setCookie: string | undefined
    let caller: Caller
    if (opts.pairing) caller = PAIRING
    else if (opts.integration) caller = integrationCaller(req.headers.get('x-integration-token'))
    else if (opts.displayKey) {
      const resolved = await displayCaller(req.headers.get('x-ms-client-principal'), req.headers.get('cookie'), store, new Date())
      caller = resolved.caller
      setCookie = resolved.setCookie
    } else caller = await getCaller(req.headers.get('x-ms-client-principal'), store)
    userId = caller.memberId
    // Pairing has no caller yet; its handler only checks the key and sets the cookie.
    if (caller.role === 'display' && !opts.display && !opts.pairing) throw new HttpError(403, 'DISPLAY_READ_ONLY', 'The display can only read')
    if (opts.roles && !opts.roles.includes(caller.role)) throw new HttpError(403, 'FORBIDDEN', 'Admin only')

    // SameSite=Strict already keeps the display cookie off requests from other sites. Requiring JSON is a
    // second lock on the only route the key can write through: a form on another site can't send it.
    if (opts.displayWrite && !(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      throw new HttpError(415, 'JSON_ONLY', 'Body must be sent as JSON')
    }
    let body: unknown
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      body = await req.json().catch(() => {
        throw new HttpError(400, 'BAD_JSON', 'Body must be JSON')
      })
    }
    const result = await handler({ store, caller, now: new Date() }, req.params, req.query, body)
    status = result.status ?? 200
    const headers = { ...(setCookie ? { 'Set-Cookie': setCookie } : {}), ...(result.headers ?? {}) }
    const extra = Object.keys(headers).length ? { headers } : {}
    return status === 204 ? { status, ...extra } : { status, jsonBody: result.body, ...extra }
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
