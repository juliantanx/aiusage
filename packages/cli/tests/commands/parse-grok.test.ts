import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeDatabase } from '../../src/db/index.js'

const { testDir } = vi.hoisted(() => ({
  testDir: '/tmp/aiusage-parse-grok-test',
}))

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return {
    ...actual,
    homedir: () => testDir,
  }
})

const { runParse } = await import('../../src/commands/parse.js')

function update(options: {
  sessionId: string
  totalTokens?: number
  sessionUpdate?: string
  modelId?: string
  timestamp: number
}): Record<string, unknown> {
  return {
    method: 'session/update',
    params: {
      sessionId: options.sessionId,
      update: {
        sessionUpdate: options.sessionUpdate ?? 'agent_message_chunk',
        ...(options.modelId ? { _meta: { modelId: options.modelId } } : {}),
      },
      _meta: {
        ...(options.totalTokens == null ? {} : { totalTokens: options.totalTokens }),
        agentTimestampMs: options.timestamp,
      },
    },
  }
}

function writeJsonl(filePath: string, rows: Record<string, unknown>[]): void {
  writeFileSync(filePath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`)
}

describe('runParse with Grok Build data', () => {
  let cacheDb: Database.Database

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('replays stale watermarks once and keeps Grok sessions isolated', async () => {
    const sessionsRoot = join(testDir, '.grok', 'sessions')
    const sessionADir = join(sessionsRoot, '%43%3A%5Cworkspace%5Capp', 'session-a')
    const sessionBDir = join(sessionsRoot, '%2Fworkspace%2Fother', 'session-b')
    mkdirSync(sessionADir, { recursive: true })
    mkdirSync(sessionBDir, { recursive: true })
    const sessionAPath = join(sessionADir, 'updates.jsonl')
    const sessionBPath = join(sessionBDir, 'updates.jsonl')

    writeJsonl(sessionAPath, [
      update({ sessionId: 'session-a', totalTokens: 100, timestamp: 1_700_000_000_000 }),
      update({ sessionId: 'session-a', sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast', timestamp: 1_700_000_001_000 }),
      update({ sessionId: 'session-a', totalTokens: 300, timestamp: 1_700_000_002_000 }),
      update({ sessionId: 'session-a', sessionUpdate: 'user_message_chunk', modelId: 'grok-composer-2.5-fast', timestamp: 1_700_000_003_000 }),
      update({ sessionId: 'session-a', totalTokens: 450, timestamp: 1_700_000_004_000 }),
    ])
    writeJsonl(sessionBPath, [
      update({ sessionId: 'session-b', totalTokens: 20, timestamp: 1_700_000_010_000 }),
      update({ sessionId: 'session-b', sessionUpdate: 'user_message_chunk', modelId: 'grok-3', timestamp: 1_700_000_011_000 }),
      update({ sessionId: 'session-b', totalTokens: 70, timestamp: 1_700_000_012_000 }),
    ])

    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: { grok: sessionsRoot },
    }))
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), JSON.stringify({
      files: {
        grok: {
          [sessionAPath]: {
            offset: statSync(sessionAPath).size,
            size: statSync(sessionAPath).size,
            mtime: statSync(sessionAPath).mtimeMs,
          },
          [sessionBPath]: {
            offset: statSync(sessionBPath).size,
            size: statSync(sessionBPath).size,
            mtime: statSync(sessionBPath).mtimeMs,
          },
        },
      },
    }))

    const first = await runParse(cacheDb, 'grok')
    expect(first.errors).toEqual([])
    expect(first.parsedCount).toBe(3)

    const rows = cacheDb.prepare(`
      SELECT session_id, model, input_tokens, cwd
      FROM records
      WHERE tool = 'grok'
      ORDER BY session_id, line_offset
    `).all()
    expect(rows).toEqual([
      { session_id: 'session-a', model: 'grok-composer-2.5-fast', input_tokens: 200, cwd: 'C:\\workspace\\app' },
      { session_id: 'session-a', model: 'grok-composer-2.5-fast', input_tokens: 150, cwd: 'C:\\workspace\\app' },
      { session_id: 'session-b', model: 'grok-3', input_tokens: 50, cwd: '/workspace/other' },
    ])

    const second = await runParse(cacheDb, 'grok')
    expect(second.errors).toEqual([])
    expect(second.parsedCount).toBe(0)
    expect(cacheDb.prepare("SELECT COUNT(*) AS count FROM records WHERE tool = 'grok'").get()).toEqual({ count: 3 })
  })
})
