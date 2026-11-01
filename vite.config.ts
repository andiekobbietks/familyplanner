import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Local stand-in for the Static Web Apps auth layer.
 *
 * In production SWA serves /.auth/* itself and injects `x-ms-client-principal`
 * on every /api call. Locally this plugin does the same job so the API code has
 * no development-only branches: it always reads the header, exactly as in prod.
 *
 * Who you are is held in a cookie, `fp_dev_user`. No cookie means logged out.
 * Visit /.auth/dev?as=jo (or charlie, robin, stranger) to switch identity.
 */
type DevUser = { userId: string; userDetails: string; roles: string[] }
const DEV_USERS: Record<string, DevUser> = {
  tim: { userId: 'dev-tim', userDetails: 'tim@example.com', roles: ['admin'] },
  jo: { userId: 'dev-jo', userDetails: 'jo@example.com', roles: ['admin'] },
  charlie: { userId: 'dev-charlie', userDetails: 'charlie@example.com', roles: ['member'] },
  robin: { userId: 'dev-robin', userDetails: 'robin@example.com', roles: ['member'] },
  // Logged in with the provider but never invited: exercises the not-a-member path.
  stranger: { userId: 'dev-stranger', userDetails: 'stranger@example.com', roles: [] },
}

function readDevUser(req: IncomingMessage): DevUser | null {
  const cookie = req.headers.cookie ?? ''
  const m = /(?:^|;\s*)fp_dev_user=([a-z]+)/.exec(cookie)
  return m ? DEV_USERS[m[1]] ?? null : null
}

function principalOf(u: DevUser) {
  return {
    identityProvider: 'aad',
    userId: u.userId,
    userDetails: u.userDetails,
    userRoles: ['anonymous', 'authenticated', ...u.roles],
    claims: [],
  }
}

function redirect(res: ServerResponse, to: string, setCookie?: string) {
  const headers: Record<string, string> = { Location: to }
  if (setCookie) headers['Set-Cookie'] = setCookie
  res.writeHead(302, headers)
  res.end()
}

function devAuth(): Plugin {
  return {
    name: 'familyplanner-dev-auth',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname
        if (!path.startsWith('/.auth/')) return next()

        if (path === '/.auth/me') {
          const u = readDevUser(req)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ clientPrincipal: u ? principalOf(u) : null }))
          return
        }
        if (path === '/.auth/login/aad') {
          const as = url.searchParams.get('as') ?? 'tim'
          const back = url.searchParams.get('post_login_redirect_uri') ?? '/'
          return redirect(res, back.startsWith('/') ? back : '/', `fp_dev_user=${as}; Path=/; SameSite=Lax`)
        }
        if (path.startsWith('/.auth/login/')) {
          // Every other provider is disabled (S2).
          res.statusCode = 404
          res.end('Not found')
          return
        }
        if (path === '/.auth/logout') {
          return redirect(res, '/login', 'fp_dev_user=; Path=/; Max-Age=0')
        }
        if (path === '/.auth/dev') {
          const as = url.searchParams.get('as') ?? 'tim'
          return redirect(res, '/', `fp_dev_user=${as}; Path=/; SameSite=Lax`)
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devAuth()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            const u = readDevUser(req as IncomingMessage)
            if (u) {
              proxyReq.setHeader(
                'x-ms-client-principal',
                Buffer.from(JSON.stringify(principalOf(u))).toString('base64'),
              )
            } else {
              proxyReq.removeHeader('x-ms-client-principal')
            }
          })
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
