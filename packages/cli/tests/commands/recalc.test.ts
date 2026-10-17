import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { insertSyncedRecord, mergeSyncedRecordsIntoRecords } from '../../src/db/synced-records.js'
import { recalcPricing } from '../../src/commands/recalc.js'
import { ensureCuratedPricingAliases, removeUserPrice, setUserPrice } from '../../src/pricing-registry.js'
import type { StatsRecord, SyncRecord } from '@aiusage/core'

/** Local midnight of a fixed day, far from `Date.now()`. */
const DAY = Date.UTC(2026, 5, 1, 12, 0, 0)

describe('Recalc Command', () => {
  let db: Database.Database

  function insertPrice(modelKey: string, entry: { input: number; output: number; cacheRead?: number | null; cacheWrite?: number | null; provider?: string; sourceModelId?: string }) {
    const now = Date.now()
    db.prepare(`
      INSERT INTO model_prices (
        model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
        source_url, origin, status, last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'USD', 'litellm', ?, NULL, 'builtin', 'active', ?, ?, ?)
    `).run(modelKey, entry.provider ?? '', entry.input, entry.output, entry.cacheRead ?? null, entry.cacheWrite ?? null, entry.sourceModelId ?? modelKey, now, now, now)
  }

  function insertAlias(alias: string, modelKey: string, provider = '') {
    const now = Date.now()
    db.prepare(`
      INSERT OR REPLACE INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled, created_at, updated_at)
      VALUES (?, ?, 'exact', ?, 100, 'litellm', 'builtin', 1, ?, ?)
    `).run(alias, modelKey, provider, now, now)
  }

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('prices Gemini 3.1 Pro records through the curated preview alias without renaming them (issue #69)', () => {
    const models = ['gemini-3.1-pro', 'gemini-3.1-pro-high', 'gemini-3.1-pro-low']
    for (const [index, model] of models.entries()) {
      insertRecord(db, {
        id: `r${index}`, ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
        lineOffset: index, tool: 'antigravity', model, provider: 'google',
        inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
        thinkingTokens: 0, cost: 0, costSource: 'unknown', sessionId: 's1',
        sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
      })
    }
    // LiteLLM knows the model only under its -preview key.
    insertPrice('gemini-3.1-pro-preview', { input: 2, output: 12, cacheRead: 0.2, provider: 'gemini' })
    expect(ensureCuratedPricingAliases(db)).toBe(3)

    const result = recalcPricing(db)
    expect(result.updatedCount).toBe(3)

    for (const [index, model] of models.entries()) {
      const record = db.prepare('SELECT * FROM records WHERE id = ?').get(`r${index}`) as any
      expect(record.model).toBe(model)
      expect(record.provider).toBe('google')
      expect(record.cost_source).toBe('pricing')
      expect(record.cost).toBeCloseTo(2 + 6, 6)
    }
  })

  it('recalculates cost for pricing-sourced records', () => {
    insertPrice('claude-sonnet-4-6', { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, provider: 'anthropic' })

    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'claude-code', model: 'claude-sonnet-4-6', provider: 'anthropic',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0.001, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = recalcPricing(db)
    expect(result.updatedCount).toBeGreaterThan(0)

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get('r1') as any
    expect(record.cost).toBeGreaterThan(0.001) // Should be recalculated
  })

  it('skips records with costSource = log', () => {
    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'openclaw', model: 'test', provider: 'test',
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0.05, costSource: 'log', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = recalcPricing(db)
    expect(result.skippedCount).toBe(1)
  })

  it('normalizes legacy qoder tier models and recalculates cost', () => {
    insertPrice('qoder-ultimate', { input: 1.6, output: 1.6, cacheRead: 1.6, cacheWrite: 1.6, provider: 'qoder' })

    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'qoder', model: 'ultimate', provider: 'unknown',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 250000, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'pricing', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = recalcPricing(db)
    expect(result.updatedCount).toBe(1)

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get('r1') as any
    expect(record.model).toBe('qoder-ultimate')
    expect(record.provider).toBe('qoder')
    expect(record.cost_source).toBe('pricing')
    expect(record.cost).toBeGreaterThan(0)
  })

  it('preserves a positive log-sourced cost that has no user price', () => {
    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'hermes', model: 'deepseek-v4-pro', provider: 'openclaw',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0.05, costSource: 'log', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = recalcPricing(db)
    expect(result.skippedCount).toBe(1)

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get('r1') as any
    expect(record.cost).toBe(0.05)
    expect(record.cost_source).toBe('log')
  })

  it('recomputes a zero log-sourced cost from the pricing registry (issue #13)', () => {
    // Real openclaw scenario: gateway reports cost.total = 0, stored as cost_source='log'.
    insertPrice('deepseek-v4-pro', { input: 0.435, output: 0.87, provider: 'deepseek' })

    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'openclaw', model: 'deepseek-v4-pro', provider: 'deepseek',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'log', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = recalcPricing(db)
    expect(result.updatedCount).toBe(1)
    expect(result.skippedCount).toBe(0)

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get('r1') as any
    // 1M input * 0.435 + 0.5M output * 0.87 = 0.435 + 0.435 = 0.87
    expect(record.cost).toBeCloseTo(0.87)
    expect(record.cost_source).toBe('pricing')
  })

  it('overrides log-sourced cost when the user has set a manual price (issue #13)', () => {
    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'hermes', model: 'deepseek-v4-pro', provider: 'openclaw',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'log', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    // User configures a manual price via the Pricing UI for this exact model.
    setUserPrice(db, 'deepseek-v4-pro', { input: 1, output: 2 })

    const result = recalcPricing(db)
    expect(result.updatedCount).toBe(1)
    expect(result.skippedCount).toBe(0)

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get('r1') as any
    // 1M input * $1 + 0.5M output * $2 = 1 + 1 = 2
    expect(record.cost).toBe(2)
    expect(record.cost_source).toBe('pricing')
  })

  it('recalculates cost for alias-only model ids from the pricing registry', () => {
    insertPrice('gpt-4o', { input: 2, output: 8, provider: 'openai', sourceModelId: 'openai/gpt-4o' })
    insertAlias('openai/gpt-4o', 'gpt-4o', 'openai')

    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 100, tool: 'codex', model: 'openai/gpt-4o', provider: 'openai',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'unknown', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    const result = recalcPricing(db)
    expect(result.updatedCount).toBe(1)

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get('r1') as any
    expect(record.cost_source).toBe('pricing')
    expect(record.cost).toBe(6)
  })
})

describe('Recalc Command — pulled rows', () => {
  let db: Database.Database
  const OWN = 'device-me'

  function synced(overrides: Partial<SyncRecord> = {}): SyncRecord {
    return {
      id: 'remote-1',
      ts: DAY,
      tool: 'openclaw',
      model: 'deepseek-v4-pro',
      provider: 'deepseek',
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      // A custom gateway reported no cost for this record.
      cost: 0,
      costSource: 'pricing',
      sessionKey: 'session-key-1',
      device: 'remote-host',
      deviceInstanceId: 'device-remote',
      updatedAt: DAY,
      ...overrides,
    }
  }

  function insertPrice(modelKey: string, entry: { input: number; output: number }) {
    const now = Date.now()
    db.prepare(`
      INSERT INTO model_prices (
        model_key, provider, input, output, cache_read, cache_write, currency, source, source_model_id,
        source_url, origin, status, last_synced_at, created_at, updated_at
      ) VALUES (?, '', ?, ?, NULL, NULL, 'USD', 'litellm', ?, NULL, 'builtin', 'active', ?, ?, ?)
    `).run(modelKey, entry.input, entry.output, modelKey, now, now, now)
  }

  function mirroredRow(id = 'remote-1') {
    return db.prepare('SELECT * FROM records WHERE id = ?').get(id) as any
  }

  function mirrorRow(id = 'remote-1') {
    return db.prepare('SELECT * FROM synced_records WHERE id = ?').get(id) as any
  }

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
    insertPrice('deepseek-v4-pro', { input: 0.435, output: 0.87 })
  })

  afterEach(() => {
    db.close()
  })

  it('writes the recalculated price into the mirror every cross-device reading uses', () => {
    insertSyncedRecord(db, synced())
    mergeSyncedRecordsIntoRecords(db, OWN)

    const result = recalcPricing(db, { currentDeviceInstanceId: OWN })

    expect(result.updatedCount).toBe(1)
    expect(result.syncedUpdatedCount).toBe(1)
    // 1M input * 0.435 + 0.5M output * 0.87
    expect(mirroredRow().cost).toBeCloseTo(0.87)
    expect(mirrorRow().cost).toBeCloseTo(0.87)
    expect(mirrorRow().cost_source).toBe('pricing')
    // The owner's next correction is still the newest version anyone has seen.
    expect(mirrorRow().updated_at).toBe(DAY)
    expect(mirroredRow().updated_at).toBe(DAY)
  })

  it('fills a mirror the price never reached, without repricing the copy again', () => {
    insertSyncedRecord(db, synced())
    mergeSyncedRecordsIntoRecords(db, OWN)

    // What an installation recalced by an earlier release looks like: the
    // merged copy carries the price, the mirror still the owner's.
    db.prepare('UPDATE records SET cost = 0.87, cost_source = ? WHERE id = ?').run('pricing', 'remote-1')

    const result = recalcPricing(db, { currentDeviceInstanceId: OWN })

    expect(result.updatedCount).toBe(0)
    expect(result.syncedUpdatedCount).toBe(1)
    expect(mirrorRow().cost).toBeCloseTo(0.87)
  })

  it('keeps a price the owner published when the local registry has none', () => {
    // Price lists differ between devices: this one has no row for the model.
    // "Cannot price it here" is not a correction of the $4 the owner priced.
    insertSyncedRecord(db, synced({ model: 'remote-only-model', cost: 4, costSource: 'pricing' }))
    mergeSyncedRecordsIntoRecords(db, OWN)

    const result = recalcPricing(db, { currentDeviceInstanceId: OWN })

    expect(result.updatedCount).toBe(1)
    expect(result.syncedUpdatedCount).toBe(0)
    expect(mirroredRow().cost).toBe(0)
    expect(mirroredRow().cost_source).toBe('unknown')
    expect(mirrorRow()).toMatchObject({ cost: 4, cost_source: 'pricing' })
  })

  it('does not override a positive logged cost the owner published, even after a manual price is removed', () => {
    insertSyncedRecord(db, synced({ model: 'remote-logged-model', cost: 10, costSource: 'log' }))
    mergeSyncedRecordsIntoRecords(db, OWN)

    // The user sets a manual price and recalculates: the local copy takes it,
    // the owner's logged cost keeps standing on the dashboard.
    setUserPrice(db, 'remote-logged-model', { input: 5, output: 0 })
    recalcPricing(db, { currentDeviceInstanceId: OWN })
    expect(mirroredRow().cost).toBeCloseTo(5)
    expect(mirrorRow()).toMatchObject({ cost: 10, cost_source: 'log' })

    // Removing the manual price leaves nothing to compute from; the mirror
    // must not fall to $0 as well — the owner's unversioned row would never
    // restore it.
    removeUserPrice(db, 'remote-logged-model')
    recalcPricing(db, { currentDeviceInstanceId: OWN })
    expect(mirroredRow()).toMatchObject({ cost: 0, cost_source: 'unknown' })
    expect(mirrorRow()).toMatchObject({ cost: 10, cost_source: 'log' })
  })

  it('leaves the mirror to the owner when the merged copy is newer than it', () => {
    insertSyncedRecord(db, synced())
    mergeSyncedRecordsIntoRecords(db, OWN)
    // The row was refreshed by a later pull the merge has not applied yet.
    db.prepare('UPDATE records SET cache_read_tokens = 900000 WHERE id = ?').run('remote-1')

    const result = recalcPricing(db, { currentDeviceInstanceId: OWN })

    expect(result.updatedCount).toBe(1)
    expect(result.syncedUpdatedCount).toBe(0)
    expect(mirrorRow().cost).toBe(0)
  })
})
