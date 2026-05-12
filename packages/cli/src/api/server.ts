import http from 'node:http'
import type Database from 'better-sqlite3'

export function createApiServer(db: Database.Database): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    try {
      if (url.pathname === '/api/summary') {
        const range = url.searchParams.get('range')
        if (range && !['day', 'week', 'month'].includes(range)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'INVALID_PARAM', message: 'Invalid range' } }))
          return
        }

        const totalTokens = (db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total FROM records').get() as any).total
        const totalCost = (db.prepare('SELECT COALESCE(SUM(cost), 0) as total FROM records').get() as any).total

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ totalTokens, totalCost, activeDays: 0, byTool: {}, topToolCalls: [] }))
        return
      }

      if (url.pathname === '/api/tokens') {
        const records = db.prepare('SELECT COUNT(*) as count FROM records').get() as any
        if (records.count === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'NO_DATA', message: 'No data available' } }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [] }))
        return
      }

      // 404 for unknown endpoints
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Internal server error' } }))
    }
  })

  return server
}
