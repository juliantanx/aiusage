import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiServer } from '../api/server.js'
import { runParse } from './parse.js'
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

function findMonorepoRoot(): string {
  // Try relative to this source file (dev mode)
  const here = dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = dirname(dir)
  }
  // Fallback to cwd
  return process.cwd()
}

export function serve(options: ServeOptions): void {
  const apiServer = createApiServer(options.db, {
    onRefresh: () => runParse(options.db),
  })
  const webBuildDir = join(findMonorepoRoot(), 'packages', 'web', 'build')

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
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Web dashboard not built. Run "pnpm --filter @aiusage/web build" first.' } }))
  })

  server.listen(options.port, '127.0.0.1', () => {
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
