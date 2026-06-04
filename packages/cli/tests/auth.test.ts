import { describe, expect, it } from 'vitest'
import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  isAuthenticated,
  isPublicPath,
  shouldProtectApiPath,
  verifyPassword,
} from '../src/auth.js'

describe('dashboard auth helpers', () => {
  it('does not require auth when dashboard password is unset', () => {
    expect(verifyPassword(undefined, 'anything')).toBe(true)
    expect(verifyPassword('', 'anything')).toBe(true)
  })

  it('verifies submitted password against configured password', () => {
    expect(verifyPassword('secret', 'secret')).toBe(true)
    expect(verifyPassword('secret', 'wrong')).toBe(false)
  })

  it('allows the dashboard home page and auth endpoints without a session', () => {
    expect(isPublicPath('/')).toBe(true)
    expect(isPublicPath('/index.html')).toBe(true)
    expect(isPublicPath('/api/auth/status')).toBe(true)
    expect(isPublicPath('/api/auth/login')).toBe(true)
  })

  it('protects non-home dashboard routes', () => {
    expect(isPublicPath('/overview')).toBe(false)
    expect(isPublicPath('/tokens')).toBe(false)
    expect(isPublicPath('/settings')).toBe(false)
    expect(isPublicPath('/sessions/session-1')).toBe(false)
  })

  it('protects data and mutating API routes while leaving home summary public', () => {
    expect(shouldProtectApiPath('/api/summary')).toBe(false)
    expect(shouldProtectApiPath('/api/tokens')).toBe(true)
    expect(shouldProtectApiPath('/api/config')).toBe(true)
    expect(shouldProtectApiPath('/api/sync')).toBe(true)
  })

  it('recognizes the generated auth cookie', () => {
    const cookie = buildAuthCookie('secret')
    const cookieHeader = cookie.split(';')[0]

    expect(cookieHeader.startsWith(`${AUTH_COOKIE_NAME}=`)).toBe(true)
    expect(isAuthenticated('secret', cookieHeader)).toBe(true)
    expect(isAuthenticated('different', cookieHeader)).toBe(false)
  })
})
