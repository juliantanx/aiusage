import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { createApiServer } from '../../src/api/server.js'
import { queryAllQuotas } from '../../src/quota.js'
import { loadConfig } from '../../src/config.js'

vi.mock('../../src/config.js', async (original) => ({
  ...await original<typeof import('../../src/config.js')>(),
  loadConfig: vi.fn(() => null),
  saveConfig: vi.fn(),
}))
vi.mock('../../src/quota.js', () => ({ queryAllQuotas: vi.fn(async () => [{ tool: 'codex', success: true }]) }))

describe('local API trust boundary', () => {
  let db: Database.Database
  let server: http.Server
  let base: string
  const refresh = vi.fn(async () => ({ parsedCount: 0 }))

  async function start(password = '', extraOptions: Parameters<typeof createApiServer>[1] = {}) {
    vi.stubEnv('AIUSAGE_DASHBOARD_PASSWORD', password)
    server = createApiServer(db, { onRefresh: refresh, ...extraOptions })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as any).port}`
  }

  async function requestWithHost(route: string, options: { method: string, host: string, origin: string, forwardedProto: string, body?: string }) {
    const target = new URL(route, base)
    return await new Promise<{ status: number, setCookie: string | undefined }>((resolve, reject) => {
      const request = http.request({
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: options.method,
        headers: {
          Host: options.host,
          Origin: options.origin,
          'X-Forwarded-Proto': options.forwardedProto,
        },
      }, (response) => {
        response.resume()
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          setCookie: response.headers['set-cookie']?.[0],
        }))
      })
      request.on('error', reject)
      request.end(options.body)
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadConfig).mockReturnValue(null)
    db = new Database(':memory:')
    initializeDatabase(db)
  })
  afterEach(async () => {
    server?.closeAllConnections()
    if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
    vi.unstubAllEnvs()
  })

  it('allows local native clients and same-origin dashboard requests without CORS headers', async () => {
    await start()
    for (const headers of [{}, { Origin: base }]) {
      const response = await fetch(`${base}/api/config`, { headers })
      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    const response = await fetch(`${base}/api/refresh`, { method: 'POST', headers: { Origin: base } })
    expect(response.status).toBe(200)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it.each(['https://evil.example', 'null', 'http://localhost:9999'])('rejects origin %s before reads, writes, login, or preflight', async (origin) => {
    await start()
    for (const [method, route] of [['GET', '/api/config'], ['POST', '/api/refresh'], ['POST', '/api/auth/login'], ['POST', '/api/github/start'], ['POST', '/api/github/connect'], ['OPTIONS', '/api/config']]) {
      const response = await fetch(`${base}${route}`, { method, headers: { Origin: origin } })
      expect(response.status).toBe(403)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
      expect(response.headers.get('access-control-allow-methods')).toBeNull()
    }
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rejects a rebinding Host even when Origin matches it', async () => {
    await start()
    const response = await requestWithHost('/api/config', {
      method: 'GET',
      host: 'evil.example',
      origin: 'http://evil.example',
      forwardedProto: 'http',
    })
    expect(response.status).toBe(403)
  })

  it('rejects cross-site requests without Origin and prevents GET refresh side effects', async () => {
    await start()
    expect((await fetch(`${base}/api/refresh`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    const response = await fetch(`${base}/api/refresh`)
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('requires authentication for quotas and adjacent APIs, including session IDs ending in asset extensions', async () => {
    await start('secret')
    expect((await fetch(`${base}/api/github/start`, { method: 'POST' })).status).toBe(401)
    expect((await fetch(`${base}/api/github/connect`, { method: 'POST' })).status).toBe(401)
    for (const route of ['/api/quotas', '/api/config', '/api/config/credentials/status', '/api/config/credential?ref=token', '/api/cli/sync/status', '/api/sessions/session.json', '/api/detected-tools']) {
      expect((await fetch(`${base}${route}`)).status).toBe(401)
    }
    expect(queryAllQuotas).not.toHaveBeenCalled()
    expect((await fetch(`${base}/api/home-summary?range=day`)).status).toBe(200)
    const wrong = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ password: 'wrong' }) })
    expect(wrong.status).toBe(401)
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: base }, body: JSON.stringify({ password: 'secret' }) })
    expect(login.status).toBe(200)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]
    const response = await fetch(`${base}/api/quotas`, { headers: { Cookie: cookie } })
    expect(response.status).toBe(200)
    expect(queryAllQuotas).toHaveBeenCalledOnce()
    expect((await fetch(`${base}/api/quotas`, { headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status).toBe(403)
    expect(queryAllQuotas).toHaveBeenCalledOnce()
  })

  it('keeps auth and clear cookies usable over localhost HTTP', async () => {
    await start('secret')
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: base },
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).not.toContain('Secure')

    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Origin: base } })
    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).not.toContain('Secure')
  })

  it('sets Secure on auth and clear cookies behind an HTTPS reverse proxy', async () => {
    await start('secret')
    const login = await requestWithHost('/api/auth/login', {
      method: 'POST',
      host: 'dashboard.example',
      origin: 'https://dashboard.example',
      forwardedProto: 'https',
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(login.status).toBe(200)
    expect(login.setCookie).toContain('; Secure')

    const logout = await requestWithHost('/api/auth/logout', {
      method: 'POST',
      host: 'dashboard.example',
      origin: 'https://dashboard.example',
      forwardedProto: 'https',
    })
    expect(logout.status).toBe(200)
    expect(logout.setCookie).toContain('; Secure')
  })

  it('rejects forwarded protocols that disagree with Origin or are ambiguous', async () => {
    await start('secret')
    const mismatched = await requestWithHost('/api/auth/login', {
      method: 'POST',
      host: 'dashboard.example',
      origin: 'https://dashboard.example',
      forwardedProto: 'http',
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(mismatched.status).toBe(403)

    const ambiguous = await requestWithHost('/api/auth/login', {
      method: 'POST',
      host: 'dashboard.example',
      origin: 'https://dashboard.example',
      forwardedProto: 'https, http',
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(ambiguous.status).toBe(403)
  })

  it('retains passwordless local quota access', async () => {
    await start()
    expect((await fetch(`${base}/api/quotas`)).status).toBe(200)
  })

  function seedSummaryData() {
    const insertRecord = db.prepare(`
      INSERT INTO records (id, ts, ingested_at, synced_at, updated_at, line_offset,
        tool, model, provider, input_tokens, output_tokens, cache_read_tokens,
        cache_write_tokens, thinking_tokens, cost, cost_source, session_id,
        source_file, device, device_instance_id)
      VALUES (@id, @ts, @ts, NULL, @ts, 0,
        @tool, @model, 'provider', @input, @output, 0,
        0, 0, @cost, 'pricing', @session,
        '/logs/' || @id || '.jsonl', 'local-device', 'local-uuid-0000')
    `)
    const now = Date.now()
    insertRecord.run({ id: 'r-claude', ts: now, tool: 'claude-code', model: 'claude-sonnet-4-5', input: 100, output: 50, cost: 0.5, session: 's-claude' })
    insertRecord.run({ id: 'r-codex', ts: now, tool: 'codex', model: 'gpt-5', input: 20, output: 10, cost: 0.2, session: 's-codex' })
    db.prepare(`
      INSERT INTO synced_records (id, ts, tool, model, provider, input_tokens, output_tokens, cache_read_tokens,
        cache_write_tokens, thinking_tokens, cost, cost_source, session_key, device, device_instance_id, updated_at)
      VALUES ('r-remote', ?, 'codex', 'gpt-5', 'provider', 7, 3, 0, 0, 0, 0.1, 'pricing', 's-remote', 'remote-device', 'remote-uuid-0001', ?)
    `).run(now, now)
    const insertToolCall = db.prepare('INSERT INTO tool_calls (id, record_id, tool, name, ts, call_index) VALUES (?, ?, ?, ?, ?, ?)')
    insertToolCall.run('tc-bash', 'r-claude', null, 'Bash', now, 0)
    insertToolCall.run('tc-mcp', 'r-claude', null, 'mcp__github__search', now, 1)
  }

  const TOTAL_KEYS = ['activeDays', 'cacheReadTokens', 'cacheWriteTokens', 'inputTokens', 'outputTokens', 'thinkingTokens', 'totalCost', 'totalSessions', 'totalTokens']
  const DETAIL_KEYS = ['byTool', 'topToolCalls', 'topMcpServers']

  it('exposes only aggregate home totals without authentication and keeps summary detail and filtering behind login', async () => {
    seedSummaryData()
    await start('secret', { currentDeviceInstanceId: 'local-uuid-0000' })

    // Detailed summary, with or without filters, is unavailable before login.
    for (const route of ['/api/summary', '/api/summary?range=day', '/api/summary?device=remote-uuid-0001', '/api/summary?tool=codex']) {
      const response = await fetch(base + route)
      expect(response.status).toBe(401)
      const body = await response.text()
      for (const key of [...TOTAL_KEYS, ...DETAIL_KEYS, 'Bash', 'github', 'claude-code']) expect(body).not.toContain(key)
    }

    // The public home endpoint returns aggregate totals only and ignores device/tool filters.
    const home = await fetch(`${base}/api/home-summary?range=all&device=remote-uuid-0001&tool=codex`)
    expect(home.status).toBe(200)
    const homeBody = await home.json()
    expect(Object.keys(homeBody).sort()).toEqual(TOTAL_KEYS)
    expect(homeBody.totalTokens).toBe(190)
    expect(homeBody.totalSessions).toBe(3)
    expect(homeBody.totalCost).toBeCloseTo(0.8)
    expect(JSON.stringify(homeBody)).not.toMatch(/claude-code|codex|Bash|github/)
    expect((await fetch(`${base}/api/home-summary?range=bogus`)).status).toBe(400)

    // Authenticated access still returns the full breakdown and honors filters.
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: base }, body: JSON.stringify({ password: 'secret' }) })
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0] }
    const full = await (await fetch(`${base}/api/summary?range=all`, { headers })).json()
    expect(Object.keys(full).sort()).toEqual([...TOTAL_KEYS, ...DETAIL_KEYS].sort())
    expect(full.totalTokens).toBe(homeBody.totalTokens)
    expect(Object.keys(full.byTool).sort()).toEqual(['claude-code', 'codex'])
    expect(full.topToolCalls).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Bash', count: 1 })]))
    expect(full.topMcpServers).toEqual([{ server: 'github', count: 1 }])
    const filtered = await (await fetch(`${base}/api/summary?tool=codex`, { headers })).json()
    expect(Object.keys(filtered.byTool)).toEqual(['codex'])
    expect(filtered.totalTokens).toBe(40)
    const remote = await (await fetch(`${base}/api/summary?device=remote-uuid-0001`, { headers })).json()
    expect(remote.totalTokens).toBe(10)
  })

  it('serves both summary endpoints without a cookie when no password is configured', async () => {
    seedSummaryData()
    await start('', { currentDeviceInstanceId: 'local-uuid-0000' })
    const full = await fetch(`${base}/api/summary?range=all`)
    expect(full.status).toBe(200)
    expect(Object.keys(await full.json())).toEqual(expect.arrayContaining(DETAIL_KEYS))
    const home = await fetch(`${base}/api/home-summary?range=all`)
    expect(home.status).toBe(200)
    expect((await home.json()).totalTokens).toBe(190)
  })

  it('never reveals configured secrets or references even to an authenticated browser', async () => {
    vi.mocked(loadConfig).mockReturnValue({
      sync: { backend: 'github', repo: 'owner/repo', credentialRef: 'PRIVATE_REF' },
      credentials: { 'github/owner/repo/token': 'stored-secret', PRIVATE_REF: 'other-secret' },
    })
    await start('secret')
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ password: 'secret' }) })
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], Origin: base }
    for (const route of ['/api/config', '/api/config/credentials/status?backend=github&repo=owner/repo']) {
      const response = await fetch(base + route, { headers })
      expect(response.status).toBe(200)
      const body = await response.text()
      expect(body).toContain('"githubToken":true')
      for (const secret of ['stored-secret', 'other-secret', 'PRIVATE_REF', 'credentialRef', 'credentialKeys']) expect(body).not.toContain(secret)
    }
    expect((await fetch(`${base}/api/config/credential?ref=PRIVATE_REF`, { headers })).status).toBe(404)
  })
})
