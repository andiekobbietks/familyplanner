export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(`${status} ${message}`)
  }
}

/**
 * The API base for the page being shown. The wall page and its pairing page use the
 * /api/display/* aliases, which also accept a paired display's key (S34); everything
 * else uses /api, which needs a signed-in member.
 */
export function apiUrl(path: string, pathname: string): string {
  const wall = pathname === '/display' || pathname.startsWith('/display/')
  return `${wall ? '/api/display' : '/api'}${path}`
}

/** Answers API calls in place of the server, for the wall's demo mode. While set, nothing is fetched. */
export type ApiOverride = (path: string, init: RequestInit & { json?: unknown }) => Promise<unknown>
let override: ApiOverride | null = null
export function setApiOverride(fn: ApiOverride | null) {
  override = fn
}

/**
 * One fetch wrapper for every API call. A 401 means the session has gone:
 * go to login rather than show a broken screen (section 5.1). A 403 with a
 * membership code means the account is signed in but not invited.
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (override) return (await override(path, init)) as T
  const { json, ...rest } = init
  const res = await fetch(apiUrl(path, window.location.pathname), {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
    redirect: 'manual',
  })
  // SWA turns a route-rule 401 into a redirect to the provider, which fetch must not follow.
  if (res.type === 'opaqueredirect') {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = undefined
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = undefined
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string }
    if (res.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)
    } else if (res.status === 403 && (err.code === 'NOT_A_MEMBER' || err.code === 'MEMBER_REMOVED')) {
      window.location.assign('/not-a-member?from=api')
    }
    throw new ApiError(res.status, err.code ?? 'ERROR', err.error ?? res.statusText)
  }
  return data as T
}
