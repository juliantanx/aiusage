import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'
import { insertRecord } from '../../src/db/records.js'
import { recalcPricing } from '../../src/commands/recalc.js'
import { importConfigPriceOverrides, setUserPrice, resolvePriceFromRegistry } from '../../src/pricing-registry.js'

describe('importConfigPriceOverrides (issue #13)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('imports legacy config overrides as user prices', () => {
    const imported = importConfigPriceOverrides(db, {
      'deepseek-v4-pro': { input: 1, output: 2 },
      'mimo-v2.5-pro': { input: 3, output: 6, currency: 'CNY' },
    })

    expect(imported.sort()).toEqual(['deepseek-v4-pro', 'mimo-v2.5-pro'])
    expect(resolvePriceFromRegistry(db, 'deepseek-v4-pro')).toMatchObject({ input: 1, output: 2 })
    expect(resolvePriceFromRegistry(db, 'mimo-v2.5-pro')).toMatchObject({ input: 3, output: 6, currency: 'CNY' })
  })

  it('does not clobber an existing user price set via the UI', () => {
    setUserPrice(db, 'deepseek-v4-pro', { input: 0.5, output: 1 })

    const imported = importConfigPriceOverrides(db, { 'deepseek-v4-pro': { input: 1, output: 2 } })

    expect(imported).toEqual([])
    expect(resolvePriceFromRegistry(db, 'deepseek-v4-pro')).toMatchObject({ input: 0.5, output: 1 })
  })

  it('makes a migrated config price take effect on recalc of a zero-cost log record', () => {
    insertRecord(db, {
      id: 'r1', ts: Date.now(), ingestedAt: Date.now(), updatedAt: Date.now(),
      lineOffset: 1, tool: 'openclaw', model: 'deepseek-v4-pro', provider: 'deepseek',
      inputTokens: 1000000, outputTokens: 500000, cacheReadTokens: 0, cacheWriteTokens: 0,
      thinkingTokens: 0, cost: 0, costSource: 'log', sessionId: 's1',
      sourceFile: '/f1', device: 'd1', deviceInstanceId: 'di1',
    })

    importConfigPriceOverrides(db, { 'deepseek-v4-pro': { input: 1, output: 2 } })
    const result = recalcPricing(db)
    expect(result.updatedCount).toBe(1)

    const record = db.prepare('SELECT cost, cost_source FROM records WHERE id = ?').get('r1') as any
    // 1M input * 1 + 0.5M output * 2 = 2
    expect(record.cost).toBeCloseTo(2)
    expect(record.cost_source).toBe('pricing')
  })
})
