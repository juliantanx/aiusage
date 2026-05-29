import { randomBytes } from 'node:crypto'

const CSRF_TOKEN_LENGTH = 32
const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex')
}

export function getCsrfTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').map(c => c.trim())
  const csrfCookie = cookies.find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`))
  if (!csrfCookie) return null
  return csrfCookie.split('=')[1]
}

export function getCsrfTokenFromRequest(request: Request): string | null {
  // Check header first
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  if (headerToken) return headerToken

  // Check form data for POST requests
  return null
}

export function validateCsrfToken(request: Request): boolean {
  // Only validate for state-changing methods
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    return true
  }

  // Skip CSRF for API endpoints that use HMAC auth (CLI uploads)
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/leaderboard/uploads')) {
    return true
  }

  // Skip CSRF for OAuth callbacks (they use state parameter)
  if (url.pathname.startsWith('/api/oauth/') && url.pathname.endsWith('/callback')) {
    return true
  }

  // Skip CSRF for device complete (uses PKCE)
  if (url.pathname === '/api/cli/device/complete') {
    return true
  }

  // For browser forms, validate CSRF token
  const cookieToken = getCsrfTokenFromCookie(request.headers.get('cookie'))
  const requestToken = getCsrfTokenFromRequest(request)

  if (!cookieToken || !requestToken) {
    return false
  }

  // Constant-time comparison
  if (cookieToken.length !== requestToken.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ requestToken.charCodeAt(i)
  }

  return result === 0
}

export function setCsrfCookie(response: Response, token: string): Response {
  response.headers.set(
    'Set-Cookie',
    `${CSRF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`
  )
  return response
}
