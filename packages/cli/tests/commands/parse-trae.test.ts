import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runParseTrae } from '../../src/commands/parse-trae.js'

/**
 * Create a git snapshot repo at `repoPath` with the given lightweight tags.
 * Each tag points at an empty commit dated `tsSeconds` so that
 * `git for-each-ref --format=%(creatordate:unix)` reports that timestamp.
 */
function makeSnapshotRepo(repoPath: string, tags: Array<{ name: string; ts: number }>): void {
  mkdirSync(repoPath, { recursive: true })
  const git = (args: string[], ts?: number) => {
    const env = { ...process.env }
    if (ts != null) {
      env.GIT_AUTHOR_DATE = `@${ts} +0000`
      env.GIT_COMMITTER_DATE = `@${ts} +0000`
    }
    const r = spawnSync('git', args, { cwd: repoPath, encoding: 'utf-8', env })
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  }
  git(['init', '-q'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'commit.gpgsign', 'false'])
  for (const { name, ts } of tags) {
    git(['commit', '--allow-empty', '-q', '-m', name], ts)
    git(['tag', name])
  }
}

describe('parse-trae', () => {
  let root: string
  let dbPath: string
  let snapshotDir: string

  const sessionId = 'a1b2c3d4e5f6a1b2c3d4e5f6'

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'trae-test-'))
    // Mimic the Trae layout the parser expects.
    const globalStorage = join(root, 'User', 'globalStorage')
    mkdirSync(globalStorage, { recursive: true })
    dbPath = join(globalStorage, 'state.vscdb')
    writeFileSync(dbPath, '')
    snapshotDir = join(root, 'ModularData', 'ai-agent', 'snapshot')
    mkdirSync(snapshotDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('extracts session metadata from snapshot git tags', () => {
    const start = 1_700_000_000
    makeSnapshotRepo(join(snapshotDir, sessionId, 'v2'), [
      { name: `chain-start-${sessionId}`, ts: start },
      { name: 'before-chat-turn-1', ts: start + 10 },
      { name: 'before-chat-turn-2', ts: start + 20 },
      { name: `toolcall-${sessionId}-1`, ts: start + 15 },
    ])

    const result = runParseTrae({
      dbPath,
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1_778_822_000_000,
    })

    expect(result.errors).toHaveLength(0)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      tool: 'trae',
      provider: 'trae',
      sessionId,
      ts: start * 1000,
      inputTokens: 2 * 200,
      outputTokens: 2 * 800,
    })
    expect(result.toolCalls).toHaveLength(1)
    expect(result.lastImportedAt).toBe(start * 1000)
  })

  it('falls back to earliest tag when no chain-start tag exists', () => {
    const start = 1_700_000_500
    makeSnapshotRepo(join(snapshotDir, sessionId, 'v2'), [
      { name: 'before-chat-turn-1', ts: start + 30 },
      { name: 'before-chat-turn-2', ts: start },
    ])

    const result = runParseTrae({
      dbPath,
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1_778_822_000_000,
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].ts).toBe(start * 1000)
  })

  it('skips sessions already imported before lastImportedAt', () => {
    const start = 1_700_000_000
    makeSnapshotRepo(join(snapshotDir, sessionId, 'v2'), [
      { name: `chain-start-${sessionId}`, ts: start },
      { name: 'before-chat-turn-1', ts: start + 10 },
    ])

    const result = runParseTrae({
      dbPath,
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1_778_822_000_000,
      lastImportedAt: start * 1000 + 1,
    })

    expect(result.records).toHaveLength(0)
  })

  it('returns an error when ModularData is missing', () => {
    rmSync(snapshotDir, { recursive: true, force: true })
    rmSync(join(root, 'ModularData'), { recursive: true, force: true })

    const result = runParseTrae({
      dbPath,
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1_778_822_000_000,
    })

    expect(result.records).toHaveLength(0)
    expect(result.errors).toContain('Trae ModularData not found')
  })
})
