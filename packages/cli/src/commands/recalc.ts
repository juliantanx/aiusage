import type Database from 'better-sqlite3'
import { calculateCost } from '@aiusage/core'

export interface RecalcResult {
  updatedCount: number
  skippedCount: number
}

export function recalcPricing(db: Database.Database): RecalcResult {
  const records = db.prepare('SELECT * FROM records').all() as any[]
  let updatedCount = 0
  let skippedCount = 0

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
      db.prepare('UPDATE records SET cost = ?, updated_at = ? WHERE id = ?').run(newCost, Date.now(), record.id)
      updatedCount++
    }
  }

  return { updatedCount, skippedCount }
}
