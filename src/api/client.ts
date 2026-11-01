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
 * One fetch wrapper for every API call. A 401 means the session has gone:
 * go to login rather than show a broken screen (section 5.1). A 403 with a
 * membership code means the account is signed in but not invited.
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(`/api${path}`, {
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
