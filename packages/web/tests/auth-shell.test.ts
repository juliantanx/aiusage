import { describe, expect, it } from 'vitest'
import { getAuthShellState } from '../src/lib/auth-shell.js'

describe('auth shell state', () => {
  it('uses full shell when password auth is disabled', () => {
    expect(getAuthShellState({ pathname: '/', authEnabled: false, authenticated: false, authLoading: false })).toBe('shell')
    expect(getAuthShellState({ pathname: '/overview', authEnabled: false, authenticated: false, authLoading: false })).toBe('shell')
  })

  it('uses public home shell for unauthenticated home page', () => {
    expect(getAuthShellState({ pathname: '/', authEnabled: true, authenticated: false, authLoading: false })).toBe('public-home')
  })

  it('uses login page for unauthenticated protected routes', () => {
    expect(getAuthShellState({ pathname: '/tokens', authEnabled: true, authenticated: false, authLoading: false })).toBe('login-page')
  })

  it('uses full shell after authentication', () => {
    expect(getAuthShellState({ pathname: '/', authEnabled: true, authenticated: true, authLoading: false })).toBe('shell')
    expect(getAuthShellState({ pathname: '/tokens', authEnabled: true, authenticated: true, authLoading: false })).toBe('shell')
  })

  it('shows loading shell for protected routes while auth status loads', () => {
    expect(getAuthShellState({ pathname: '/tokens', authEnabled: false, authenticated: false, authLoading: true })).toBe('loading')
  })
})
