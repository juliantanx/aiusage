import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'

// config.ts resolves its path from homedir() when it is first imported.
const home = mkdtempSync(join(tmpdir(), 'aiusage-config-integrity-'))
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: () => home }
})

const config = await import('../src/config.js')
const { AIUSAGE_DIR, CONFIG_PATH, loadConfig, saveConfig, loadCredential, saveCredential } = config
const { initializeDatabase } = await import('../src/db/index.js')
const { createApiServer } = await import('../src/api/server.js')
const { runCli } = await import('../src/cli.js')

const GOOD_CONFIG = {
  sync: { backend: 'github', repo: 'user/repo' },
  device: 'G14',
  syncInterval: 3600000,
  credentials: { 'github/user/repo/token': 'secret' },
}
// A hand edit that went wrong: a trailing comma.
const TYPO = '{\n  "sync": { "backend": "github", "repo": "user/repo" },\n  "device": "G14",\n}\n'

const UNUSABLE: Array<[string, string]> = [
  ['a typo', TYPO],
  ['truncated', JSON.stringify(GOOD_CONFIG, null, 2).slice(0, 40)],
  ['empty', ''],
  ['not an object', '"config"'],
]

describe('config.json integrity (#104)', () => {
  /** Temporary files a write left behind. */
  const leftovers = () => readdirSync(AIUSAGE_DIR).filter(name => name.endsWith('.tmp'))

  beforeEach(() => {
    // Not the directory itself: a command that failed while opening the
    // database leaves cache.db open, and Windows does not delete an open file.
    mkdirSync(AIUSAGE_DIR, { recursive: true })
    for (const name of ['config.json', 'state.json']) rmSync(join(AIUSAGE_DIR, name), { force: true })
  })

  afterAll(() => {
    try {
      rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    } catch {
      // A leftover temp directory is harmless.
    }
  })

  it('still treats a missing config as "not configured"', () => {
    expect(loadConfig()).toBeNull()
    expect(loadCredential('github/user/repo/token')).toBeNull()
    expect(config.readConfigFile()).toEqual({ status: 'missing' })
  })

  it('reads and writes a valid config, through a temporary file', () => {
    saveConfig(GOOD_CONFIG as never)
    expect(loadConfig()).toEqual(GOOD_CONFIG)
    expect(config.readConfigFile()).toEqual({ status: 'ok', config: GOOD_CONFIG })
    saveCredential('s3/bucket/accessKeyId', 'AKIA')
    expect(loadConfig()).toEqual({ ...GOOD_CONFIG, credentials: { ...GOOD_CONFIG.credentials, 's3/bucket/accessKeyId': 'AKIA' } })
    expect(leftovers()).toEqual([])
  })

  it('changes the config on disk through updateConfig, and writes nothing for a change that returns false', () => {
    // No file yet: the change starts from an empty config.
    expect(config.updateConfig((cfg) => { cfg.device = 'G14' })).toEqual({ device: 'G14' })
    saveCredential('a', '1')

    // Built on the file as it is now, not on a copy read before.
    const stale = loadConfig()!
    saveCredential('b', '2')
    const saved = config.updateConfig((cfg) => { cfg.syncInterval = stale.syncInterval ?? 60000 })
    expect(saved).toEqual({ device: 'G14', credentials: { a: '1', b: '2' }, syncInterval: 60000 })
    expect(loadConfig()).toEqual(saved)

    const before = readFileSync(CONFIG_PATH, 'utf-8')
    expect(config.updateConfig(() => false)).toEqual(saved)
    expect(readFileSync(CONFIG_PATH, 'utf-8')).toBe(before)
    expect(leftovers()).toEqual([])
  })

  for (const [label, content] of UNUSABLE) {
    describe(`a config.json that is ${label}`, () => {
      beforeEach(() => writeFileSync(CONFIG_PATH, content, 'utf-8'))

      const untouched = () => {
        expect(readFileSync(CONFIG_PATH, 'utf-8')).toBe(content)
        expect(leftovers()).toEqual([])
      }

      it('is an error that names the file, the problem and the way out, not a missing config', () => {
        let error: unknown
        try { loadConfig() } catch (e) { error = e }
        expect(error).toBeInstanceOf(config.ConfigFileError)
        const message = (error as Error).message
        expect(message).toContain(CONFIG_PATH)
        expect(message).toMatch(/left untouched/)
        expect(message).toMatch(/move the file aside/)
        expect(config.readConfigFile().status).toBe('invalid')
        untouched()
      })

      it('is never saved over', () => {
        expect(() => saveConfig({ device: 'other' })).toThrow(config.ConfigFileError)
        untouched()
        expect(() => saveCredential('github/user/repo/token', 'secret')).toThrow(config.ConfigFileError)
        untouched()
        // The pattern `serve` uses after fetching the exchange rate, and most
        // dashboard endpoints: load, default to {}, change one key, save.
        expect(() => {
          const cfg = loadConfig() ?? {}
          cfg.exchangeRateCache = { CNY_USD: 0.14, fetchedAt: 1 }
          saveConfig(cfg)
        }).toThrow(config.ConfigFileError)
        untouched()
        let called = false
        expect(() => config.updateConfig(() => { called = true })).toThrow(config.ConfigFileError)
        expect(called).toBe(false)
        untouched()
      })
    })
  }

  describe('the command line', () => {
    let errors: string[]

    beforeEach(() => {
      errors = []
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.join(' ')) })
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    for (const command of [['status'], ['summary'], ['parse', '--no-progress'], ['recalc'], ['sync'], ['init', '--backend', 'skip']]) {
      it(`"aiusage ${command.join(' ')}" reports an unparsable config and exits non-zero`, async () => {
        writeFileSync(CONFIG_PATH, TYPO, 'utf-8')
        await runCli(['node', 'aiusage', ...command])
        expect(process.exit).toHaveBeenCalledWith(1)
        const output = errors.join('\n')
        expect(output).toContain(CONFIG_PATH)
        expect(output).toMatch(/not valid JSON/)
        expect(output).toMatch(/left untouched/)
        expect(output).not.toMatch(/keychain/)
        expect(readFileSync(CONFIG_PATH, 'utf-8')).toBe(TYPO)
      })
    }

    it('creates state.json before a command runs', async () => {
      expect(existsSync(join(AIUSAGE_DIR, 'state.json'))).toBe(false)
      await runCli(['node', 'aiusage', 'status'])
      expect(process.exit).not.toHaveBeenCalled()
      const state = JSON.parse(readFileSync(join(AIUSAGE_DIR, 'state.json'), 'utf-8'))
      expect(state.deviceInstanceId).toHaveLength(36)
    })
  })

  describe('the dashboard API, when the config stops parsing while it is serving', () => {
    let db: Database.Database
    let server: http.Server
    let baseUrl: string

    beforeEach(async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      saveConfig(GOOD_CONFIG as never)
      db = new Database(':memory:')
      initializeDatabase(db)
      server = createApiServer(db)
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`
          resolve()
        })
      })
      writeFileSync(CONFIG_PATH, TYPO, 'utf-8')
    })

    afterEach(async () => {
      vi.restoreAllMocks()
      await new Promise<void>(resolve => server.close(() => resolve()))
      db.close()
    })

    it('PUT /api/config fails and leaves the file alone', async () => {
      const response = await fetch(`${baseUrl}/api/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: 'renamed' }),
      })
      expect(response.status).toBe(500)
      const body = await response.json() as { error: { code: string; message: string } }
      expect(body.error.code).toBe('SETTINGS_FILE_UNUSABLE')
      expect(body.error.message).toContain(CONFIG_PATH)
      expect(readFileSync(CONFIG_PATH, 'utf-8')).toBe(TYPO)
    })

    it('GET /api/config and the exchange-rate save fail with a server error instead of serving or saving defaults', async () => {
      const response = await fetch(`${baseUrl}/api/config`)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: { code: 'INTERNAL', message: 'Internal server error' } })
      expect(readFileSync(CONFIG_PATH, 'utf-8')).toBe(TYPO)
    })
  })
})
