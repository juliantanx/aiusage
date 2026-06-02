import http from 'node:http'
import path from 'node:path'
import { hostname, platform } from 'node:os'
import type Database from 'better-sqlite3'
import { calculateCost, getPriceTable, setPriceOverride, removePriceOverride, getUserOverrides, DEFAULT_PRICE_TABLE, resolvePrice, inferProvider, normalizeQoderModel, resolveExchangeRate, fetchExchangeRate, type PriceEntry } from '@aiusage/core'
import { loadConfig, saveConfig, loadCredential } from '../config.js'
import type { Config, SourcesConfig, SyncConfig } from '../config.js'
import { extractProject, extractProjectFromCwd } from './project-extraction.js'
import { getDefaultSourcePaths } from '../commands/parse.js'
import type { SyncStartResult, SyncStatusSnapshot } from '../sync/runtime.js'
import { queryAllQuotas } from '../quota.js'

function recalcCosts(db: Database.Database): number {
  const BATCH_SIZE = 1000
  let updated = 0
  let lastId = ''
  const exchangeRate = resolveExchangeRate(loadConfig() ?? {})
  while (true) {
    const records = db.prepare(
      'SELECT id, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source FROM records WHERE id > ? ORDER BY id LIMIT ?'
    ).all(lastId, BATCH_SIZE) as any[]
    if (records.length === 0) break
    const updateStmt = db.prepare('UPDATE records SET model = ?, provider = ?, cost = ?, cost_source = ?, updated_at = ? WHERE id = ?')
    const tx = db.transaction((batch: any[]) => {
      for (const r of batch) {
        if (r.cost_source === 'log') continue

        const rawModel = r.tool === 'qoder' ? normalizeQoderModel(r.model) : r.model
        const model = rawModel === 'unknown' ? (r.tool === 'qoder' ? 'qoder-auto' : r.model) : rawModel
        const provider = model !== r.model ? inferProvider(model) : r.provider
        const hasPrice = resolvePrice(model) != null
        const cost = hasPrice ? calculateCost(model, {
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          cacheReadTokens: r.cache_read_tokens,
          cacheWriteTokens: r.cache_write_tokens,
          thinkingTokens: r.thinking_tokens,
        }, exchangeRate) : 0
        const costSource = hasPrice ? 'pricing' : 'unknown'

        if (model === r.model && provider === r.provider && cost === r.cost && costSource === r.cost_source) continue
        updateStmt.run(model, provider, cost, costSource, Date.now(), r.id)
        updated++
      }
    })
    tx(records)
    lastId = records[records.length - 1].id
  }
  return updated
}

function getDateRangeFilter(range: string | null, from: string | null, to: string | null, prefix = '', weekStart: 0 | 1 = 1): { where: string; params: Record<string, unknown> } {
  const ts = prefix ? `${prefix}.ts` : 'ts'

  if (from && to) {
    const startMs = new Date(from).getTime()
    const endMs = new Date(to + 'T23:59:59.999Z').getTime()
    return { where: `AND ${ts} >= @start AND ${ts} < @end`, params: { start: startMs, end: endMs } }
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (range === 'week') {
    const dayOfWeek = today.getDay()
    const diff = (dayOfWeek - weekStart + 7) % 7
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - diff)
    return { where: `AND ${ts} >= @start`, params: { start: startOfWeek.getTime() } }
  }
  if (range === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return { where: `AND ${ts} >= @start`, params: { start: startOfMonth.getTime() } }
  }
  if (range === 'last30') {
    const start = new Date(today)
    start.setDate(start.getDate() - 30)
    return { where: `AND ${ts} >= @start`, params: { start: start.getTime() } }
  }
  if (range === 'all') {
    return { where: '', params: {} }
  }
  // default: day
  return { where: `AND ${ts} >= @start`, params: { start: today.getTime() } }
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}


export interface ApiServerOptions {
  currentDeviceInstanceId?: string
  onRefresh?: () => Promise<{ parsedCount: number; toolCallCount: number; errors: string[] }>
  onSyncStart?: () => SyncStartResult
  getSyncStatus?: () => SyncStatusSnapshot | null
  onConfigUpdated?: () => void
}

interface DeviceFilter {
  /** SQL fragment for WHERE clause (prepend with AND) */
  where: string
  /** Named parameters for the WHERE fragment */
  params: Record<string, unknown>
  /** True when query should UNION records + synced_records */
  useUnion: boolean
  /** True when querying records table should exclude merged synced records */
  localOnly: boolean
}

function getToolFilter(tool: string | null, prefix = ''): { where: string; params: Record<string, unknown> } {
  if (!tool) return { where: '', params: {} }
  const col = prefix ? `${prefix}.tool` : 'tool'
  return { where: `AND ${col} = @tool`, params: { tool } }
}

function classifyToolCall(name: string): 'mcp' | 'skill' | 'builtin' {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.startsWith('skill__') || name === 'Skill') return 'skill'
  return 'builtin'
}

function parseMcpName(name: string): { server: string; action: string; display: string } {
  const withoutPrefix = name.slice(5)
  const idx = withoutPrefix.indexOf('__')
  if (idx === -1) return { server: withoutPrefix, action: '', display: withoutPrefix }
  return {
    server: withoutPrefix.slice(0, idx),
    action: withoutPrefix.slice(idx + 2),
    display: `${withoutPrefix.slice(0, idx)} / ${withoutPrefix.slice(idx + 2)}`,
  }
}

function getToolTypeFilter(toolType: string | null): string {
  if (toolType === 'mcp') return "AND tc.name LIKE 'mcp\\_\\_%' ESCAPE '\\'"
  if (toolType === 'skill') return "AND (tc.name LIKE 'skill\\_\\_%' ESCAPE '\\' OR tc.name = 'Skill')"
  if (toolType === 'builtin') return "AND tc.name NOT LIKE 'mcp\\_\\_%' ESCAPE '\\' AND tc.name NOT LIKE 'skill\\_\\_%' ESCAPE '\\' AND tc.name != 'Skill'"
  return ''
}

const LOCAL_ONLY_FILTER = "AND source_file NOT LIKE 'synced/%'"

function getDeviceFilter(
  device: string | null | undefined,
  currentDeviceInstanceId: string | undefined,
): DeviceFilter {
  if (!currentDeviceInstanceId) {
    // No device instance ID available — query only records (legacy behavior)
    return { where: '', params: {}, useUnion: false, localOnly: false }
  }

  if (!device) {
    // All devices: UNION local records + synced_records from other devices
    // localOnly=true prevents double-counting merged synced records
    return {
      where: '',
      params: { currentDeviceId: currentDeviceInstanceId },
      useUnion: true,
      localOnly: true,
    }
  }

  if (device === currentDeviceInstanceId) {
    // Current device only: query local records only (not merged synced from other devices)
    return { where: '', params: {}, useUnion: false, localOnly: true }
  }

  // Specific other device: query synced_records only
  return {
    where: 'AND device_instance_id = @deviceId',
    params: { deviceId: device },
    useUnion: false,
    localOnly: false,
  }
}

export function createApiServer(db: Database.Database, options?: ApiServerOptions): http.Server {
  const cfg = loadConfig()
  let weekStart: 0 | 1 = (cfg?.weekStart ?? 1) as 0 | 1

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const range = url.searchParams.get('range')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    // Validate tool parameter early — same style as range validation
    const toolParam = url.searchParams.get('tool')
    const VALID_TOOLS = ['claude-code', 'codex', 'openclaw', 'opencode', 'hermes', 'qoder', 'cursor', 'kilocode']
    if (toolParam && !VALID_TOOLS.includes(toolParam)) {
      json(res, { error: { code: 'INVALID_PARAM', message: 'Invalid tool' } }, 400)
      return
    }

    try {
      // ── /api/summary ──────────────────────────────────────────────
      if (url.pathname === '/api/summary') {
        if (range && !['day', 'week', 'month', 'last30', 'all'].includes(range)) {
          json(res, { error: { code: 'INVALID_PARAM', message: 'Invalid range' } }, 400)
          return
        }
        const device = url.searchParams.get('device')
        const df = getDeviceFilter(device, options?.currentDeviceInstanceId)
        const dr = getDateRangeFilter(range, from, to, '', weekStart)
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool)

        let totals: any
        let byToolRows: any[]

        if (df.useUnion) {
          // All devices: UNION records + synced_records (excluding current device's synced copy)
          const unionSql = `
            SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, ts, session_id
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            UNION ALL
            SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, ts, session_key AS session_id
            FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where}
          `
          totals = db.prepare(`
            SELECT
              COALESCE(SUM(input_tokens), 0) AS inputTokens,
              COALESCE(SUM(output_tokens), 0) AS outputTokens,
              COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
              COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
              COALESCE(SUM(thinking_tokens), 0) AS thinkingTokens,
              COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
              COALESCE(SUM(cost), 0) AS totalCost,
              COUNT(DISTINCT strftime('%Y-%m-%d', ts/1000, 'unixepoch')) AS activeDays,
              COUNT(DISTINCT session_id) AS totalSessions
            FROM (${unionSql})
          `).get({ ...dr.params, ...df.params, ...tf.params }) as any

          byToolRows = db.prepare(`
            SELECT tool, SUM(tokens) AS tokens, SUM(cost) AS cost FROM (
              SELECT tool,
                     SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
                     SUM(cost) AS cost
              FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
              GROUP BY tool
              UNION ALL
              SELECT tool,
                     SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
                     SUM(cost) AS cost
              FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where}
              GROUP BY tool
            ) GROUP BY tool ORDER BY cost DESC
          `).all({ ...dr.params, ...df.params, ...tf.params }) as any[]
        } else if (df.where) {
          // Specific other device: query synced_records only
          totals = db.prepare(`
            SELECT
              COALESCE(SUM(input_tokens), 0) AS inputTokens,
              COALESCE(SUM(output_tokens), 0) AS outputTokens,
              COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
              COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
              COALESCE(SUM(thinking_tokens), 0) AS thinkingTokens,
              COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
              COALESCE(SUM(cost), 0) AS totalCost,
              COUNT(DISTINCT strftime('%Y-%m-%d', ts/1000, 'unixepoch')) AS activeDays,
              COUNT(DISTINCT session_key) AS totalSessions
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
          `).get({ ...dr.params, ...df.params, ...tf.params }) as any

          byToolRows = db.prepare(`
            SELECT tool,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
                   SUM(cost) AS cost
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
            GROUP BY tool ORDER BY cost DESC
          `).all({ ...dr.params, ...df.params, ...tf.params }) as any[]
        } else {
          // Current device or legacy: query records only
          totals = db.prepare(`
            SELECT
              COALESCE(SUM(input_tokens), 0) AS inputTokens,
              COALESCE(SUM(output_tokens), 0) AS outputTokens,
              COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens,
              COALESCE(SUM(cache_write_tokens), 0) AS cacheWriteTokens,
              COALESCE(SUM(thinking_tokens), 0) AS thinkingTokens,
              COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens), 0) AS totalTokens,
              COALESCE(SUM(cost), 0) AS totalCost,
              COUNT(DISTINCT strftime('%Y-%m-%d', ts/1000, 'unixepoch')) AS activeDays,
              COUNT(DISTINCT session_id) AS totalSessions
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
          `).get({ ...dr.params, ...tf.params }) as any

          byToolRows = db.prepare(`
            SELECT tool,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS tokens,
                   SUM(cost) AS cost
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY tool ORDER BY cost DESC
          `).all({ ...dr.params, ...tf.params }) as any[]
        }

        const byTool: Record<string, { tokens: number; cost: number }> = {}
        for (const row of byToolRows) {
          byTool[row.tool] = { tokens: row.tokens, cost: row.cost }
        }

        const drJoin = getDateRangeFilter(range, from, to, 'r', weekStart)
        const dfJoin = df.where ? df.where.replace(/device_instance_id/g, 'r.device_instance_id') : ''
        const tfJoin = getToolFilter(tool, 'r')
        const topToolCalls = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dfJoin} ${drJoin.where} ${tfJoin.where}
          GROUP BY tc.name ORDER BY count DESC LIMIT 10
        `).all({ ...drJoin.params, ...df.params, ...tfJoin.params }) as any[]

        const topMcpServersRaw = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE tc.name LIKE 'mcp\\_\\_%' ESCAPE '\\'
            AND INSTR(SUBSTR(tc.name, 6), '__') > 0
            ${dfJoin} ${drJoin.where} ${tfJoin.where}
          GROUP BY tc.name ORDER BY count DESC
        `).all({ ...drJoin.params, ...df.params, ...tfJoin.params }) as any[]

        // Aggregate by server (multiple mcp__server__X tools collapse to one server)
        const mcpServerMap = new Map<string, number>()
        for (const row of topMcpServersRaw) {
          const server = parseMcpName(row.name).server
          mcpServerMap.set(server, (mcpServerMap.get(server) ?? 0) + row.count)
        }
        const topMcpServers = Array.from(mcpServerMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([server, count]) => ({ server, count }))

        json(res, {
          inputTokens: totals.inputTokens,
          outputTokens: totals.outputTokens,
          cacheReadTokens: totals.cacheReadTokens,
          cacheWriteTokens: totals.cacheWriteTokens,
          thinkingTokens: totals.thinkingTokens,
          totalTokens: totals.totalTokens,
          totalCost: totals.totalCost,
          activeDays: totals.activeDays,
          totalSessions: totals.totalSessions,
          byTool,
          topToolCalls,
          topMcpServers,
        })
        return
      }

      // ── /api/tokens ───────────────────────────────────────────────
      if (url.pathname === '/api/tokens') {
        const dr = getDateRangeFilter(range, from, to, '', weekStart)
        const device = url.searchParams.get('device')
        const df = getDeviceFilter(device, options?.currentDeviceInstanceId)
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool)

        let sql: string
        let params: Record<string, unknown>

        if (df.useUnion) {
          sql = `
            SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS date,
                   SUM(input_tokens) AS inputTokens,
                   SUM(output_tokens) AS outputTokens,
                   SUM(cache_read_tokens) AS cacheReadTokens,
                   SUM(cache_write_tokens) AS cacheWriteTokens,
                   SUM(thinking_tokens) AS thinkingTokens
            FROM (
              SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, ts FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
              UNION ALL
              SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, ts FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where}
            )
            GROUP BY date ORDER BY date`
          params = { ...dr.params, currentDeviceId: df.params.currentDeviceId, ...tf.params }
        } else if (device && device !== options?.currentDeviceInstanceId) {
          sql = `
            SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS date,
                   SUM(input_tokens) AS inputTokens,
                   SUM(output_tokens) AS outputTokens,
                   SUM(cache_read_tokens) AS cacheReadTokens,
                   SUM(cache_write_tokens) AS cacheWriteTokens,
                   SUM(thinking_tokens) AS thinkingTokens
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
            GROUP BY date ORDER BY date`
          params = { ...df.params, ...dr.params, ...tf.params }
        } else {
          sql = `
            SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS date,
                   SUM(input_tokens) AS inputTokens,
                   SUM(output_tokens) AS outputTokens,
                   SUM(cache_read_tokens) AS cacheReadTokens,
                   SUM(cache_write_tokens) AS cacheWriteTokens,
                   SUM(thinking_tokens) AS thinkingTokens
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY date ORDER BY date`
          params = { ...dr.params, ...tf.params }
        }

        const rows = db.prepare(sql).all(params) as any[]
        json(res, { data: rows })
        return
      }

      // ── /api/cost ─────────────────────────────────────────────────
      if (url.pathname === '/api/cost') {
        const dr = getDateRangeFilter(range, from, to, '', weekStart)
        const device = url.searchParams.get('device')
        const df = getDeviceFilter(device, options?.currentDeviceInstanceId)
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool)

        let daily: any[]
        let byToolRows: any[]
        let byModelRows: any[]

        if (df.useUnion) {
          daily = db.prepare(`
            SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS date,
                   SUM(cost) AS cost
            FROM (
              SELECT cost, ts FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
              UNION ALL
              SELECT cost, ts FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where}
            )
            GROUP BY date ORDER BY date
          `).all({ ...dr.params, currentDeviceId: df.params.currentDeviceId, ...tf.params }) as any[]

          byToolRows = db.prepare(`
            SELECT tool, SUM(cost) AS cost FROM (
              SELECT tool, SUM(cost) AS cost FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where} GROUP BY tool
              UNION ALL
              SELECT tool, SUM(cost) AS cost FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where} GROUP BY tool
            ) GROUP BY tool ORDER BY cost DESC
          `).all({ ...dr.params, currentDeviceId: df.params.currentDeviceId, ...tf.params }) as any[]

          byModelRows = db.prepare(`
            SELECT model, SUM(cost) AS cost FROM (
              SELECT model, SUM(cost) AS cost FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where} GROUP BY model
              UNION ALL
              SELECT model, SUM(cost) AS cost FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where} GROUP BY model
            ) GROUP BY model ORDER BY cost DESC
          `).all({ ...dr.params, currentDeviceId: df.params.currentDeviceId, ...tf.params }) as any[]
        } else if (device && device !== options?.currentDeviceInstanceId) {
          daily = db.prepare(`
            SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS date,
                   SUM(cost) AS cost
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
            GROUP BY date ORDER BY date
          `).all({ ...df.params, ...dr.params, ...tf.params }) as any[]

          byToolRows = db.prepare(`
            SELECT tool, SUM(cost) AS cost
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
            GROUP BY tool ORDER BY cost DESC
          `).all({ ...df.params, ...dr.params, ...tf.params }) as any[]

          byModelRows = db.prepare(`
            SELECT model, SUM(cost) AS cost
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
            GROUP BY model ORDER BY cost DESC
          `).all({ ...df.params, ...dr.params, ...tf.params }) as any[]
        } else {
          daily = db.prepare(`
            SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch') AS date,
                   SUM(cost) AS cost
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY date ORDER BY date
          `).all({ ...dr.params, ...tf.params }) as any[]

          byToolRows = db.prepare(`
            SELECT tool, SUM(cost) AS cost
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY tool ORDER BY cost DESC
          `).all({ ...dr.params, ...tf.params }) as any[]

          byModelRows = db.prepare(`
            SELECT model, SUM(cost) AS cost
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY model ORDER BY cost DESC
          `).all({ ...dr.params, ...tf.params }) as any[]
        }

        const byTool: Record<string, number> = {}
        for (const r of byToolRows) byTool[r.tool] = r.cost

        const byModel: Record<string, number> = {}
        for (const r of byModelRows) byModel[r.model] = r.cost

        json(res, { data: daily, byTool, byModel })
        return
      }

      // ── /api/models ───────────────────────────────────────────────
      if (url.pathname === '/api/models') {
        const dr = getDateRangeFilter(range, from, to, '', weekStart)
        const device = url.searchParams.get('device')
        const df = getDeviceFilter(device, options?.currentDeviceInstanceId)
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool)

        let total: number
        let rows: any[]

        if (df.useUnion) {
          const unionSql = `
            SELECT model, provider, COUNT(*) AS callCount,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY model, provider
            UNION ALL
            SELECT model, provider, COUNT(*) AS callCount,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens
            FROM synced_records WHERE device_instance_id != @currentDeviceId ${dr.where} ${tf.where}
            GROUP BY model, provider
          `
          const mergedRows = db.prepare(`
            SELECT model, provider, SUM(callCount) AS callCount, SUM(totalTokens) AS totalTokens
            FROM (${unionSql})
            WHERE model != 'unknown'
            GROUP BY model, provider ORDER BY callCount DESC
          `).all({ ...dr.params, ...df.params, ...tf.params }) as any[]
          total = mergedRows.reduce((s, r) => s + r.callCount, 0) || 1
          rows = mergedRows
        } else if (device && device !== options?.currentDeviceInstanceId) {
          rows = db.prepare(`
            SELECT model, provider,
                   COUNT(*) AS callCount,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens
            FROM synced_records WHERE 1=1 AND model != 'unknown' ${df.where} ${dr.where} ${tf.where}
            GROUP BY model, provider ORDER BY callCount DESC
          `).all({ ...df.params, ...dr.params, ...tf.params }) as any[]
          total = rows.reduce((s, r) => s + r.callCount, 0) || 1
        } else {
          rows = db.prepare(`
            SELECT model, provider,
                   COUNT(*) AS callCount,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens
            FROM records WHERE 1=1 AND model != 'unknown' ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
            GROUP BY model, provider ORDER BY callCount DESC
          `).all({ ...dr.params, ...tf.params }) as any[]
          total = rows.reduce((s, r) => s + r.callCount, 0) || 1
        }

        const models = rows.map(r => ({
          model: r.model,
          provider: r.provider,
          callCount: r.callCount,
          totalTokens: r.totalTokens,
          percentage: Math.round((r.callCount / total) * 1000) / 10,
        }))

        json(res, { models })
        return
      }

      // ── /api/tool-calls ───────────────────────────────────────────
      if (url.pathname === '/api/tool-calls') {
        const device = url.searchParams.get('device')
        if (device && device !== options?.currentDeviceInstanceId) {
          json(res, { toolCalls: [] })
          return
        }

        const dr = getDateRangeFilter(range, from, to, 'r', weekStart)
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool, 'r')
        const toolType = url.searchParams.get('toolType')
        if (toolType && !['mcp', 'skill', 'builtin'].includes(toolType)) {
          json(res, { error: { code: 'INVALID_PARAM', message: 'Invalid toolType' } }, 400)
          return
        }
        const ttf = getToolTypeFilter(toolType)

        const totalRow = db.prepare(`
          SELECT COUNT(*) AS total FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dr.where} ${tf.where} ${ttf}
        `).get({ ...dr.params, ...tf.params }) as any
        const total = totalRow.total || 1

        const rows = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dr.where} ${tf.where} ${ttf}
          GROUP BY tc.name ORDER BY count DESC
        `).all({ ...dr.params, ...tf.params }) as any[]

        const toolCalls = rows.map(r => {
          const type = classifyToolCall(r.name)
          const mcpParsed = type === 'mcp' ? parseMcpName(r.name) : null
          const displayName = mcpParsed
            ? mcpParsed.display
            : (type === 'skill' && r.name.startsWith('skill__'))
              ? r.name.slice('skill__'.length)
              : r.name
          return {
            name: r.name,
            displayName,
            mcpServer: mcpParsed ? mcpParsed.server : null,
            type,
            count: r.count,
            percentage: Math.round((r.count / total) * 1000) / 10,
          }
        })

        json(res, { toolCalls })
        return
      }

      // ── /api/sessions/:sessionId ──────────────────────────────────
      if (url.pathname.startsWith('/api/sessions/') && req.method === 'GET') {
        const sessionId = decodeURIComponent(url.pathname.slice('/api/sessions/'.length))
        if (!sessionId) {
          json(res, { error: { code: 'INVALID_PARAM', message: 'Missing sessionId' } }, 400)
          return
        }

        const toolParam = url.searchParams.get('tool')
        const deviceParam = url.searchParams.get('device')

        // Build optional filters
        const toolClause = toolParam ? 'AND tool = @tool' : ''
        const deviceClause = deviceParam ? 'AND device_instance_id = @device' : ''
        const filterParams: Record<string, unknown> = { sessionId }
        if (toolParam) filterParams.tool = toolParam
        if (deviceParam) filterParams.device = deviceParam

        // Session metadata
        const meta = db.prepare(`
          SELECT session_id AS sessionId,
                 tool, model,
                 MIN(ts) AS firstTs,
                 MAX(ts) AS lastTs,
                 MAX(ts) - MIN(ts) AS duration,
                 SUM(input_tokens) AS inputTokens,
                 SUM(output_tokens) AS outputTokens,
                 SUM(cache_read_tokens) AS cacheReadTokens,
                 SUM(cache_write_tokens) AS cacheWriteTokens,
                 SUM(thinking_tokens) AS thinkingTokens,
                 SUM(cost) AS cost,
                 COUNT(*) AS recordCount
          FROM records
          WHERE session_id = @sessionId ${toolClause} ${deviceClause}
          GROUP BY session_id, tool, model
          ORDER BY MIN(ts) ASC
          LIMIT 1
        `).get(filterParams) as any

        if (!meta) {
          json(res, { error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404)
          return
        }

        // Records in ascending order
        const records = db.prepare(`
          SELECT id, ts, model,
                 input_tokens AS inputTokens,
                 output_tokens AS outputTokens,
                 cache_read_tokens AS cacheReadTokens,
                 cache_write_tokens AS cacheWriteTokens,
                 thinking_tokens AS thinkingTokens,
                 cost
          FROM records
          WHERE session_id = @sessionId ${toolClause} ${deviceClause}
          ORDER BY ts ASC
        `).all(filterParams) as any[]

        // Tool calls for all records in this session
        const rToolClause = toolParam ? 'AND r.tool = @tool' : ''
        const rDeviceClause = deviceParam ? 'AND r.device_instance_id = @device' : ''
        const toolCallRows = db.prepare(`
          SELECT tc.record_id AS recordId, tc.name, tc.ts, tc.call_index AS callIndex
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE r.session_id = @sessionId ${rToolClause} ${rDeviceClause}
          ORDER BY tc.record_id, tc.call_index ASC
        `).all(filterParams) as any[]

        // Group tool calls by record_id
        const toolCallsByRecord: Record<string, any[]> = {}
        for (const tc of toolCallRows) {
          if (!toolCallsByRecord[tc.recordId]) toolCallsByRecord[tc.recordId] = []
          const type = classifyToolCall(tc.name)
          const mcpParsed = type === 'mcp' ? parseMcpName(tc.name) : null
          const displayName = mcpParsed
            ? mcpParsed.display
            : (type === 'skill' && tc.name.startsWith('skill__'))
              ? tc.name.slice('skill__'.length)
              : tc.name
          toolCallsByRecord[tc.recordId].push({
            name: tc.name,
            displayName,
            type,
            ts: tc.ts,
            callIndex: tc.callIndex,
          })
        }

        const toolCallCount = toolCallRows.length

        json(res, {
          session: { ...meta, toolCallCount },
          records: records.map(r => ({
            ...r,
            toolCalls: toolCallsByRecord[r.id] ?? [],
          })),
        })
        return
      }

      // ── /api/sessions ─────────────────────────────────────────────
      if (url.pathname === '/api/sessions') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
        const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)))

        const dr = getDateRangeFilter(range, from, to, 'r', weekStart)
        const device = url.searchParams.get('device')
        const df = getDeviceFilter(device, options?.currentDeviceInstanceId)
        const tool = url.searchParams.get('tool')

        if (device && !df.localOnly && !df.useUnion) {
          json(res, {
            sessions: [],
            total: 0,
            page,
            pageSize,
          })
          return
        }

        const tf = getToolFilter(tool, 'r')
        const params: Record<string, unknown> = { ...dr.params, ...tf.params }

        const totalRow = db.prepare(`
          SELECT COUNT(DISTINCT r.session_id) AS total
          FROM records r
          WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
        `).get(params) as any

        const sessions = db.prepare(`
          SELECT r.session_id AS sessionId,
                 r.tool,
                 r.model,
                 MIN(r.ts) AS ts,
                 MAX(r.ts) - MIN(r.ts) AS duration,
                 SUM(r.input_tokens) AS inputTokens,
                 SUM(r.output_tokens) AS outputTokens,
                 SUM(r.cache_read_tokens) AS cacheReadTokens,
                 SUM(r.cache_write_tokens) AS cacheWriteTokens,
                 SUM(r.cost) AS cost,
                 COUNT(DISTINCT tc.id) AS toolCallCount
          FROM records r
          LEFT JOIN tool_calls tc ON tc.record_id = r.id
          WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
          GROUP BY r.session_id
          ORDER BY MIN(r.ts) DESC
          LIMIT @limit OFFSET @offset
        `).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as any[]

        json(res, {
          sessions,
          total: totalRow.total,
          page,
          pageSize,
        })
        return
      }

      // ── /api/projects ─────────────────────────────────────────────
      if (url.pathname === '/api/projects') {
        const dr = getDateRangeFilter(range, from, to, '', weekStart)
        const device = url.searchParams.get('device')
        const df = getDeviceFilter(device, options?.currentDeviceInstanceId)
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool)

        // Projects are derived from source_file which only exists in local records.
        // synced_records has no source_file column, so other-device project data is unavailable.
        if (df.where && !df.useUnion) {
          json(res, { projects: [] })
          return
        }

        const rows = db.prepare(`
          SELECT source_file, cwd,
                 COUNT(*) AS sessionCount,
                 SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens,
                 SUM(cost) AS cost
          FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
          GROUP BY source_file ORDER BY totalTokens DESC
        `).all({ ...dr.params, ...tf.params }) as any[]

        // Build a cwd inference map for Claude Code paths: encoded project dir → cwd.
        // Records without cwd can inherit it from another session in the same project directory.
        const cwdByEncodedDir: Record<string, string> = {}
        for (const row of rows) {
          if (row.cwd) {
            const m = (row.source_file as string).replace(/\\/g, '/').match(/\.claude\/projects\/([^/]+)/)
            if (m && !cwdByEncodedDir[m[1]]) cwdByEncodedDir[m[1]] = row.cwd
          }
        }

        // Aggregate by project
        const projectMap: Record<string, { sessions: number; tokens: number; cost: number; fullPath: string }> = {}
        for (const row of rows) {
          let effectiveCwd: string = row.cwd || ''
          if (!effectiveCwd) {
            const m = (row.source_file as string).replace(/\\/g, '/').match(/\.claude\/projects\/([^/]+)/)
            if (m) effectiveCwd = cwdByEncodedDir[m[1]] || ''
          }
          const fromCwd = effectiveCwd ? extractProjectFromCwd(effectiveCwd) : null
          const project = (fromCwd && fromCwd !== 'unknown') ? fromCwd : extractProject(row.source_file)
          if (!projectMap[project]) projectMap[project] = { sessions: 0, tokens: 0, cost: 0, fullPath: effectiveCwd || row.source_file }
          projectMap[project].sessions += row.sessionCount
          projectMap[project].tokens += row.totalTokens
          projectMap[project].cost += row.cost
        }

        const totalTokens = Object.values(projectMap).reduce((s, p) => s + p.tokens, 0) || 1
        const projects = Object.entries(projectMap)
          .map(([name, data]) => ({
            name,
            sessions: data.sessions,
            tokens: data.tokens,
            cost: data.cost,
            percentage: Math.round((data.tokens / totalTokens) * 1000) / 10,
            fullPath: data.fullPath,
          }))
          .sort((a, b) => b.tokens - a.tokens)

        json(res, { projects })
        return
      }

      // ── /api/pricing ────────────────────────────────────────────────
      if (url.pathname === '/api/pricing') {
        // GET: list all prices (defaults + overrides + models from DB)
        if (req.method === 'GET') {
          const table = getPriceTable()
          const overrides = getUserOverrides()
          // Also include models from DB that have no pricing
          const dbModels = db.prepare("SELECT DISTINCT model FROM records WHERE model != 'unknown' ORDER BY model").all() as any[]
          const models = dbModels.map(r => {
            const model = r.model
            const exactPrice = table[model]
            const resolvedPrice = resolvePrice(model)
            const isOverride = model in overrides
            const isDefault = model in DEFAULT_PRICE_TABLE && !isOverride
            let matchedBy: string | null = null
            if (!exactPrice && resolvedPrice) {
              // Find which prefix matched
              for (const prefix of Object.keys(table)) {
                if (model.startsWith(prefix) || model.toLowerCase().startsWith(prefix)) {
                  matchedBy = prefix
                  break
                }
              }
              if (!matchedBy) {
                // Provider-stripped match
                const stripped = model.replace(/^[^/]+\//, '').toLowerCase()
                for (const prefix of Object.keys(table)) {
                  if (stripped.startsWith(prefix)) { matchedBy = prefix; break }
                }
              }
            }
            return {
              model,
              price: resolvedPrice ?? null,
              currency: resolvedPrice?.currency ?? 'USD',
              isDefault,
              isOverride,
              matchedBy,
            }
          })
          json(res, { models, overrides })
          return
        }
        // PUT: set price override
        if (req.method === 'PUT') {
          let body = ''
          for await (const chunk of req) body += chunk
          try {
            const data = JSON.parse(body)
            if (!data.model || typeof data.input !== 'number' || typeof data.output !== 'number') {
              json(res, { error: { code: 'INVALID_PARAM', message: 'model, input, output required' } }, 400)
              return
            }
            const entry: PriceEntry = {
              input: data.input,
              output: data.output,
              cacheRead: data.cacheRead,
              cacheWrite: data.cacheWrite,
            }
            if (data.currency === 'CNY') {
              entry.currency = 'CNY'
            }
            setPriceOverride(data.model, entry)
            const cfg = loadConfig() ?? {}
            cfg.priceOverrides = { ...cfg.priceOverrides, [data.model]: entry }
            saveConfig(cfg)
            const recalculated = recalcCosts(db)
            json(res, { ok: true, recalculated })
          } catch {
            json(res, { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400)
          }
          return
        }
        // DELETE: remove price override
        if (req.method === 'DELETE') {
          const model = url.searchParams.get('model')
          if (!model) {
            json(res, { error: { code: 'INVALID_PARAM', message: 'model param required' } }, 400)
            return
          }
          removePriceOverride(model)
          const cfg = loadConfig() ?? {}
          if (cfg.priceOverrides) {
            delete cfg.priceOverrides[model]
            saveConfig(cfg)
          }
          const recalculated = recalcCosts(db)
          json(res, { ok: true, recalculated })
          return
        }
      }

      // ── /api/pricing/recalc ─────────────────────────────────────────
      if (url.pathname === '/api/pricing/recalc' && req.method === 'POST') {
        const updated = recalcCosts(db)
        json(res, { updated })
        return
      }

      // ── /api/sync ──────────────────────────────────────────────────
      if (url.pathname === '/api/sync') {
        if (req.method === 'POST') {
          if (!options?.onSyncStart) {
            json(res, { error: { code: 'NOT_AVAILABLE', message: 'Sync not configured' } }, 501)
            return
          }
          const result = options.onSyncStart()
          json(res, result, result.accepted ? 202 : 200)
          return
        }
        // GET: sync status
        const status = options?.getSyncStatus?.() ?? null
        json(res, { status })
        return
      }

      // ── /api/refresh ────────────────────────────────────────────────
      if (url.pathname === '/api/refresh') {
        if (!options?.onRefresh) {
          json(res, { error: { code: 'NOT_AVAILABLE', message: 'Refresh not available' } }, 501)
          return
        }
        const result = await options.onRefresh()
        json(res, result)
        return
      }

      // ── /api/quotas ───────────────────────────────────────────────
      if (url.pathname === '/api/quotas' && req.method === 'GET') {
        const results = await queryAllQuotas()
        json(res, { quotas: results })
        return
      }

      // ── /api/devices ──────────────────────────────────────────────
      if (url.pathname === '/api/devices') {
        const currentId = options?.currentDeviceInstanceId
        if (!currentId) {
          json(res, { currentDeviceInstanceId: null, devices: [] })
          return
        }

        const config = loadConfig()
        const currentDeviceAlias = config?.device || hostname()

        // Current device: only local records (not merged from synced)
        const localRows = db.prepare(`
          SELECT device, device_instance_id AS deviceInstanceId, COUNT(*) AS recordCount
          FROM records
          WHERE device_instance_id = @currentId AND source_file NOT LIKE 'synced/%'
          GROUP BY device_instance_id
        `).all({ currentId }) as any[]

        // Other devices from synced_records (exclude current device's copy)
        const syncedRows = db.prepare(`
          SELECT device, device_instance_id AS deviceInstanceId, platform, COUNT(*) AS recordCount
          FROM synced_records
          WHERE device_instance_id != @currentId
          GROUP BY device_instance_id
        `).all({ currentId }) as any[]

        function getDisplayName(device: string, deviceInstanceId: string): string {
          if (deviceInstanceId === currentId) return currentDeviceAlias
          if (device && device !== 'unknown' && !/^[0-9a-f]{8}$/.test(device)) return device
          if (/^[0-9a-f]{8}-/.test(deviceInstanceId)) return deviceInstanceId.slice(0, 8)
          if (device && device !== 'unknown') return device
          return 'Unknown Device'
        }

        function getPlatformLabel(p: string | undefined): string {
          if (p === 'win32') return 'Windows'
          if (p === 'darwin') return 'macOS'
          if (p === 'linux') return 'Linux'
          return ''
        }

        // Infer platform from device name when sync record has no platform field
        function inferPlatform(device: string, deviceInstanceId: string): string {
          const name = (device || '').toLowerCase()
          const id = (deviceInstanceId || '').toLowerCase()
          // Windows hostnames: DESKTOP-XXXXX, LAPTOP-XXXXX
          if (/^(desktop|laptop)-/.test(name)) return 'Windows'
          // macOS: .local suffix, "macbook", "imac", "mac-mini"
          if (name.endsWith('.local') || /macbook|imac|mac\s*mini|mac\s*pro|mac\s*studio/.test(name)) return 'macOS'
          // Linux common hostnames
          if (/^(ubuntu|debian|centos|fedora|arch|linux|server|node|prod|dev|staging)/.test(name)) return 'Linux'
          // If displayName is just a UUID prefix (8 hex chars), platform is unknown
          return ''
        }

        // Current platform
        const currentPlatform = config?.platform || platform()

        // Merge and deduplicate
        const deviceMap = new Map<string, { device: string; deviceInstanceId: string; displayName: string; platform: string; recordCount: number }>()
        for (const row of localRows) {
          const displayName = getDisplayName(row.device, row.deviceInstanceId)
          deviceMap.set(row.deviceInstanceId, { device: row.device, deviceInstanceId: row.deviceInstanceId, displayName, platform: getPlatformLabel(currentPlatform), recordCount: row.recordCount })
        }
        for (const row of syncedRows) {
          const displayName = getDisplayName(row.device, row.deviceInstanceId)
          const platformLabel = getPlatformLabel(row.platform) || inferPlatform(row.device, row.deviceInstanceId)
          const existing = deviceMap.get(row.deviceInstanceId)
          if (existing) {
            existing.recordCount += row.recordCount
          } else {
            deviceMap.set(row.deviceInstanceId, { device: row.device, deviceInstanceId: row.deviceInstanceId, displayName, platform: platformLabel, recordCount: row.recordCount })
          }
        }

        const devices = [...deviceMap.values()].sort((a, b) => b.recordCount - a.recordCount)
        json(res, { currentDeviceInstanceId: currentId, devices })
        return
      }

      // ── /api/config/credential ──────────────────────────────────────
      if (url.pathname === '/api/config/credential' && req.method === 'GET') {
        const ref = url.searchParams.get('ref')?.trim()
        if (!ref) {
          json(res, { error: { code: 'MISSING_CREDENTIAL_REF', message: 'credential ref is required' } }, 400)
          return
        }

        const value = loadCredential(ref)
        if (!value) {
          json(res, { error: { code: 'CREDENTIAL_NOT_FOUND', message: 'Credential not found' } }, 404)
          return
        }

        json(res, { value })
        return
      }

      // ── /api/config ───────────────────────────────────────────────
      if (url.pathname === '/api/config') {
        if (req.method === 'GET') {
          const currentCfg = loadConfig() ?? {}
          const osPlatform = platform()
          const { credentials, priceOverrides, platform: _cfgPlatform, ...rest } = currentCfg
          json(res, {
            device: rest.device ?? null,
            weekStart: rest.weekStart ?? 1,
            dashboardPollInterval: rest.dashboardPollInterval ?? null,
            parseInterval: rest.parseInterval ?? null,
            retentionDays: rest.retentionDays ?? null,
            sources: {
              'claude-code': rest.sources?.['claude-code'] ?? null,
              codex: rest.sources?.codex ?? null,
              openclaw: rest.sources?.openclaw ?? null,
              opencode: rest.sources?.opencode ?? null,
              hermes: rest.sources?.hermes ?? null,
              qoder: rest.sources?.qoder ?? null,
              'qoder-db': rest.sources?.['qoder-db'] ?? null,
              cursor: rest.sources?.cursor ?? null,
              'kilocode-db': rest.sources?.['kilocode-db'] ?? null,
            },
            sync: rest.sync ?? null,
            displayCurrency: rest.displayCurrency ?? 'USD',
            exchangeRate: rest.exchangeRate ?? null,
            exchangeRateCache: rest.exchangeRateCache ?? null,
            credentialKeys: credentials ? Object.keys(credentials) : [],
            hostname: hostname(),
            platform: osPlatform,
            defaultPaths: getDefaultSourcePaths(),
          })
          return
        }

        if (req.method === 'PUT') {
          let body = ''
          for await (const chunk of req) body += chunk
          try {
            const update = JSON.parse(body) as Record<string, unknown>
            const existing: Config = loadConfig() ?? {}

            if ('device' in update) {
              if (!update.device) delete existing.device
              else existing.device = String(update.device)
            }
            if ('weekStart' in update) {
              const ws = Number(update.weekStart)
              if (ws === 0 || ws === 1) {
                existing.weekStart = ws as 0 | 1
                weekStart = ws as 0 | 1
              } else {
                delete existing.weekStart
              }
            }
            if ('displayCurrency' in update) {
              const dc = update.displayCurrency
              if (dc === 'USD' || dc === 'CNY') {
                existing.displayCurrency = dc
              } else {
                delete existing.displayCurrency
              }
            }
            if ('exchangeRate' in update) {
              const er = update.exchangeRate
              if (er != null && typeof er === 'number' && er > 0) {
                existing.exchangeRate = er
              } else {
                delete existing.exchangeRate
              }
            }

            if ('dashboardPollInterval' in update) {
              if (!update.dashboardPollInterval) delete existing.dashboardPollInterval
              else existing.dashboardPollInterval = Number(update.dashboardPollInterval)
            }
            if ('parseInterval' in update) {
              if (!update.parseInterval) delete existing.parseInterval
              else existing.parseInterval = Number(update.parseInterval)
            }
            if ('retentionDays' in update) {
              if (!update.retentionDays) delete existing.retentionDays
              else existing.retentionDays = Number(update.retentionDays)
            }

            if (update.sources && typeof update.sources === 'object') {
              const src = update.sources as Record<string, unknown>
              const s: SourcesConfig = existing.sources ?? {}
              for (const key of ['claude-code', 'codex', 'openclaw', 'opencode', 'hermes', 'qoder', 'qoder-db', 'cursor', 'kilocode-db'] as const) {
                if (key in src) {
                  if (!src[key]) delete s[key]
                  else s[key] = String(src[key])
                }
              }
              if (Object.keys(s).length) existing.sources = s
              else delete existing.sources
            }

            if ('sync' in update) {
              const syncUpdate = update.sync as Record<string, unknown> | null
              if (!syncUpdate?.backend) {
                delete existing.sync
              } else {
                const backendVal = String(syncUpdate.backend)
                if (backendVal !== 'github' && backendVal !== 's3') {
                  json(res, { error: { code: 'INVALID_BACKEND', message: 'sync.backend must be github or s3' } }, 400)
                  return
                }
                const newSync: SyncConfig = { backend: backendVal as 'github' | 's3' }
                for (const f of ['repo', 'bucket', 'prefix', 'endpoint', 'region', 'credentialRef'] as const) {
                  if (syncUpdate[f]) (newSync as any)[f] = String(syncUpdate[f])
                }
                existing.sync = newSync
              }
            }

            if (update.credentials && typeof update.credentials === 'object') {
              const creds = update.credentials as Record<string, unknown>
              const c: Record<string, string> = existing.credentials ?? {}
              for (const [key, val] of Object.entries(creds)) {
                if (val !== '' && val !== null && val !== undefined) {
                  c[key] = String(val)
                }
              }
              if (Object.keys(c).length) existing.credentials = c
              else delete existing.credentials
            }

            saveConfig(existing)
            options?.onConfigUpdated?.()
            json(res, { ok: true })
          } catch {
            json(res, { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400)
          }
          return
        }
      }

      // ── /api/exchange-rate/refresh ────────────────────────────────
      if (url.pathname === '/api/exchange-rate/refresh' && req.method === 'POST') {
        const rate = await fetchExchangeRate()
        if (rate == null) {
          json(res, { error: { code: 'FETCH_FAILED', message: 'Failed to fetch exchange rate' } }, 502)
          return
        }
        const cfg = loadConfig() ?? {}
        cfg.exchangeRateCache = { CNY_USD: rate, fetchedAt: Date.now() }
        saveConfig(cfg)
        json(res, { rate, fetchedAt: cfg.exchangeRateCache.fetchedAt })
        return
      }

      // ── 404 ───────────────────────────────────────────────────────
      json(res, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }, 404)
    } catch (error) {
      console.error('API error:', error)
      json(res, { error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
    }
  })

  return server
}
