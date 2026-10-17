import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, getUnsyncedRecords } from '../../src/db/records.js'
import { migrateV16 } from '../../src/db/migrations/v16.js'
import { recalcPendingCosts } from '../../src/db/pending-cost-recalc.js'
import { recalcPricing } from '../../src/commands/recalc.js'
import { loadPricingRuntime, setUserPrice } from '../../src/pricing-registry.js'

// Codex logs output_tokens inclusive of reasoning_output_tokens. Rows parsed
// before the parser subtracted the reasoning part carry it in both the output
// and the thinking column and were priced twice at the output price; v16
// corrects the token counts of the rows this device parsed and queues them for
// repricing once the price table is loaded.

const MODEL = 'v16-test-model'
const PRICE = { input: 2, output: 10, cacheRead: 0.2 }

function makeRecord(overrides: Partial<StatsRecord>): StatsRecord {
  return {
    id: 'rec',
    ts: 1000,
    ingestedAt: 1000,
    syncedAt: 5000,
    updatedAt: 1000,
    lineOffset: 0,
    tool: 'codex',
    model: MODEL,
    provider: 'openai',
    inputTokens: 100_000,
    // 500k output tokens of which 200k are reasoning
    outputTokens: 500_000,
    cacheReadTokens: 900_000,
    cacheWriteTokens: 0,
    thinkingTokens: 200_000,
    // 0.1M input * $2 + 0.5M output * $10 + 0.9M cached * $0.2 + 0.2M reasoning * $10 (billed twice)
    cost: 0.2 + 5 + 0.18 + 2,
    costSource: 'pricing',
    sessionId: 'sess',
    sourceFile: '/Users/a/.codex/sessions/2026/10/01/rollout-x.jsonl',
    device: 'host-a',
    deviceInstanceId: 'device-a',
    ...overrides,
  }
}

interface Row {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  thinking_tokens: number
  cost: number
  cost_source: string
  updated_at: number
}

function row(db: Database.Database, id: string): Row {
  return db.prepare(
    'SELECT input_tokens, output_tokens, cache_read_tokens, thinking_tokens, cost, cost_source, updated_at FROM records WHERE id = ?'
  ).get(id) as Row
}

function pending(db: Database.Database): string[] {
  return (db.prepare('SELECT record_id FROM pending_cost_recalc ORDER BY record_id').all() as Array<{ record_id: string }>)
    .map(r => r.record_id)
}

function schemaVersion(db: Database.Database): number {
  return (db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number }).version
}

describe('migration v16 (Codex output tokens exclude reasoning tokens)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    // initializeDatabase already ran v16 on the empty DB. Roll back just the
    // version row so we can seed records and re-run migrateV16 deterministically.
    db.prepare('DELETE FROM schema_version WHERE version = 16').run()
  })

  afterEach(() => {
    loadPricingRuntime(db, null)
    db.close()
  })

  /** What initializeDatabase does after the migrations. */
  function finishInit(price = true): void {
    if (price) setUserPrice(db, MODEL, PRICE)
    loadPricingRuntime(db, null)
    recalcPendingCosts(db, null)
  }

  it('subtracts reasoning tokens from output, keeps them as thinking and queues the row for repricing', () => {
    insertRecord(db, makeRecord({ id: 'codex-reasoning' }))

    migrateV16(db)

    expect(row(db, 'codex-reasoning')).toMatchObject({
      input_tokens: 100_000,
      output_tokens: 300_000,
      cache_read_tokens: 900_000,
      thinking_tokens: 200_000,
    })
    expect(pending(db)).toEqual(['codex-reasoning'])
    expect(schemaVersion(db)).toBe(16)
  })

  it('bills reasoning tokens exactly once, at the output price, after repricing', () => {
    insertRecord(db, makeRecord({ id: 'codex-reasoning' }))

    // The price does not exist yet while the migration runs.
    migrateV16(db)
    finishInit()

    // 0.1M input * $2 + 0.5M output (0.3M + 0.2M reasoning) * $10 + 0.9M cached * $0.2
    const r = row(db, 'codex-reasoning')
    expect(r.cost).toBeCloseTo(0.2 + 5 + 0.18, 10)
    expect(r.cost_source).toBe('pricing')
    expect(pending(db)).toEqual([])

    // A full "Recalculate pricing" afterwards agrees.
    recalcPricing(db)
    expect(row(db, 'codex-reasoning').cost).toBeCloseTo(5.38, 10)
  })

  it('reprices with a legacy config price override, as the parser does', () => {
    insertRecord(db, makeRecord({ id: 'codex-reasoning' }))

    migrateV16(db)
    const config = { priceOverrides: { [MODEL]: { input: 4, output: 20, cacheRead: 0.4 } } }
    loadPricingRuntime(db, config as any)
    recalcPendingCosts(db, config as any)

    expect(row(db, 'codex-reasoning').cost).toBeCloseTo(0.4 + 10 + 0.36, 10)
  })

  it('does not keep a cost computed from the old token counts when the price no longer resolves', () => {
    insertRecord(db, makeRecord({ id: 'codex-reasoning' }))

    migrateV16(db)
    finishInit(false)

    expect(row(db, 'codex-reasoning')).toMatchObject({ output_tokens: 300_000, cost: 0, cost_source: 'unknown' })
    expect(pending(db)).toEqual([])
  })

  it('bumps updated_at so the corrected row is published again', () => {
    insertRecord(db, makeRecord({ id: 'codex-reasoning' }))
    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('codex-reasoning')

    migrateV16(db)
    finishInit()

    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('codex-reasoning')
  })

  it('publishes the corrected row again when its acknowledgements are ahead of the clock', () => {
    // The clock was set back after these were written: the legacy and the
    // per-target acknowledgement are both later than the time of the upgrade.
    const ahead = Date.now() + 86_400_000
    insertRecord(db, makeRecord({ id: 'codex-reasoning', syncedAt: ahead, updatedAt: ahead - 1 }))
    db.prepare('INSERT INTO sync_record_state (record_id, target, synced_at) VALUES (?, ?, ?)').run('codex-reasoning', 'cloud', ahead + 1000)
    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('codex-reasoning')
    expect(getUnsyncedRecords(db, 'cloud').map(r => r.id)).not.toContain('codex-reasoning')

    migrateV16(db)
    const migrated = row(db, 'codex-reasoning').updated_at
    expect(migrated).toBeGreaterThan(ahead + 1000)
    finishInit()

    // Repricing does not move the version back either.
    expect(row(db, 'codex-reasoning').updated_at).toBeGreaterThan(migrated)
    expect(row(db, 'codex-reasoning').cost).toBeCloseTo(5.38, 10)
    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('codex-reasoning')
    expect(getUnsyncedRecords(db, 'cloud').map(r => r.id)).toContain('codex-reasoning')
  })

  it('leaves rows without reasoning tokens untouched', () => {
    insertRecord(db, makeRecord({ id: 'codex-plain', thinkingTokens: 0, cost: 5.38 }))

    migrateV16(db)
    expect(pending(db)).toEqual([])
    finishInit()

    expect(row(db, 'codex-plain')).toMatchObject({ output_tokens: 500_000, thinking_tokens: 0, cost: 5.38, updated_at: 1000 })
    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('codex-plain')
  })

  it('leaves other tools, CodeFuse rows and rows pulled from other devices untouched', () => {
    insertRecord(db, makeRecord({ id: 'claude', tool: 'claude-code' }))
    // Embedded Codex rows of CodeFuse are corrected by a re-import, not here.
    insertRecord(db, makeRecord({ id: 'codefuse', tool: 'codefuse' }))
    insertRecord(db, makeRecord({ id: 'pulled', origin: 'synced', deviceInstanceId: 'device-b' }))

    migrateV16(db)
    expect(pending(db)).toEqual([])
    finishInit()

    for (const id of ['claude', 'codefuse', 'pulled']) {
      const r = row(db, id)
      expect(r.output_tokens).toBe(500_000)
      expect(r.thinking_tokens).toBe(200_000)
      expect(r.cost).toBeCloseTo(7.38, 10)
      expect(r.updated_at).toBe(1000)
    }
  })

  it('corrects the tokens of a row with a logged or unknown cost without repricing it', () => {
    insertRecord(db, makeRecord({ id: 'logged', cost: 1.5, costSource: 'log' }))
    insertRecord(db, makeRecord({ id: 'unpriced', model: 'v16-no-such-model', cost: 0, costSource: 'unknown' }))

    migrateV16(db)
    expect(pending(db)).toEqual([])
    finishInit()

    expect(row(db, 'logged')).toMatchObject({ output_tokens: 300_000, thinking_tokens: 200_000, cost: 1.5, cost_source: 'log' })
    expect(row(db, 'unpriced')).toMatchObject({ output_tokens: 300_000, thinking_tokens: 200_000, cost: 0, cost_source: 'unknown' })
  })

  it('stores zero output for an all-reasoning row and never goes negative', () => {
    insertRecord(db, makeRecord({ id: 'all-reasoning', outputTokens: 64, thinkingTokens: 64 }))
    insertRecord(db, makeRecord({ id: 'odd', outputTokens: 10, thinkingTokens: 50 }))

    migrateV16(db)

    expect(row(db, 'all-reasoning')).toMatchObject({ output_tokens: 0, thinking_tokens: 64 })
    expect(row(db, 'odd')).toMatchObject({ output_tokens: 0, thinking_tokens: 50 })
  })

  it('does not subtract twice when the database is opened again', () => {
    insertRecord(db, makeRecord({ id: 'codex-reasoning' }))
    setUserPrice(db, MODEL, PRICE)

    initializeDatabase(db)
    const first = row(db, 'codex-reasoning')
    initializeDatabase(db)

    expect(first).toMatchObject({ output_tokens: 300_000, thinking_tokens: 200_000 })
    expect(first.cost).toBeCloseTo(5.38, 10)
    // Nothing changes on the second open, including updated_at.
    expect(row(db, 'codex-reasoning')).toEqual(first)
    expect(pending(db)).toEqual([])
    expect(schemaVersion(db)).toBe(16)
  })

  it('applies after v15 when a database upgrades from v14 in one open', () => {
    db.prepare('DELETE FROM schema_version WHERE version >= 15').run()
    // As the parser before both fixes stored it: input includes the cached
    // tokens and output includes the reasoning tokens.
    insertRecord(db, makeRecord({
      id: 'codex-both',
      inputTokens: 1_000_000,
      cost: 2 + 5 + 0.18 + 2,
    }))
    setUserPrice(db, MODEL, PRICE)

    initializeDatabase(db)

    const r = row(db, 'codex-both')
    expect(r).toMatchObject({
      input_tokens: 100_000,
      output_tokens: 300_000,
      cache_read_tokens: 900_000,
      thinking_tokens: 200_000,
    })
    expect(r.cost).toBeCloseTo(5.38, 10)
    expect(pending(db)).toEqual([])
    expect(schemaVersion(db)).toBe(16)
  })

  it('reprices a row v15 queued and the open did not finish repricing', () => {
    // v15 already corrected the input side and queued the row, but the process
    // stopped before recalcPendingCosts drained the queue.
    insertRecord(db, makeRecord({ id: 'codex-queued', cost: 9.18 }))
    db.prepare('INSERT INTO pending_cost_recalc (record_id) VALUES (?)').run('codex-queued')

    migrateV16(db)
    expect(pending(db)).toEqual(['codex-queued'])
    finishInit()

    const r = row(db, 'codex-queued')
    expect(r).toMatchObject({ input_tokens: 100_000, output_tokens: 300_000, thinking_tokens: 200_000 })
    expect(r.cost).toBeCloseTo(5.38, 10)
  })
})
