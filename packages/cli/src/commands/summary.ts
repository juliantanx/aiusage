import type Database from 'better-sqlite3'
import { getToolCallStats } from '../db/tool-calls.js'

export interface SummaryResult {
  totalTokens: number
  totalCost: number
  recordCount: number
  byTool: Record<string, { tokens: number; cost: number }>
  topToolCalls: Array<{ name: string; count: number }>
}

export function generateSummary(db: Database.Database): SummaryResult {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
      COALESCE(SUM(cost), 0) AS totalCost,
      COUNT(*) AS recordCount
    FROM records
  `).get() as { totalTokens: number; totalCost: number; recordCount: number }

  const byToolRows = db.prepare(`
    SELECT tool,
           SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
           SUM(cost) AS cost
    FROM records
    GROUP BY tool ORDER BY cost DESC
  `).all() as Array<{ tool: string; tokens: number; cost: number }>

  const byTool: Record<string, { tokens: number; cost: number }> = {}
  for (const row of byToolRows) {
    byTool[row.tool] = { tokens: row.tokens, cost: row.cost }
  }

  const toolCallStats = getToolCallStats(db)

  return {
    totalTokens: totals.totalTokens,
    totalCost: totals.totalCost,
    recordCount: totals.recordCount,
    byTool,
    topToolCalls: toolCallStats.slice(0, 3),
  }
}
