import http from 'node:http'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createApiServer } from '../src/api/server.js'
import { createDatabase } from '../src/db/index.js'

const DEFAULT_DB = join(tmpdir(), 'aiusage-demo', 'cache.db')
const CURRENT_DEVICE_ID = 'demo-mbp-14-local'

function parseArgs() {
  const args = process.argv.slice(2)
  let dbPath = DEFAULT_DB
  let port = 3847

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--db') dbPath = args[++i] ?? dbPath
    else if (arg === '--port') port = Number(args[++i] ?? port)
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: tsx packages/cli/scripts/serve-demo-api.ts [--db path] [--port 3847]')
      process.exit(0)
    }
  }

  return { dbPath: resolve(dbPath), port }
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function demoConfig() {
  return {
    device: 'demo-mbp-14',
    weekStart: 1,
    refreshInterval: 60000,
    retentionDays: 180,
    leaderboardAutoUpload: true,
    leaderboardUploadInterval: 86400000,
    sync: { backend: 'cloud' },
    syncInterval: 900000,
    loggedIn: true,
    displayCurrency: 'USD',
    exchangeRate: null,
    exchangeRateCache: { CNY_USD: 0.137, fetchedAt: Date.now() },
    siteUrl: 'https://aiusage.jtanx.com',
    credentialKeys: ['demo-cloud'],
    hostname: 'demo-mbp-14',
    platform: 'darwin',
  }
}

function demoQuotas() {
  const now = Date.now()
  return {
    quotas: [
      {
        tool: 'claude-code',
        success: true,
        queriedAt: now - 42_000,
        credentialStatus: 'ok',
        tiers: [
          { name: 'five_hour', used: 147_000, limit: 200_000, utilization: 73.5, resetsAt: now + 74 * 60 * 1000 },
          { name: 'seven_day_sonnet', used: 1_780_000, limit: 2_500_000, utilization: 71.2, resetsAt: now + 2.8 * 24 * 60 * 60 * 1000 },
          { name: 'seven_day_opus', used: 620_000, limit: 800_000, utilization: 77.5, resetsAt: now + 2.8 * 24 * 60 * 60 * 1000 },
        ],
      },
      {
        tool: 'codex',
        success: true,
        queriedAt: now - 38_000,
        credentialStatus: 'ok',
        tiers: [
          { name: 'weekly_limit', used: 42_100, limit: 60_000, utilization: 70.2, resetsAt: now + 4.2 * 24 * 60 * 60 * 1000 },
        ],
      },
    ],
  }
}

function demoSyncStatus() {
  const now = Date.now()
  return {
    state: 'idle',
    target: 'cloud',
    lastSyncAt: now - 13 * 60 * 1000,
    nextSyncAt: now + 2 * 60 * 1000,
    lastResult: {
      phase: 'complete',
      pulled: 186,
      uploaded: 244,
      merged: 42,
      startedAt: now - 15 * 60 * 1000,
      finishedAt: now - 13 * 60 * 1000,
    },
  }
}

const options = parseArgs()
if (!existsSync(options.dbPath)) {
  console.error(`Demo database not found: ${options.dbPath}`)
  console.error('Run: pnpm demo:db')
  process.exit(1)
}

const db = createDatabase(options.dbPath)
const apiServer = createApiServer(db, {
  currentDeviceInstanceId: CURRENT_DEVICE_ID,
  onRefresh: async () => ({ parsedCount: 0, toolCallCount: 0, errors: [] }),
  onSyncStart: () => ({ accepted: true, status: demoSyncStatus() as any }),
  getSyncStatus: () => demoSyncStatus() as any,
})

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (url.pathname === '/api/config' && req.method === 'GET') {
    json(res, demoConfig())
    return
  }

  if (url.pathname === '/api/config' && req.method === 'PUT') {
    json(res, { ok: true, config: demoConfig() })
    return
  }

  if (url.pathname === '/api/quotas' && req.method === 'GET') {
    json(res, demoQuotas())
    return
  }

  if (url.pathname === '/api/cli/sync/status' && req.method === 'GET') {
    json(res, { enabled: true, authenticated: true, status: demoSyncStatus() })
    return
  }

  if (url.pathname === '/api/sync' && req.method === 'GET') {
    json(res, { status: demoSyncStatus() })
    return
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    json(res, { accepted: true, status: demoSyncStatus() }, 202)
    return
  }

  if (url.pathname === '/api/leaderboard/auth/status' && req.method === 'GET') {
    json(res, {
      loggedIn: true,
      deviceId: CURRENT_DEVICE_ID,
      deviceName: 'demo-mbp-14',
      user: { username: 'aiusage-demo', display_name: 'AIUsage Demo' },
      obtainedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      siteUrl: 'https://aiusage.jtanx.com',
      uploads: [
        { period_type: 'daily', total_tokens: 8_420_000, status: 'accepted', created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString() },
      ],
    })
    return
  }

  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    json(res, {
      entries: [
        { rank: 1, display_name: 'AIUsage Demo', total_tokens: 8_420_000, total_cost_usd: 18.72, updated_at: new Date().toISOString() },
        { rank: 2, display_name: 'team-alpha', total_tokens: 7_910_000, total_cost_usd: 16.44, updated_at: new Date().toISOString() },
        { rank: 3, display_name: 'solo-dev', total_tokens: 6_380_000, total_cost_usd: 12.09, updated_at: new Date().toISOString() },
      ],
      next_cursor: null,
      current_user: { rank: 1 },
      period_type: url.searchParams.get('period_type') ?? 'daily',
      period_start: new Date().toISOString().slice(0, 10),
      source_status: 'demo',
    })
    return
  }

  apiServer.emit('request', req, res)
})

server.listen(options.port, '127.0.0.1', () => {
  console.log(`aiusage demo api listening on http://localhost:${options.port}`)
  console.log(`db: ${options.dbPath}`)
})

const shutdown = () => {
  server.close(() => {
    apiServer.close()
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
