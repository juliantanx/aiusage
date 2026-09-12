import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { queryClaudeCodeQuota, queryCodexQuota, queryCopilotQuota } from '../src/quota.js'

vi.mock('node:os', () => ({ homedir: () => '/test', platform: () => 'win32' }))
vi.mock('node:fs', () => ({ existsSync: () => true, readFileSync: vi.fn() }))

describe('quota credential confidentiality', () => {
  const secret = 'credential-secret-sentinel'
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it.each([queryClaudeCodeQuota, queryCodexQuota])('does not return credential JSON in parser errors', async query => {
    vi.mocked(readFileSync).mockReturnValue(secret)
    const result = await query()
    expect(result.credentialStatus).toBe('parse_error')
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it.each([
    [queryClaudeCodeQuota, { claudeAiOauth: { accessToken: secret } }],
    [queryCodexQuota, { auth_mode: 'chatgpt', tokens: { access_token: secret } }],
    [queryCopilotQuota, { 'github.com': { oauth_token: secret } }],
  ])('does not return secrets echoed by upstream failures', async (query, credentials) => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(credentials))
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const response of [new Response(secret, { status: 500 }), new Response(secret, { status: 200 })]) {
      fetch.mockResolvedValueOnce(response)
      const result = await query()
      expect(result.success).toBe(false)
      expect(JSON.stringify(result)).not.toContain(secret)
    }
    fetch.mockRejectedValueOnce(new Error(secret))
    const result = await query()
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})
