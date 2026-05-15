import http from 'node:http'
import { hostname, platform } from 'node:os'
import type Database from 'better-sqlite3'
import { getPriceTable, setPriceOverride, removePriceOverride, getUserOverrides, DEFAULT_PRICE_TABLE, resolvePrice } from '@aiusage/core'
import { loadConfig } from '../config.js'
import type { SyncStartResult, SyncStatusSnapshot } from '../sync/runtime.js'

function getDateRangeFilter(range: string | null, from: string | null, to: string | null, prefix = ''): { where: string; params: Record<string, unknown> } {
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
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - dayOfWeek)
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

function extractProject(sourceFile: string): string {
  // Path: ~/.claude/projects/-Users-tjh-WebstormProjects-ai-bidding-assistant/uuid.jsonl
  const match = sourceFile.match(/\.claude\/projects\/([^/]+)/)
  if (!match) return 'unknown'
  const raw = match[1]
  // Convert path-encoded name: take last meaningful segment
  // e.g. "-Users-tjh-WebstormProjects-ai-bidding-assistant" → "ai-bidding-assistant"
  const parts = raw.split('-').filter(Boolean)
  // Find the segment after "WebstormProjects" or "Documents"
  const wpIdx = parts.indexOf('WebstormProjects')
  if (wpIdx >= 0 && wpIdx < parts.length - 1) return parts.slice(wpIdx + 1).join('-')
  const docIdx = parts.indexOf('Documents')
  if (docIdx >= 0 && docIdx < parts.length - 1) return parts.slice(docIdx + 1).join('-')
  // Fallback: if path is just user home dir, label as "~"
  if (parts.length <= 3) return '~'
  return parts.slice(-2).join('-') || raw
}

export interface ApiServerOptions {
  currentDeviceInstanceId?: string
  onRefresh?: () => Promise<{ parsedCount: number; toolCallCount: number; errors: string[] }>
  onSyncStart?: () => SyncStartResult
  getSyncStatus?: () => SyncStatusSnapshot | null
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
    const VALID_TOOLS = ['claude-code', 'codex', 'openclaw', 'opencode']
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
        const dr = getDateRangeFilter(range, from, to)
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

        const drJoin = getDateRangeFilter(range, from, to, 'r')
        const dfJoin = df.where ? df.where.replace(/device_instance_id/g, 'r.device_instance_id') : ''
        const tfJoin = getToolFilter(tool, 'r')
        const topToolCalls = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dfJoin} ${drJoin.where} ${tfJoin.where}
          GROUP BY tc.name ORDER BY count DESC LIMIT 10
        `).all({ ...drJoin.params, ...df.params, ...tfJoin.params }) as any[]

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
        })
        return
      }

      // ── /api/tokens ───────────────────────────────────────────────
      if (url.pathname === '/api/tokens') {
        const dr = getDateRangeFilter(range, from, to)
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
        const dr = getDateRangeFilter(range, from, to)
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
        const dr = getDateRangeFilter(range, from, to)
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
            GROUP BY model, provider ORDER BY callCount DESC
          `).all({ ...dr.params, ...df.params, ...tf.params }) as any[]
          total = mergedRows.reduce((s, r) => s + r.callCount, 0) || 1
          rows = mergedRows
        } else if (device && device !== options?.currentDeviceInstanceId) {
          rows = db.prepare(`
            SELECT model, provider,
                   COUNT(*) AS callCount,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens
            FROM synced_records WHERE 1=1 ${df.where} ${dr.where} ${tf.where}
            GROUP BY model, provider ORDER BY callCount DESC
          `).all({ ...df.params, ...dr.params, ...tf.params }) as any[]
          total = rows.reduce((s, r) => s + r.callCount, 0) || 1
        } else {
          rows = db.prepare(`
            SELECT model, provider,
                   COUNT(*) AS callCount,
                   SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens
            FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
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

        const dr = getDateRangeFilter(range, from, to, 'r')
        const tool = url.searchParams.get('tool')
        const tf = getToolFilter(tool, 'r')

        const totalRow = db.prepare(`
          SELECT COUNT(*) AS total FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dr.where} ${tf.where}
        `).get({ ...dr.params, ...tf.params }) as any
        const total = totalRow.total || 1

        const rows = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dr.where} ${tf.where}
          GROUP BY tc.name ORDER BY count DESC
        `).all({ ...dr.params, ...tf.params }) as any[]

        const toolCalls = rows.map(r => ({
          name: r.name,
          count: r.count,
          percentage: Math.round((r.count / total) * 1000) / 10,
        }))

        json(res, { toolCalls })
        return
      }

      // ── /api/sessions ─────────────────────────────────────────────
      if (url.pathname === '/api/sessions') {
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
        const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)))

        const dr = getDateRangeFilter(range, from, to)
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

        const tf = getToolFilter(tool)
        const params: Record<string, unknown> = { ...dr.params, ...tf.params }

        const totalRow = db.prepare(`
          SELECT COUNT(DISTINCT session_id) AS total
          FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
        `).get(params) as any

        const sessions = db.prepare(`
          SELECT session_id AS sessionId,
                 tool,
                 model,
                 MIN(ts) AS ts,
                 SUM(input_tokens) AS inputTokens,
                 SUM(output_tokens) AS outputTokens,
                 SUM(cache_read_tokens) AS cacheReadTokens,
                 SUM(cache_write_tokens) AS cacheWriteTokens,
                 SUM(cost) AS cost
          FROM records
          WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
          GROUP BY session_id
          ORDER BY ts DESC
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
        const dr = getDateRangeFilter(range, from, to)
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
          SELECT source_file,
                 COUNT(*) AS sessionCount,
                 SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens) AS totalTokens,
                 SUM(cost) AS cost
          FROM records WHERE 1=1 ${dr.where} ${df.localOnly ? LOCAL_ONLY_FILTER : ''} ${tf.where}
          GROUP BY source_file ORDER BY totalTokens DESC
        `).all({ ...dr.params, ...tf.params }) as any[]

        // Aggregate by project
        const projectMap: Record<string, { sessions: number; tokens: number; cost: number }> = {}
        for (const row of rows) {
          const project = extractProject(row.source_file)
          if (!projectMap[project]) projectMap[project] = { sessions: 0, tokens: 0, cost: 0 }
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
          const dbModels = db.prepare('SELECT DISTINCT model FROM records ORDER BY model').all() as any[]
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
            setPriceOverride(data.model, {
              input: data.input,
              output: data.output,
              cacheRead: data.cacheRead,
              cacheWrite: data.cacheWrite,
              thinking: data.thinking,
            })
            json(res, { ok: true })
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
          json(res, { ok: true })
          return
        }
      }

      // ── /api/pricing/recalc ─────────────────────────────────────────
      if (url.pathname === '/api/pricing/recalc' && req.method === 'POST') {
        const { resolvePrice } = await import('@aiusage/core')
        const BATCH_SIZE = 1000
        let updated = 0
        let lastId = ''
        while (true) {
          const records = db.prepare(
            'SELECT id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens FROM records WHERE id > ? ORDER BY id LIMIT ?'
          ).all(lastId, BATCH_SIZE) as any[]
          if (records.length === 0) break
          const updateStmt = db.prepare('UPDATE records SET cost = ?, cost_source = ? WHERE id = ?')
          const tx = db.transaction((batch: any[]) => {
            for (const r of batch) {
              const price = resolvePrice(r.model)
              if (!price) continue
              const cost =
                (r.input_tokens / 1e6) * price.input +
                (r.output_tokens / 1e6) * price.output +
                (r.cache_read_tokens / 1e6) * (price.cacheRead ?? 0) +
                (r.cache_write_tokens / 1e6) * (price.cacheWrite ?? 0) +
                (r.thinking_tokens / 1e6) * (price.thinking ?? price.output)
              updateStmt.run(cost, 'pricing', r.id)
              updated++
            }
          })
          tx(records)
          lastId = records[records.length - 1].id
        }
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

      // ── 404 ───────────────────────────────────────────────────────
      json(res, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }, 404)
    } catch (error) {
      console.error('API error:', error)
      json(res, { error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
    }
  })

  return server
}
