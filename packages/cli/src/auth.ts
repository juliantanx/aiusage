import { createHash, timingSafeEqual } from 'node:crypto'
import type http from 'node:http'

export const AUTH_COOKIE_NAME = 'aiusage_dashboard_auth'
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export function getDashboardPassword(): string | null {
  const password = process.env.AIUSAGE_DASHBOARD_PASSWORD?.trim()
  return password ? password : null
}

export function verifyPassword(configuredPassword: string | null | undefined, submittedPassword: string | null | undefined): boolean {
  if (!configuredPassword) return true
  if (!submittedPassword) return false
  return safeEqual(configuredPassword, submittedPassword)
}

export function buildAuthCookie(password: string): string {
  return `${AUTH_COOKIE_NAME}=${hashPassword(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`
}

export function buildClearAuthCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function isAuthenticated(configuredPassword: string | null | undefined, cookieHeader: string | null | undefined): boolean {
  if (!configuredPassword) return true
  const cookies = parseCookies(cookieHeader ?? '')
  const token = cookies.get(AUTH_COOKIE_NAME)
  if (!token) return false
  return safeEqual(token, hashPassword(configuredPassword))
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/index.html') return true
  if (pathname === '/api/auth/status' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') return true
  return isStaticAssetPath(pathname)
}

export function shouldProtectApiPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false
  if (isPublicPath(pathname)) return false

  // The public home page depends on summary and quota display data.
  if (pathname === '/api/summary') return false
  if (pathname === '/api/quotas') return false
  return true
}

export function requireAuth(password: string | null, req: http.IncomingMessage): boolean {
  return isAuthenticated(password, req.headers.cookie)
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function parseCookies(cookieHeader: string): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (name) cookies.set(name, value)
  }
  return cookies
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function isStaticAssetPath(pathname: string): boolean {
  return /\.(?:js|css|json|png|jpg|jpeg|svg|ico|woff|woff2|map)$/i.test(pathname)
}
