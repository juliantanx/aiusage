import type { Handle } from '@sveltejs/kit'
import { runMigrations } from '$lib/server/db/schema.js'
import { getUserFromEvent } from '$lib/server/auth/session.js'
import { startCleanupCron } from '$lib/server/db/cleanup.js'
import { generateCsrfToken, validateCsrfToken, setCsrfCookie } from '$lib/server/auth/csrf.js'

let initialized = false

async function ensureInitialized() {
  if (initialized) return
  try {
    await runMigrations()
    startCleanupCron()
    initialized = true
  } catch (err) {
    console.error('Failed to initialize:', err)
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  await ensureInitialized()

  // Set user in locals
  const user = await getUserFromEvent(event)
  event.locals.user = user

  // Validate CSRF for state-changing requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(event.request.method)) {
    const url = event.url.pathname

    // Only validate CSRF for browser form submissions (not API endpoints with HMAC auth)
    if (!url.startsWith('/api/leaderboard/uploads') &&
        !url.startsWith('/api/cli/sync/') &&
        !url.startsWith('/api/cli/device/start') &&
        !url.startsWith('/api/cli/device/complete') &&
        !(url.startsWith('/api/oauth/') && url.endsWith('/callback'))) {
      if (!validateCsrfToken(event.request)) {
        return new Response('CSRF token validation failed', { status: 403 })
      }
    }
  }

  // Security headers
  const response = await resolve(event)

  // Fix: SvelteKit adapter-node may not set content-type for .ico files.
  // With X-Content-Type-Options: nosniff, browsers/crawlers need the header to detect the favicon.
  if (event.url.pathname === '/favicon.ico' && !response.headers.get('content-type')) {
    response.headers.set('content-type', 'image/x-icon')
  }

  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Prevent CDNs from caching dynamic API responses
  if (event.url.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store')
  } else {
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'")
  }

  // Set CSRF cookie for browser requests
  if (!event.url.pathname.startsWith('/api/')) {
    const csrfToken = generateCsrfToken()
    setCsrfCookie(response, csrfToken)
  }

  return response
}
