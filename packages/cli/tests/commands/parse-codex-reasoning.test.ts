import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { AIUSAGE_DIR } from '../../src/config.js'
import { initializeDatabase } from '../../src/db/index.js'
import { runParse } from '../../src/commands/parse.js'
import { loadPricingRuntime, setUserPrice } from '../../src/pricing-registry.js'

// Codex logs output_tokens inclusive of reasoning_output_tokens. The Codex
// parser and the embedded Codex path of the CodeFuse parser store output
// without the reasoning part; rows stored before that are corrected by
// migration v16 (Codex) and by a one-time re-import (CodeFuse).
//
// AIUSAGE_DIR is inside the per-file temporary home from tests/setup-home.ts.

const MODEL = 'reasoning-test-model'
// USD per million tokens.
const PRICE = { input: 2, output: 10, cacheRead: 0.2 }
// USAGES[0] with every output token, reasoning included, charged once at the
// output price: 0.1M input * $2 + 0.5M output * $10 + 0.9M cached * $0.2.
const BILLED_ONCE = 0.2 + 5 + 0.18
const watermarkPath = join(AIUSAGE_DIR, 'watermark.json')

interface Usage {
  input_tokens: number
  output_tokens: number
  cached_input_tokens?: number
  reasoning_output_tokens?: number
}

function writeRollout(filePath: string, usages: Usage[], model: string | null = MODEL): void {
  const rows: Record<string, unknown>[] = [
    { timestamp: '2026-10-01T08:00:00.000Z', type: 'session_meta', payload: { id: 'x', cwd: '/work/project' } },
  ]
  if (model) rows.push({ timestamp: '2026-10-01T08:00:00.500Z', type: 'turn_context', payload: { model } })
  usages.forEach((usage, i) => {
    rows.push({
      timestamp: `2026-10-01T08:00:${String(i + 1).padStart(2, '0')}.000Z`,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { ...usage, total_tokens: usage.input_tokens + usage.output_tokens } },
      },
    })
  })
  writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
}

const USAGES: Usage[] = [
  { input_tokens: 1_000_000, cached_input_tokens: 900_000, output_tokens: 500_000, reasoning_output_tokens: 200_000 },
  { input_tokens: 2_000, cached_input_tokens: 0, output_tokens: 700, reasoning_output_tokens: 0 },
  // A turn that only reasoned.
  { input_tokens: 3_000, cached_input_tokens: 1_000, output_tokens: 64, reasoning_output_tokens: 64 },
  { input_tokens: 4_000, output_tokens: 900 },
]

interface Row {
  id: string
  session_id: string
  line_offset: number
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  thinking_tokens: number
  cost: number
  cost_source: string
}

function rows(db: Database.Database, tool: string): Row[] {
  return db.prepare(`
    SELECT id, session_id, line_offset, model, input_tokens, output_tokens, cache_read_tokens,
           cache_write_tokens, thinking_tokens, cost, cost_source
    FROM records WHERE tool = ? ORDER BY session_id, line_offset
  `).all(tool) as Row[]
}

function expectSameRows(actual: Row[], expected: Row[]): void {
  expect(actual.map(({ cost: _cost, ...rest }) => rest)).toEqual(expected.map(({ cost: _cost, ...rest }) => rest))
  actual.forEach((row, i) => expect(row.cost).toBeCloseTo(expected[i].cost, 12))
}

describe('Codex reasoning tokens through runParse', () => {
  let db: Database.Database
  let logRoot: string
  let codexSessions: string
  let codeFuseRoot: string
  let codeFuseSessions: string

  beforeEach(() => {
    logRoot = mkdtempSync(join(tmpdir(), 'aiusage-codex-reasoning-'))
    codexSessions = join(logRoot, 'codex', 'sessions')
    codeFuseRoot = join(logRoot, '.codefuse')
    codeFuseSessions = join(codeFuseRoot, 'engine', 'codex', 'sessions', '2026', '10', '01')
    mkdirSync(join(codexSessions, '2026', '10', '01'), { recursive: true })
    mkdirSync(codeFuseSessions, { recursive: true })

    rmSync(AIUSAGE_DIR, { recursive: true, force: true })
    mkdirSync(AIUSAGE_DIR, { recursive: true })
    writeFileSync(join(AIUSAGE_DIR, 'config.json'), JSON.stringify({
      sources: { codex: codexSessions, codefuse: codeFuseRoot },
    }))

    db = new Database(':memory:')
    initializeDatabase(db)
    setUserPrice(db, MODEL, PRICE)
    loadPricingRuntime(db, null)
  })

  afterEach(() => {
    loadPricingRuntime(db, null)
    db.close()
    rmSync(logRoot, { recursive: true, force: true })
    rmSync(AIUSAGE_DIR, { recursive: true, force: true })
  })

  it('stores Codex output tokens exclusive of reasoning tokens and bills reasoning once', async () => {
    writeRollout(join(codexSessions, '2026', '10', '01', 'rollout-a.jsonl'), USAGES)

    await runParse(db, 'codex')

    const parsed = rows(db, 'codex')
    expect(parsed.map((r) => [r.input_tokens, r.cache_read_tokens, r.output_tokens, r.thinking_tokens])).toEqual([
      [100_000, 900_000, 300_000, 200_000],
      [2_000, 0, 700, 0],
      [2_000, 1_000, 0, 64],
      [4_000, 0, 900, 0],
    ])
    // The stored columns add up to Codex's own total_tokens (input + output).
    for (const [i, r] of parsed.entries()) {
      expect(r.input_tokens + r.cache_read_tokens + r.cache_write_tokens + r.output_tokens + r.thinking_tokens)
        .toBe(USAGES[i].input_tokens + USAGES[i].output_tokens)
    }
    expect(parsed[0].cost).toBeCloseTo(BILLED_ONCE, 10)
    // The all-reasoning turn: 2k input, 1k cached, 64 reasoning tokens.
    expect(parsed[2].cost).toBeCloseTo(0.004 + 0.0002 + 0.00064, 12)
    expect(parsed[0].cost_source).toBe('pricing')
  })

  it('migration v16 leaves stored Codex rows equal to a fresh parse of the same logs', async () => {
    writeRollout(join(codexSessions, '2026', '10', '01', 'rollout-a.jsonl'), USAGES)
    writeRollout(join(codexSessions, '2026', '10', '01', 'rollout-b.jsonl'), [USAGES[0], USAGES[2]])

    await runParse(db, 'codex')
    const fresh = rows(db, 'codex')
    expect(fresh).toHaveLength(6)

    // Recreate what the previous parser stored in a v15 database: reasoning
    // tokens in both the output and the thinking column, priced twice.
    db.prepare(`
      UPDATE records
      SET output_tokens = output_tokens + thinking_tokens,
          cost = cost + thinking_tokens * ? / 1000000,
          synced_at = 5, updated_at = 1
    `).run(PRICE.output)
    db.prepare('DELETE FROM schema_version WHERE version = 16').run()
    const before = db.prepare('SELECT cost, output_tokens FROM records ORDER BY session_id, line_offset LIMIT 1').get()
    // The 0.2M reasoning tokens are in both columns and billed twice.
    expect(before).toMatchObject({ output_tokens: 500_000 })
    expect((before as { cost: number }).cost).toBeCloseTo(BILLED_ONCE + 2, 10)

    initializeDatabase(db)

    expectSameRows(rows(db, 'codex'), fresh)
    const state = db.prepare('SELECT thinking_tokens, synced_at, updated_at FROM records ORDER BY session_id, line_offset').all() as Array<{ thinking_tokens: number; synced_at: number; updated_at: number }>
    for (const s of state) {
      // Only the rows that changed are published again.
      if (s.thinking_tokens > 0) expect(s.updated_at).toBeGreaterThan(5)
      else expect(s.updated_at).toBe(1)
    }

    // The Codex watermark is untouched, so the next parse reads nothing new...
    const untouched = db.prepare('SELECT id, updated_at FROM records ORDER BY id').all()
    await runParse(db, 'codex')
    expect(db.prepare('SELECT id, updated_at FROM records ORDER BY id').all()).toEqual(untouched)

    // ...and a forced re-import of the logs produces the same rows again.
    writeFileSync(watermarkPath, '{}')
    await runParse(db, 'codex')
    expectSameRows(rows(db, 'codex'), fresh)
  })

  it('re-imports CodeFuse logs once so embedded Codex rows are corrected in place', async () => {
    writeRollout(join(codeFuseSessions, 'rollout-embedded.jsonl'), [USAGES[0], USAGES[1]])
    // A Codex row beside it: only CodeFuse is re-imported.
    writeRollout(join(codexSessions, '2026', '10', '01', 'rollout-a.jsonl'), [USAGES[1]])

    await runParse(db)
    const fresh = rows(db, 'codefuse')
    expect(fresh.map((r) => [r.input_tokens, r.cache_read_tokens, r.output_tokens, r.thinking_tokens])).toEqual([
      [100_000, 900_000, 300_000, 200_000],
      [2_000, 0, 700, 0],
    ])
    expect(fresh[0].cost).toBeCloseTo(BILLED_ONCE, 10)
    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).codefuseParserVersion).toBe(2)

    // Recreate what the previous release left behind: reasoning tokens in both
    // columns, and a watermark written by CodeFuse parser version 1.
    db.prepare(`
      UPDATE records SET output_tokens = output_tokens + thinking_tokens, cost = cost * 2, synced_at = 5, updated_at = 1
      WHERE tool = 'codefuse'
    `).run()
    db.prepare(`UPDATE records SET synced_at = 5, updated_at = 1 WHERE tool = 'codex'`).run()
    const watermark = JSON.parse(readFileSync(watermarkPath, 'utf-8'))
    watermark.codefuseParserVersion = 1
    writeFileSync(watermarkPath, JSON.stringify(watermark))

    await runParse(db)

    expectSameRows(rows(db, 'codefuse'), fresh)
    expect(db.prepare('SELECT COUNT(*) AS n FROM records').get()).toMatchObject({ n: 3 })
    // The corrected rows are published again (no acknowledgement, or one older
    // than the new version); the Codex row was not re-read.
    for (const s of db.prepare(`SELECT synced_at, updated_at FROM records WHERE tool = 'codefuse'`).all() as Array<{ synced_at: number | null; updated_at: number }>) {
      expect(s.updated_at).toBeGreaterThan(5)
      expect(s.synced_at === null || s.updated_at > s.synced_at).toBe(true)
    }
    expect(db.prepare(`SELECT synced_at, updated_at FROM records WHERE tool = 'codex'`).get()).toEqual({ synced_at: 5, updated_at: 1 })
    expect(JSON.parse(readFileSync(watermarkPath, 'utf-8')).codefuseParserVersion).toBe(2)

    // Once only: the next parse leaves the rows alone.
    const settled = db.prepare('SELECT id, updated_at FROM records ORDER BY id').all()
    await runParse(db)
    expect(db.prepare('SELECT id, updated_at FROM records ORDER BY id').all()).toEqual(settled)
  })
})
