import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { recalcPricing } from '../../src/commands/recalc.js'
import { setUserPrice } from '../../src/pricing-registry.js'
import type { StatsRecord } from '@aiusage/core'

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
