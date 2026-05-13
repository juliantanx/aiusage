import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runSync } from '../../src/commands/sync.js'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

// Mock the init module
vi.mock('../../src/init.js', () => ({
  getState: vi.fn(),
  setState: vi.fn(),
}))

// Mock the config loading
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

describe('Sync Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    vi.clearAllMocks()
  })

  it('returns failed when no config exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(false)

    const result = await runSync(db)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('not configured')
  })

  it('returns blocked when consent is missing', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const { getState } = await import('../../src/init.js')

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      sync: { backend: 'github', repo: 'user/repo' },
    }))
    vi.mocked(getState).mockReturnValue({
      deviceInstanceId: 'dev-123',
      lastSyncStatus: 'ok',
    })

    const result = await runSync(db)
    expect(result.status).toBe('blocked_pending_consent')
  })
})
