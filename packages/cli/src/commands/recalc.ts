import type Database from 'better-sqlite3'
import { calculateCostForPrice, inferProvider, normalizeQoderModel, resolveExchangeRate } from '@aiusage/core'
import { loadConfig } from '../config.js'
import { hasUserPrice, resolvePriceFromRegistry } from '../pricing-registry.js'

export interface RecalcResult {
  updatedCount: number
  skippedCount: number
}

const BATCH_SIZE = 1000

export function recalcPricing(db: Database.Database): RecalcResult {
  let updatedCount = 0
  let skippedCount = 0
  let lastId = ''
  const exchangeRate = resolveExchangeRate(loadConfig() ?? {})

  const updateStmt = db.prepare('UPDATE records SET model = ?, provider = ?, cost = ?, cost_source = ?, updated_at = ? WHERE id = ?')

  while (true) {
    const records = db.prepare(
      'SELECT id, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source FROM records WHERE id > ? ORDER BY id LIMIT ?'
    ).all(lastId, BATCH_SIZE) as any[]

    if (records.length === 0) break

    for (const record of records) {
      const model = record.tool === 'qoder' ? normalizeQoderModel(record.model) : record.model

      // Logged costs are treated as authoritative and left untouched — unless the
      // user has explicitly configured a manual price for this model, in which case
      // their override must win over an unreliable gateway-reported cost (issue #13).
      if (record.cost_source === 'log' && !hasUserPrice(db, model)) {
        skippedCount++
        continue
      }

      const provider = model !== record.model ? inferProvider(model) : record.provider
      const price = resolvePriceFromRegistry(db, model)
      const newCost = price ? calculateCostForPrice(price, {
        inputTokens: record.input_tokens,
        outputTokens: record.output_tokens,
        cacheReadTokens: record.cache_read_tokens,
        cacheWriteTokens: record.cache_write_tokens,
        thinkingTokens: record.thinking_tokens,
      }, exchangeRate) : 0
      const costSource = price ? 'pricing' : 'unknown'

      if (model !== record.model || provider !== record.provider || newCost !== record.cost || costSource !== record.cost_source) {
        updateStmt.run(model, provider, newCost, costSource, Date.now(), record.id)
        updatedCount++
      }
    }

    lastId = records[records.length - 1].id
  }

  return { updatedCount, skippedCount }
}
