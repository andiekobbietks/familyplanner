/**
 * Where the login page sends you after signing in, from its `next` parameter. Only a path on this site
 * is kept: it must start with one "/", and backslashes, control characters and "//" are refused, because
 * browsers and React Router 6 can read "//host" or "/\host" as another site (an open redirect).
 */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/'
  return next
}
