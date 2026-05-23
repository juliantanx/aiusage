import type Database from 'better-sqlite3'
import { calculateCost, inferProvider, normalizeQoderModel, resolvePrice } from '@aiusage/core'

export interface RecalcResult {
  updatedCount: number
  skippedCount: number
}

const BATCH_SIZE = 1000

export function recalcPricing(db: Database.Database): RecalcResult {
  let updatedCount = 0
  let skippedCount = 0
  let lastId = ''

  const updateStmt = db.prepare('UPDATE records SET model = ?, provider = ?, cost = ?, cost_source = ?, updated_at = ? WHERE id = ?')

  while (true) {
    const records = db.prepare(
      'SELECT id, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source FROM records WHERE id > ? ORDER BY id LIMIT ?'
    ).all(lastId, BATCH_SIZE) as any[]

    if (records.length === 0) break

    for (const record of records) {
      if (record.cost_source === 'log') {
        skippedCount++
        continue
      }

      const model = record.tool === 'qoder' ? normalizeQoderModel(record.model) : record.model
      const provider = model !== record.model ? inferProvider(model) : record.provider
      const hasPrice = resolvePrice(model) != null
      const newCost = hasPrice ? calculateCost(model, {
        inputTokens: record.input_tokens,
        outputTokens: record.output_tokens,
        cacheReadTokens: record.cache_read_tokens,
        cacheWriteTokens: record.cache_write_tokens,
        thinkingTokens: record.thinking_tokens,
      }) : 0
      const costSource = hasPrice ? 'pricing' : 'unknown'

      if (model !== record.model || provider !== record.provider || newCost !== record.cost || costSource !== record.cost_source) {
        updateStmt.run(model, provider, newCost, costSource, Date.now(), record.id)
        updatedCount++
      }
    }

    lastId = records[records.length - 1].id
  }

  return { updatedCount, skippedCount }
}
