import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { recalcPricing } from '../../src/commands/recalc.js'
import type { StatsRecord } from '@aiusage/core'

describe('Recalc Command', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('recalculates cost for pricing-sourced records', () => {
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

  it('recalculates cost for alias-only model ids from the pricing registry', () => {
    db.prepare(`
      UPDATE model_prices
      SET input = 2, output = 8, cache_read = NULL, cache_write = NULL, currency = 'USD', source = 'litellm', source_model_id = 'openai/gpt-4o'
      WHERE model_key = 'gpt-4o'
    `).run()
    db.prepare(`
      INSERT OR REPLACE INTO model_price_aliases (alias, model_key, match_type, provider, priority, source, origin, enabled, created_at, updated_at)
      VALUES ('openai/gpt-4o', 'gpt-4o', 'exact', 'openai', 100, 'litellm', 'builtin', 1, ?, ?)
    `).run(Date.now(), Date.now())

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
