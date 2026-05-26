import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { runParseCursor } from '../../src/commands/parse-cursor.js'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-cursor-test'),
  }
})

// Must import after mock so it picks up the mocked homedir
const { runParse } = await import('../../src/commands/parse.js')

function createCursorDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursorDiskKV (
      key TEXT UNIQUE ON CONFLICT REPLACE,
      value BLOB
    )
  `)
}

function insertComposer(
  db: Database.Database,
  composerId: string,
  createdAt: number,
  usageData: object = {},
): void {
  const value = JSON.stringify({
    _v: 3,
    composerId,
    createdAt,
    usageData,
    fullConversationHeadersOnly: [],
    conversationMap: {},
    status: 'none',
  })
  db.prepare(`INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)`).run(
    `composerData:${composerId}`,
    value,
  )
}

function insertBubble(
  db: Database.Database,
  composerId: string,
  bubbleId: string,
  type: number,
  inputTokens: number,
  outputTokens: number,
): void {
  const value = JSON.stringify({
    _v: 2,
    type,
    bubbleId,
    tokenCount: { inputTokens, outputTokens },
  })
  db.prepare(`INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)`).run(
    `bubbleId:${composerId}:${bubbleId}`,
    value,
  )
}

const BASE_OPTIONS = {
  dbPath: '/home/user/.cursor/state.vscdb',
  device: 'macbook',
  deviceInstanceId: 'device-abc',
  now: 1779500000000,
  cursor: null,
}

describe('runParseCursor', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createCursorDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates one record per conversation with summed assistant token counts', () => {
    const composerId = 'conv-1'
    insertComposer(db, composerId, 1779400000000, { default: { costInCents: 6, amount: 2 } })
    insertBubble(db, composerId, 'bubble-u1', 1, 0, 0)      // user message, no tokens
    insertBubble(db, composerId, 'bubble-a1', 2, 5000, 200)  // assistant
    insertBubble(db, composerId, 'bubble-u2', 1, 0, 0)       // user message
    insertBubble(db, composerId, 'bubble-a2', 2, 6000, 300)  // assistant

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    const r = result.records[0]
    expect(r.tool).toBe('cursor')
    expect(r.model).toBe('cursor-composer')
    expect(r.provider).toBe('cursor')
    expect(r.inputTokens).toBe(11000)
    expect(r.outputTokens).toBe(500)
    expect(r.cacheReadTokens).toBe(0)
    expect(r.cacheWriteTokens).toBe(0)
    expect(r.thinkingTokens).toBe(0)
    expect(r.ts).toBe(1779400000000)
    expect(r.sessionId).toBe(composerId)
    expect(r.sourceFile).toBe('/home/user/.cursor/state.vscdb')
    expect(r.lineOffset).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('uses usageData.default.costInCents / 100 as USD cost', () => {
    insertComposer(db, 'conv-cost', 1779400000000, { default: { costInCents: 32, amount: 8 } })
    insertBubble(db, 'conv-cost', 'bubble-1', 2, 5000, 200)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBeCloseTo(0.32)
    expect(result.records[0].costSource).toBe('log')
  })

  it('sets cost=0 and costSource=unknown when usageData is empty', () => {
    insertComposer(db, 'conv-no-cost', 1779400000000, {})
    insertBubble(db, 'conv-no-cost', 'bubble-1', 2, 3000, 100)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBe(0)
    expect(result.records[0].costSource).toBe('unknown')
  })

  it('sets cost=0 and costSource=unknown when costInCents is 0', () => {
    insertComposer(db, 'conv-zero-cost', 1779400000000, { default: { costInCents: 0, amount: 1 } })
    insertBubble(db, 'conv-zero-cost', 'bubble-1', 2, 1000, 50)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records[0].cost).toBe(0)
    expect(result.records[0].costSource).toBe('unknown')
  })

  it('skips conversations with no assistant token data', () => {
    // Only user bubbles (type=1) with zero tokens
    insertComposer(db, 'conv-empty', 1779400000000, {})
    insertBubble(db, 'conv-empty', 'bubble-u1', 1, 0, 0)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })

  it('skips conversations where all assistant bubbles have zero tokens', () => {
    insertComposer(db, 'conv-zero-tokens', 1779400000000, { default: { costInCents: 4, amount: 1 } })
    insertBubble(db, 'conv-zero-tokens', 'bubble-a1', 2, 0, 0)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
  })

  it('does not count user (type=1) bubble tokens', () => {
    insertComposer(db, 'conv-user-only', 1779400000000, {})
    // Only user bubbles with tokens (shouldn't happen in practice but test the guard)
    insertBubble(db, 'conv-user-only', 'bubble-u1', 1, 10000, 500)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
  })

  it('handles multiple conversations correctly', () => {
    insertComposer(db, 'conv-a', 1779400000000, { default: { costInCents: 4, amount: 1 } })
    insertBubble(db, 'conv-a', 'b-a1', 2, 1000, 100)

    insertComposer(db, 'conv-b', 1779410000000, { default: { costInCents: 8, amount: 2 } })
    insertBubble(db, 'conv-b', 'b-b1', 2, 2000, 200)
    insertBubble(db, 'conv-b', 'b-b2', 2, 3000, 300)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(2)
    // Sorted by createdAt asc
    expect(result.records[0].sessionId).toBe('conv-a')
    expect(result.records[0].inputTokens).toBe(1000)
    expect(result.records[0].outputTokens).toBe(100)
    expect(result.records[1].sessionId).toBe('conv-b')
    expect(result.records[1].inputTokens).toBe(5000)
    expect(result.records[1].outputTokens).toBe(500)
  })

  it('respects cursor for incremental import', () => {
    insertComposer(db, 'conv-old', 1779400000000, { default: { costInCents: 4, amount: 1 } })
    insertBubble(db, 'conv-old', 'b-1', 2, 1000, 100)

    insertComposer(db, 'conv-new', 1779410000000, { default: { costInCents: 4, amount: 1 } })
    insertBubble(db, 'conv-new', 'b-2', 2, 2000, 200)

    // First import: get both
    const result1 = runParseCursor(db, BASE_OPTIONS)
    expect(result1.records).toHaveLength(2)
    expect(result1.nextCursor).toEqual({ lastCreatedAt: 1779410000000, lastId: 'conv-new' })

    // Second import with cursor: get nothing
    const result2 = runParseCursor(db, { ...BASE_OPTIONS, cursor: result1.nextCursor })
    expect(result2.records).toHaveLength(0)
    expect(result2.nextCursor).toBeNull()
  })

  it('only returns new conversations since cursor', () => {
    insertComposer(db, 'conv-1', 1779400000000, {})
    insertBubble(db, 'conv-1', 'b-1', 2, 1000, 100)

    insertComposer(db, 'conv-2', 1779410000000, {})
    insertBubble(db, 'conv-2', 'b-2', 2, 2000, 200)

    insertComposer(db, 'conv-3', 1779420000000, {})
    insertBubble(db, 'conv-3', 'b-3', 2, 3000, 300)

    // Use cursor pointing after conv-1
    const result = runParseCursor(db, {
      ...BASE_OPTIONS,
      cursor: { lastCreatedAt: 1779400000000, lastId: 'conv-1' },
    })

    expect(result.records).toHaveLength(2)
    expect(result.records[0].sessionId).toBe('conv-2')
    expect(result.records[1].sessionId).toBe('conv-3')
  })

  it('returns nextCursor pointing to last processed conversation', () => {
    insertComposer(db, 'conv-x', 1779400000000, {})
    insertBubble(db, 'conv-x', 'b-1', 2, 1000, 100)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.nextCursor).toEqual({ lastCreatedAt: 1779400000000, lastId: 'conv-x' })
  })

  it('advances nextCursor past conversations with no token data (avoids re-scan)', () => {
    insertComposer(db, 'conv-empty', 1779400000000, {})
    // No bubbles with tokens — still advances cursor to avoid re-scanning

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
    expect(result.nextCursor).toEqual({ lastCreatedAt: 1779400000000, lastId: 'conv-empty' })
  })

  it('skips malformed composerData JSON gracefully', () => {
    db.prepare(`INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)`).run(
      'composerData:bad-json-id',
      'not valid json {{{',
    )
    // A valid conversation
    insertComposer(db, 'conv-valid', 1779400000000, {})
    insertBubble(db, 'conv-valid', 'b-1', 2, 1000, 100)

    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
  })

  it('returns empty when db has no composerData entries', () => {
    const result = runParseCursor(db, BASE_OPTIONS)

    expect(result.records).toHaveLength(0)
    expect(result.toolCalls).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
    expect(result.errors).toHaveLength(0)
  })
})

describe('runParse with cursor', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-cursor-test')
  let cacheDb: Database.Database
  let cursorDbPath: string

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)

    cursorDbPath = join(testDir, 'cursor-state.vscdb')

    const cursorDb = new Database(cursorDbPath)
    createCursorDb(cursorDb)
    insertComposer(cursorDb, 'conv-1', 1779400000000, { default: { costInCents: 4, amount: 1 } })
    insertBubble(cursorDb, 'conv-1', 'b-1', 2, 5000, 200)
    cursorDb.close()
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('runParse imports cursor records when tool filter is cursor', async () => {
    const result = await runParse(cacheDb, 'cursor', { cursorDbPath })
    expect(result.parsedCount).toBe(1)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse skips cursor when filter is different tool', async () => {
    const result = await runParse(cacheDb, 'claude-code', { cursorDbPath })
    expect(result.parsedCount).toBe(0)
  })

  it('runParse handles missing cursor db gracefully', async () => {
    const result = await runParse(cacheDb, 'cursor', {
      cursorDbPath: join(testDir, 'nonexistent.vscdb'),
    })
    expect(result.parsedCount).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('runParse persists cursor so second call imports nothing new', async () => {
    const result1 = await runParse(cacheDb, 'cursor', { cursorDbPath })
    expect(result1.parsedCount).toBe(1)

    const result2 = await runParse(cacheDb, 'cursor', { cursorDbPath })
    expect(result2.parsedCount).toBe(0)
    expect(result2.errors).toHaveLength(0)
  })
})
