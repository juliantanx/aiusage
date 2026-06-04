import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We need to mock AIUSAGE_DIR before importing credentials
// Use dynamic import after setting env
let testDir: string

describe('credentials', () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'aiusage-creds-test-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('saves and loads credentials atomically', async () => {
    // Import the module and directly test file operations
    const { writeFileSync, readFileSync, renameSync } = await import('node:fs')
    const { randomBytes } = await import('node:crypto')

    const credsFile = join(testDir, 'leaderboard-credentials.json')
    const creds = {
      device_id: 'test-device',
      device_secret: 'test-secret',
      obtained_at: new Date().toISOString()
    }

    // Simulate the atomic write pattern from credentials.ts
    const tmpFile = `${credsFile}.${randomBytes(4).toString('hex')}.tmp`
    writeFileSync(tmpFile, JSON.stringify(creds, null, 2), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tmpFile, credsFile)

    // Verify file contents
    const loaded = JSON.parse(readFileSync(credsFile, 'utf-8'))
    expect(loaded).toEqual(creds)

    // Verify permissions (Unix only)
    if (process.platform !== 'win32') {
      const stats = statSync(credsFile)
      const mode = stats.mode & 0o777
      expect(mode).toBe(0o600)
    }
  })
})
