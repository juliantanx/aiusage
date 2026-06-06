import http from 'node:http'
import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiServer } from '../api/server.js'
import { runParse } from './parse.js'
import { runSync } from './sync.js'
import { cleanOldData } from './clean.js'
import { uploadLeaderboardData } from './leaderboard-upload.js'
import { getState } from '../init.js'
import { AIUSAGE_DIR, loadConfig, saveConfig } from '../config.js'
import { SyncRuntimeController } from '../sync/runtime.js'
import { RuntimeSettingsController } from '../runtime/settings-controller.js'
import { setPriceOverride, fetchExchangeRate, CACHE_TTL_MS } from '@aiusage/core'
import type Database from 'better-sqlite3'

export interface ServeOptions {
  port: number
  db: Database.Database
}

const MAX_PORT_ATTEMPTS = 10
const PORT_FILE = join(AIUSAGE_DIR, '.serve-port')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export function serve(options: ServeOptions): void {
  // Restore persisted price overrides
  const config = loadConfig()
  if (config?.priceOverrides) {
    for (const [model, entry] of Object.entries(config.priceOverrides)) {
      setPriceOverride(model, entry)
    }
  }

  // Initialize exchange rate: fetch if cache missing or expired (non-blocking)
  if (config == null || config.exchangeRate == null) {
    const cacheAge = config?.exchangeRateCache
      ? Date.now() - config.exchangeRateCache.fetchedAt
      : Infinity
    if (cacheAge >= CACHE_TTL_MS) {
      fetchExchangeRate().then(rate => {
        if (rate != null) {
          const cfg = loadConfig() ?? {}
          cfg.exchangeRateCache = { CNY_USD: rate, fetchedAt: Date.now() }
          saveConfig(cfg)
        }
      }).catch(() => {
        // Silently ignore — FALLBACK_RATE will be used
      })
    }
  }

  const syncRuntime = new SyncRuntimeController({
    runSync: (runtimeOptions) => runSync(options.db, runtimeOptions).then(() => undefined),
    getPersistedState: () => getState(AIUSAGE_DIR),
  })

  const runtimeSettings = new RuntimeSettingsController({
    db: options.db,
    loadConfig,
    runParse,
    runCleanup: cleanOldData,
    runLeaderboardUpload: (db) => uploadLeaderboardData(db, getState(AIUSAGE_DIR)?.deviceInstanceId).then(() => undefined),
    runSync: () => syncRuntime.start(),
  })
  runtimeSettings.start()

  // Parse logs once on startup so the dashboard has data immediately
  runParse(options.db).catch((err) => {
    console.error('[serve] initial parse failed:', err)
  })

  const apiServer = createApiServer(options.db, {
    currentDeviceInstanceId: getState(AIUSAGE_DIR)?.deviceInstanceId,
    onRefresh: () => runParse(options.db),
    onSyncStart: () => syncRuntime.start(),
    getSyncStatus: () => syncRuntime.getStatus(),
    onConfigUpdated: () => runtimeSettings.reload(),
  })
  const webBuildDir = (() => {
    const prodDir = join(dirname(fileURLToPath(import.meta.url)), 'web')
    if (existsSync(prodDir)) return prodDir
    // dev mode (tsx): fall back to packages/web/build
    return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'build')
  })()

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    // API routes go to API server
    if (url.pathname.startsWith('/api/')) {
      apiServer.emit('request', req, res)
      return
    }

    // Try to serve static files from web build
    if (existsSync(webBuildDir)) {
      let filePath = join(webBuildDir, url.pathname)

      // If path is a directory, try index.html
      try {
        if (statSync(filePath).isDirectory()) {
          filePath = join(filePath, 'index.html')
        }
      } catch {}

      // If file doesn't exist, fall back to index.html (SPA routing)
      if (!existsSync(filePath)) {
        filePath = join(webBuildDir, 'index.html')
      }

      try {
        const content = readFileSync(filePath)
        const ext = extname(filePath)
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
        return
      } catch {}
    }

    // No web build available
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Web dashboard not found. Reinstall the package: npm install -g aiusage' } }))
  })

  let currentPort = options.port
  let started = false

  const listenOnPort = (port: number): void => {
    currentPort = port
    server.listen(port, '0.0.0.0')
  }

  server.on('listening', () => {
    started = true
    writeFileSync(PORT_FILE, String(currentPort), 'utf-8')
    console.log(`aiusage serve listening on http://localhost:${currentPort}`)
  })

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE' && !started && currentPort < options.port + MAX_PORT_ATTEMPTS - 1) {
      const nextPort = currentPort + 1
      console.warn(`Port ${currentPort} is already in use, trying ${nextPort}...`)
      server.close(() => {
        listenOnPort(nextPort)
      })
      return
    }

    runtimeSettings.stop()
    throw error
  })

  listenOnPort(options.port)

  // Graceful shutdown
  const cleanup = () => {
    try { unlinkSync(PORT_FILE) } catch {}
  }

  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    cleanup()
    runtimeSettings.stop()
    server.close(() => {
      process.exit(0)
    })
  })

  process.on('SIGTERM', () => {
    cleanup()
    runtimeSettings.stop()
    server.close(() => {
      process.exit(0)
    })
  })
}
