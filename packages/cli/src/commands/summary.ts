import type Database from 'better-sqlite3'
import { getToolCallStats } from '../db/tool-calls.js'

export interface SummaryOptions {
  device?: string
  tool?: string
  currentDeviceInstanceId?: string
}

export interface SummaryResult {
  totalTokens: number
  totalCost: number
  recordCount: number
  byTool: Record<string, { tokens: number; cost: number }>
  topToolCalls: Array<{ name: string; count: number }>
  deviceCount: number
  deviceLabel: string | null
}

export function generateSummary(db: Database.Database, options?: SummaryOptions): SummaryResult {
  const currentId = options?.currentDeviceInstanceId
  const device = options?.device

  let totalsSql: string
  let totalsParams: Record<string, unknown> = {}
  let byToolSql: string
  let byToolParams: Record<string, unknown> = {}

  const localOnlyFilter = "AND source_file NOT LIKE 'synced/%'"
  const toolWhere = options?.tool ? 'AND tool = @tool' : ''
  const toolParam = options?.tool ? { tool: options.tool } : {}

  if (currentId && !device) {
    // All devices: UNION (exclude merged synced records from records to avoid double-counting)
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS recordCount
      FROM (
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM records WHERE 1=1 ${localOnlyFilter} ${toolWhere}
        UNION ALL
        SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM synced_records WHERE device_instance_id != @currentId ${toolWhere}
      )`
    totalsParams = { currentId, ...toolParam }

    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM (
        SELECT tool, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM records WHERE 1=1 ${localOnlyFilter} ${toolWhere}
        UNION ALL
        SELECT tool, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost FROM synced_records WHERE device_instance_id != @currentId ${toolWhere}
      )
      GROUP BY tool ORDER BY cost DESC`
    byToolParams = { currentId, ...toolParam }
  } else if (currentId && device && device !== currentId) {
    // Specific other device
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS recordCount
      FROM synced_records WHERE device_instance_id = @device ${toolWhere}`
    totalsParams = { device, ...toolParam }

    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM synced_records WHERE device_instance_id = @device ${toolWhere}
      GROUP BY tool ORDER BY cost DESC`
    byToolParams = { device, ...toolParam }
  } else {
    // Local only (current device specified or no currentId)
    totalsSql = `
      SELECT
        COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS recordCount
      FROM records WHERE 1=1 ${currentId ? localOnlyFilter : ''} ${toolWhere}`
    totalsParams = { ...toolParam }

    byToolSql = `
      SELECT tool,
             SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
             SUM(cost) AS cost
      FROM records WHERE 1=1 ${currentId ? localOnlyFilter : ''} ${toolWhere}
      GROUP BY tool ORDER BY cost DESC`
    byToolParams = { ...toolParam }
  }

  const totals = db.prepare(totalsSql).get(totalsParams) as { totalTokens: number; totalCost: number; recordCount: number }

  const byToolRows = db.prepare(byToolSql).all(byToolParams) as Array<{ tool: string; tokens: number; cost: number }>
  const byTool: Record<string, { tokens: number; cost: number }> = {}
  for (const row of byToolRows) {
    byTool[row.tool] = { tokens: row.tokens, cost: row.cost }
  }

  const toolCallStats = getToolCallStats(db)

  // Count devices
  let deviceCount = 1
  let deviceLabel: string | null = null
  if (currentId) {
    const localDevices = db.prepare('SELECT DISTINCT device_instance_id FROM records').all() as any[]
    const syncedDevices = db.prepare('SELECT DISTINCT device_instance_id FROM synced_records WHERE device_instance_id != ?').all(currentId) as any[]
    const allDeviceIds = new Set([...localDevices.map(d => d.device_instance_id), ...syncedDevices.map(d => d.device_instance_id)])
    deviceCount = allDeviceIds.size
    if (device) {
      const row = db.prepare('SELECT device FROM synced_records WHERE device_instance_id = ? LIMIT 1').get(device) as any
      deviceLabel = row?.device ?? device
    }
  }

  return {
    totalTokens: totals.totalTokens,
    totalCost: totals.totalCost,
    recordCount: totals.recordCount,
    byTool,
    topToolCalls: toolCallStats.slice(0, 3),
    deviceCount,
    deviceLabel,
  }
}
