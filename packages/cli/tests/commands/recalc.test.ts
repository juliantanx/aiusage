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
})
