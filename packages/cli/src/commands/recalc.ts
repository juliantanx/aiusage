import type Database from 'better-sqlite3'
import { calculateCost } from '@aiusage/core'

export interface RecalcResult {
  updatedCount: number
  skippedCount: number
}

const BATCH_SIZE = 1000

export function recalcPricing(db: Database.Database): RecalcResult {
  let updatedCount = 0
  let skippedCount = 0
  let lastId = ''

  const updateStmt = db.prepare('UPDATE records SET cost = ?, updated_at = ? WHERE id = ?')

  while (true) {
    const records = db.prepare(
      'SELECT id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source FROM records WHERE id > ? ORDER BY id LIMIT ?'
    ).all(lastId, BATCH_SIZE) as any[]

    if (records.length === 0) break

    for (const record of records) {
      if (record.cost_source !== 'pricing') {
        skippedCount++
        continue
      }

      const newCost = calculateCost(record.model, {
        inputTokens: record.input_tokens,
        outputTokens: record.output_tokens,
        cacheReadTokens: record.cache_read_tokens,
        cacheWriteTokens: record.cache_write_tokens,
        thinkingTokens: record.thinking_tokens,
      })

      if (newCost !== record.cost) {
        updateStmt.run(newCost, Date.now(), record.id)
        updatedCount++
      }
    }

    lastId = records[records.length - 1].id
  }

  return { updatedCount, skippedCount }
}
