import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureAiusageDir, getState } from '../src/init.js'

// Real processes writing state.json and config.json at the same time, as
// `aiusage serve` and a CLI command do. Each one owns a field and rewrites it
// many times; a write built on an older copy of the file would roll another
// process's field back (tests/helpers/settings-writer.ts).

const WORKER = join(__dirname, 'helpers', 'settings-writer.ts')
const ITERATIONS = 120

interface WorkerResult { role: string; regressions: number; errors: string[]; errorCount: number }

function runWorker(role: string, home: string): Promise<WorkerResult> {
  const aiusageDir = join(home, '.aiusage')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', WORKER, role, aiusageDir, String(ITERATIONS)], {
      cwd: join(__dirname, '..'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.once('error', reject)
    child.once('close', code => {
      const line = out.trim().split('\n').pop()
      if (code !== 0 || !line) reject(new Error(`${role} exited with ${code}: ${err}`))
      else resolve(JSON.parse(line) as WorkerResult)
    })
  })
}

function withHome(fn: (home: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const home = mkdtempSync(join(tmpdir(), 'aiusage-conc-'))
    try {
      await fn(home)
    } finally {
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
}

describe('state.json and config.json written by several processes at once', () => {
  it('keeps every process\'s update to state.json, and the device identity', withHome(async (home) => {
    const aiusageDir = join(home, '.aiusage')
    ensureAiusageDir(aiusageDir)
    const deviceInstanceId = getState(aiusageDir)!.deviceInstanceId

    const roles = ['syncGeneration', 'lastLeaderboardUploadAt', 'syncTargets', 'syncConsent']
    const results = await Promise.all(roles.map(role => runWorker(role, home)))

    expect(results).toEqual(roles.map(role => ({ role, regressions: 0, errors: [], errorCount: 0 })))
    const state = getState(aiusageDir)!
    expect(state.deviceInstanceId).toBe(deviceInstanceId)
    expect(state.syncTargets?.cloud?.syncGeneration).toBe(ITERATIONS)
    expect(state.lastLeaderboardUploadAt).toBe(ITERATIONS)
    expect(state.syncTargets?.['github:owner/repo']?.lastSyncUploaded).toBe(ITERATIONS)
    expect(state.syncConsents?.['s3:bucket/aiusage/']).toEqual({ syncConsentAt: ITERATIONS, syncConsentTarget: 'fingerprint' })
  }), 120_000)

  it('keeps every process\'s update to config.json', withHome(async (home) => {
    const results = await Promise.all(['credentialA', 'credentialB'].map(role => runWorker(role, home)))

    expect(results.map(r => ({ role: r.role, regressions: r.regressions, errorCount: r.errorCount, errors: r.errors }))).toEqual([
      { role: 'credentialA', regressions: 0, errorCount: 0, errors: [] },
      { role: 'credentialB', regressions: 0, errorCount: 0, errors: [] },
    ])
    const config = JSON.parse(readFileSync(join(home, '.aiusage', 'config.json'), 'utf-8'))
    expect(config.credentials).toEqual({ a: String(ITERATIONS), b: String(ITERATIONS) })
  }), 120_000)
})
