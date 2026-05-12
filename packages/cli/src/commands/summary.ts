import type Database from 'better-sqlite3'
import { getToolCallStats } from '../db/tool-calls.js'

export interface SummaryResult {
  totalTokens: number
  totalCost: number
  records: any[]
  byTool: Record<string, { tokens: number; cost: number }>
  topToolCalls: Array<{ name: string; count: number }>
}

export function generateSummary(db: Database.Database): SummaryResult {
  const records = db.prepare('SELECT * FROM records').all() as any[]

  let totalTokens = 0
  let totalCost = 0
  const byTool: Record<string, { tokens: number; cost: number }> = {}

  for (const record of records) {
    const tokens = record.input_tokens + record.output_tokens
    totalTokens += tokens
    totalCost += record.cost

    if (!byTool[record.tool]) {
      byTool[record.tool] = { tokens: 0, cost: 0 }
    }
    byTool[record.tool].tokens += tokens
    byTool[record.tool].cost += record.cost
  }

  const toolCallStats = getToolCallStats(db)

  return {
    totalTokens,
    totalCost,
    records,
    byTool,
    topToolCalls: toolCallStats.slice(0, 3),
  }
}
