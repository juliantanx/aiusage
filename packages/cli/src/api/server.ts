import http from 'node:http'
import type Database from 'better-sqlite3'

function getDateRangeFilter(range: string | null, from: string | null, to: string | null, prefix = ''): { where: string; params: Record<string, unknown> } {
  const ts = prefix ? `${prefix}.ts` : 'ts'

  if (from && to) {
    return { where: `AND ${ts} >= @start AND ${ts} < @end`, params: { start: from, end: to + 'T23:59:59.999Z' } }
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (range === 'week') {
    const dayOfWeek = today.getDay()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - dayOfWeek)
    return { where: `AND ${ts} >= @start`, params: { start: startOfWeek.toISOString() } }
  }
  if (range === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return { where: `AND ${ts} >= @start`, params: { start: startOfMonth.toISOString() } }
  }
  if (range === 'last30') {
    const start = new Date(today)
    start.setDate(start.getDate() - 30)
    return { where: `AND ${ts} >= @start`, params: { start: start.toISOString() } }
  }
  if (range === 'all') {
    return { where: '', params: {} }
  }
  // default: day
  return { where: `AND ${ts} >= @start`, params: { start: today.toISOString() } }
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function createApiServer(db: Database.Database): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const range = url.searchParams.get('range')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    try {
      // ── /api/summary ──────────────────────────────────────────────
      if (url.pathname === '/api/summary') {
        if (range && !['day', 'week', 'month', 'last30', 'all'].includes(range)) {
          json(res, { error: { code: 'INVALID_PARAM', message: 'Invalid range' } }, 400)
          return
        }
        const dr = getDateRangeFilter(range, from, to)

        const totals = db.prepare(`
          SELECT
            COALESCE(SUM(input_tokens + output_tokens + thinking_tokens), 0) AS totalTokens,
            COALESCE(SUM(cost), 0) AS totalCost,
            COUNT(DISTINCT substr(ts, 1, 10)) AS activeDays
          FROM records WHERE 1=1 ${dr.where}
        `).get(dr.params) as any

        const byToolRows = db.prepare(`
          SELECT tool,
                 SUM(input_tokens + output_tokens + thinking_tokens) AS tokens,
                 SUM(cost) AS cost
          FROM records WHERE 1=1 ${dr.where}
          GROUP BY tool ORDER BY cost DESC
        `).all(dr.params) as any[]

        const byTool: Record<string, { tokens: number; cost: number }> = {}
        for (const row of byToolRows) {
          byTool[row.tool] = { tokens: row.tokens, cost: row.cost }
        }

        const drJoin = getDateRangeFilter(range, from, to, 'r')
        const topToolCalls = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${drJoin.where}
          GROUP BY tc.name ORDER BY count DESC LIMIT 10
        `).all(drJoin.params) as any[]

        json(res, {
          totalTokens: totals.totalTokens,
          totalCost: totals.totalCost,
          activeDays: totals.activeDays,
          byTool,
          topToolCalls,
        })
        return
      }

      // ── /api/tokens ───────────────────────────────────────────────
      if (url.pathname === '/api/tokens') {
        const dr = getDateRangeFilter(range, from, to)

        const rows = db.prepare(`
          SELECT substr(ts, 1, 10) AS date,
                 SUM(input_tokens) AS inputTokens,
                 SUM(output_tokens) AS outputTokens,
                 SUM(thinking_tokens) AS thinkingTokens
          FROM records WHERE 1=1 ${dr.where}
          GROUP BY date ORDER BY date
        `).all(dr.params) as any[]

        json(res, { data: rows })
        return
      }

      // ── /api/cost ─────────────────────────────────────────────────
      if (url.pathname === '/api/cost') {
        const dr = getDateRangeFilter(range, from, to)

        const daily = db.prepare(`
          SELECT substr(ts, 1, 10) AS date,
                 SUM(cost) AS cost
          FROM records WHERE 1=1 ${dr.where}
          GROUP BY date ORDER BY date
        `).all(dr.params) as any[]

        const byToolRows = db.prepare(`
          SELECT tool, SUM(cost) AS cost
          FROM records WHERE 1=1 ${dr.where}
          GROUP BY tool ORDER BY cost DESC
        `).all(dr.params) as any[]
        const byTool: Record<string, number> = {}
        for (const r of byToolRows) byTool[r.tool] = r.cost

        const byModelRows = db.prepare(`
          SELECT model, SUM(cost) AS cost
          FROM records WHERE 1=1 ${dr.where}
          GROUP BY model ORDER BY cost DESC
        `).all(dr.params) as any[]
        const byModel: Record<string, number> = {}
        for (const r of byModelRows) byModel[r.model] = r.cost

        json(res, { data: daily, byTool, byModel })
        return
      }

      // ── /api/models ───────────────────────────────────────────────
      if (url.pathname === '/api/models') {
        const dr = getDateRangeFilter(range, from, to)

        const totalRow = db.prepare(`
          SELECT COUNT(*) AS total FROM records WHERE 1=1 ${dr.where}
        `).get(dr.params) as any
        const total = totalRow.total || 1

        const rows = db.prepare(`
          SELECT model, provider,
                 COUNT(*) AS callCount,
                 SUM(input_tokens + output_tokens + thinking_tokens) AS totalTokens
          FROM records WHERE 1=1 ${dr.where}
          GROUP BY model, provider ORDER BY callCount DESC
        `).all(dr.params) as any[]

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
        const dr = getDateRangeFilter(range, from, to, 'r')

        const totalRow = db.prepare(`
          SELECT COUNT(*) AS total FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dr.where}
        `).get(dr.params) as any
        const total = totalRow.total || 1

        const rows = db.prepare(`
          SELECT tc.name, COUNT(*) AS count
          FROM tool_calls tc
          JOIN records r ON r.id = tc.record_id
          WHERE 1=1 ${dr.where}
          GROUP BY tc.name ORDER BY count DESC
        `).all(dr.params) as any[]

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
        const dr = getDateRangeFilter(range, from, to)
        const tool = url.searchParams.get('tool')
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
        const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)))

        let toolFilter = ''
        const params: Record<string, unknown> = { ...dr.params }
        if (tool) {
          toolFilter = 'AND tool = @tool'
          params.tool = tool
        }

        const totalRow = db.prepare(`
          SELECT COUNT(DISTINCT session_id) AS total
          FROM records WHERE 1=1 ${dr.where} ${toolFilter}
        `).get(params) as any

        const sessions = db.prepare(`
          SELECT session_id AS sessionId,
                 tool,
                 model,
                 MIN(ts) AS ts,
                 SUM(input_tokens) AS inputTokens,
                 SUM(output_tokens) AS outputTokens,
                 SUM(cost) AS cost
          FROM records
          WHERE 1=1 ${dr.where} ${toolFilter}
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

      // ── 404 ───────────────────────────────────────────────────────
      json(res, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }, 404)
    } catch (error) {
      console.error('API error:', error)
      json(res, { error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
    }
  })

  return server
}
