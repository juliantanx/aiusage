import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiServer } from '../api/server.js'
import { runParse } from './parse.js'
import { runSync } from './sync.js'
import { getState } from '../init.js'
import { AIUSAGE_DIR, loadConfig } from '../config.js'
import { SyncRuntimeController } from '../sync/runtime.js'
import { setPriceOverride } from '@aiusage/core'
import type Database from 'better-sqlite3'

export interface ServeOptions {
  port: number
  db: Database.Database
}

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

  const syncRuntime = new SyncRuntimeController({
    runSync: (runtimeOptions) => runSync(options.db, runtimeOptions).then(() => undefined),
    getPersistedState: () => getState(AIUSAGE_DIR),
  })

  const apiServer = createApiServer(options.db, {
    currentDeviceInstanceId: getState(AIUSAGE_DIR)?.deviceInstanceId,
    onRefresh: () => runParse(options.db),
    onSyncStart: () => syncRuntime.start(),
    getSyncStatus: () => syncRuntime.getStatus(),
  })
  const webBuildDir = join(dirname(fileURLToPath(import.meta.url)), 'web')

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

  server.listen(options.port, '0.0.0.0', () => {
    console.log(`aiusage serve listening on http://localhost:${options.port}`)
  })

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    server.close(() => {
      process.exit(0)
    })
  })

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0)
    })
  })
}
