import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord, getUnsyncedRecords } from '../../src/db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { migrateV15 } from '../../src/db/migrations/v15.js'
import { recalcPendingCosts } from '../../src/db/pending-cost-recalc.js'
import { recalcPricing } from '../../src/commands/recalc.js'
import { loadPricingRuntime, setUserPrice } from '../../src/pricing-registry.js'

// Codex logs input_tokens inclusive of cached_input_tokens. Rows parsed before
// the parser subtracted the cached part carry it in both columns and were
// priced twice; v15 corrects the token counts of the rows this device parsed
// and queues them for repricing once the price table is loaded.

const MODEL = 'v15-test-model'
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
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheReadTokens: 900_000,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
    // 1M input * $2 + 0.1M output * $10 + 0.9M cached * $0.2 (cached part billed twice)
    cost: 2 + 1 + 0.18,
    costSource: 'pricing',
    sessionId: 'sess',
    sourceFile: '/Users/a/.codex/sessions/2026/06/01/rollout-x.jsonl',
    device: 'host-a',
    deviceInstanceId: 'device-a',
    ...overrides,
  }
}

function row(db: Database.Database, id: string) {
  return db.prepare('SELECT input_tokens, cache_read_tokens, cost, cost_source, updated_at FROM records WHERE id = ?').get(id) as {
    input_tokens: number; cache_read_tokens: number; cost: number; cost_source: string; updated_at: number
  }
}

function pending(db: Database.Database): string[] {
  return (db.prepare('SELECT record_id FROM pending_cost_recalc ORDER BY record_id').all() as Array<{ record_id: string }>)
    .map(r => r.record_id)
}

describe('migration v15 (Codex input tokens exclude cached tokens)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    // initializeDatabase already ran v15 on the empty DB. Roll back to v14 so
    // we can seed records and re-run migrateV15 deterministically.
    db.prepare('DELETE FROM schema_version WHERE version >= 15').run()
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

  it('subtracts cached tokens from input and queues the row for repricing', () => {
    insertRecord(db, makeRecord({ id: 'codex-cached' }))

    migrateV15(db)

    const r = row(db, 'codex-cached')
    expect(r.input_tokens).toBe(100_000)
    expect(r.cache_read_tokens).toBe(900_000)
    expect(pending(db)).toEqual(['codex-cached'])
  })

  it('reprices with the prices available after startup seeding, not those present during the migration', () => {
    insertRecord(db, makeRecord({ id: 'codex-cached' }))

    // The price does not exist yet while the migration runs.
    migrateV15(db)
    finishInit()

    // 0.1M input * $2 + 0.1M output * $10 + 0.9M cached * $0.2
    expect(row(db, 'codex-cached').cost).toBeCloseTo(0.2 + 1 + 0.18, 10)
    expect(row(db, 'codex-cached').cost_source).toBe('pricing')
    expect(pending(db)).toEqual([])
  })

  it('reprices with a legacy config price override, as the parser does', () => {
    insertRecord(db, makeRecord({ id: 'codex-cached' }))

    migrateV15(db)
    const config = { priceOverrides: { [MODEL]: { input: 4, output: 20, cacheRead: 0.4 } } }
    loadPricingRuntime(db, config as any)
    recalcPendingCosts(db, config as any)

    expect(row(db, 'codex-cached').cost).toBeCloseTo(0.4 + 2 + 0.36, 10)
  })

  it('does not keep a cost computed from the old token counts when the price no longer resolves', () => {
    insertRecord(db, makeRecord({ id: 'codex-cached' }))

    migrateV15(db)
    finishInit(false)

    expect(row(db, 'codex-cached')).toMatchObject({ input_tokens: 100_000, cost: 0, cost_source: 'unknown' })
    expect(pending(db)).toEqual([])
  })

  it('bumps updated_at so the corrected row is published again', () => {
    insertRecord(db, makeRecord({ id: 'codex-cached' }))
    expect(getUnsyncedRecords(db).map(r => r.id)).not.toContain('codex-cached')

    migrateV15(db)
    finishInit()

    expect(getUnsyncedRecords(db).map(r => r.id)).toContain('codex-cached')
  })

  it('leaves rows without cached tokens untouched', () => {
    insertRecord(db, makeRecord({ id: 'codex-uncached', cacheReadTokens: 0, cost: 3 }))

    migrateV15(db)
    finishInit()

    expect(row(db, 'codex-uncached')).toMatchObject({ input_tokens: 1_000_000, cost: 3, updated_at: 1000 })
  })

  it('leaves other tools and rows pulled from other devices untouched', () => {
    insertRecord(db, makeRecord({ id: 'claude', tool: 'claude-code' }))
    insertRecord(db, makeRecord({ id: 'pulled', origin: 'synced', deviceInstanceId: 'device-b' }))

    migrateV15(db)
    finishInit()

    for (const id of ['claude', 'pulled']) {
      const r = row(db, id)
      expect(r.input_tokens).toBe(1_000_000)
      expect(r.cost).toBeCloseTo(3.18, 10)
      expect(r.updated_at).toBe(1000)
    }
  })

  it('corrects the tokens of a row with a logged or unknown cost without repricing it', () => {
    insertRecord(db, makeRecord({ id: 'logged', cost: 1.5, costSource: 'log' }))
    insertRecord(db, makeRecord({ id: 'unpriced', model: 'v15-no-such-model', cost: 0, costSource: 'unknown' }))

    migrateV15(db)
    expect(pending(db)).toEqual([])
    finishInit()

    expect(row(db, 'logged')).toMatchObject({ input_tokens: 100_000, cost: 1.5, cost_source: 'log' })
    expect(row(db, 'unpriced')).toMatchObject({ input_tokens: 100_000, cost: 0, cost_source: 'unknown' })
  })

  it('never produces negative input tokens', () => {
    insertRecord(db, makeRecord({ id: 'odd', inputTokens: 10, cacheReadTokens: 50 }))

    migrateV15(db)

    expect(row(db, 'odd').input_tokens).toBe(0)
  })

  it('does not subtract twice when the database is opened again', () => {
    insertRecord(db, makeRecord({ id: 'codex-cached' }))
    setUserPrice(db, MODEL, PRICE)

    initializeDatabase(db)
    initializeDatabase(db)

    expect(row(db, 'codex-cached').input_tokens).toBe(100_000)
    expect(row(db, 'codex-cached').cost).toBeCloseTo(1.38, 10)
    const version = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number }
    expect(version.version).toBe(16)
  })
})

describe('corrected Codex rows replace the copies mirrored on other devices', () => {
  let db: Database.Database
  const OWN = 'device-b'

  function synced(overrides: Partial<SyncRecord>): SyncRecord {
    return {
      id: 'remote-1',
      ts: 1000,
      tool: 'codex',
      model: MODEL,
      provider: 'openai',
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadTokens: 900_000,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 3.18,
      costSource: 'pricing',
      sessionKey: 'abc123def456',
      device: 'host-a',
      deviceInstanceId: 'device-a',
      updatedAt: 1000,
      ...overrides,
    }
  }

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    setUserPrice(db, MODEL, { input: 1, output: 10, cacheRead: 0.2 })
  })

  afterEach(() => {
    loadPricingRuntime(db, null)
    db.close()
  })

  it('recalculating pricing does not make a mirrored row look newer than its owner’s copy', () => {
    insertSyncedRecord(db, synced({}))
    mergeSyncedRecordsIntoRecords(db, OWN)

    expect(recalcPricing(db).updatedCount).toBe(1)

    const r = row(db, 'remote-1')
    expect(r.cost).toBeCloseTo(1 + 1 + 0.18, 10)
    expect(r.updated_at).toBe(1000)
  })

  it('still marks a locally parsed row changed when recalculating pricing', () => {
    insertRecord(db, makeRecord({ id: 'local-1' }))

    recalcPricing(db)

    expect(row(db, 'local-1').updated_at).toBeGreaterThan(5000)
  })

  it('takes the owner’s corrected tokens even when the mirrored row carries a newer updated_at', () => {
    insertSyncedRecord(db, synced({}))
    mergeSyncedRecordsIntoRecords(db, OWN)
    // An earlier release's recalc stamped the mirrored copy with the local clock.
    db.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(9000, 'remote-1')

    // The owner migrates (at 2000 < 9000) and publishes the corrected row.
    insertSyncedRecord(db, synced({ inputTokens: 100_000, cost: 1.38, updatedAt: 2000 }))
    mergeSyncedRecordsIntoRecords(db, OWN)

    expect(row(db, 'remote-1')).toMatchObject({ input_tokens: 100_000, cost: 1.38, updated_at: 2000 })
  })
})
