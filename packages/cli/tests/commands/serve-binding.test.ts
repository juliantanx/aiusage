import { afterEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import { serve } from '../../src/commands/serve.js'
import { dashboardHost, isLoopbackHost } from '../../src/api/trust.js'

vi.mock('node:fs', async (original) => ({ ...await original<typeof import('node:fs')>(), existsSync: vi.fn(() => true) }))
vi.mock('../../src/config.js', async (original) => ({ ...await original<typeof import('../../src/config.js')>(), loadConfig: vi.fn(() => ({ exchangeRate: 1 })) }))
vi.mock('../../src/api/server.js', () => ({ createApiServer: vi.fn(() => http.createServer()) }))
vi.mock('../../src/commands/parse.js', () => ({ runParse: vi.fn(async () => ({ parsedCount: 0, toolCallCount: 0 })) }))
vi.mock('../../src/init.js', () => ({ getState: vi.fn(() => null) }))
vi.mock('../../src/runtime/settings-controller.js', () => ({ RuntimeSettingsController: class { start() {} stop() {} } }))

describe('serve binding', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it.each([
    [undefined, '', '127.0.0.1'],
    ['localhost', '', '127.0.0.1'],
    ['::1', '', '::1'],
    ['[::1]', '', '::1'],
    ['0.0.0.0', 'secret', '0.0.0.0'],
    ['::', 'secret', '::'],
    ['192.168.1.20', 'secret', '192.168.1.20'],
  ])('binds host %s explicitly with the configured authentication', (host, password, expected) => {
    vi.stubEnv('AIUSAGE_DASHBOARD_PASSWORD', password)
    const listen = vi.spyOn(http.Server.prototype, 'listen').mockReturnThis()
    vi.spyOn(process, 'once').mockReturnThis()
    serve({ port: 3847, host, db: {} as any })
    expect(listen).toHaveBeenCalledWith(3847, expected)
  })

  it.each(['0.0.0.0', '::', '192.168.1.20', 'dashboard.example', 'localhost.evil.example'])('refuses unauthenticated non-loopback host %s before startup work', host => {
    vi.stubEnv('AIUSAGE_DASHBOARD_PASSWORD', '   ')
    const listen = vi.spyOn(http.Server.prototype, 'listen').mockReturnThis()
    expect(() => serve({ port: 3847, host, db: {} as any })).toThrow('AIUSAGE_DASHBOARD_PASSWORD')
    expect(listen).not.toHaveBeenCalled()
  })

  it('recognizes IPv4 and IPv6 loopback literals conservatively', () => {
    expect(isLoopbackHost('127.0.0.2')).toBe(true)
    expect(isLoopbackHost('0:0:0:0:0:0:0:1')).toBe(true)
    expect(isLoopbackHost('::2')).toBe(false)
    expect(isLoopbackHost('127.evil.example')).toBe(false)
    expect(() => dashboardHost('', 'secret')).toThrow('Invalid dashboard host')
  })
})
