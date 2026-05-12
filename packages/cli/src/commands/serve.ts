import http from 'node:http'
import { createApiServer } from '../api/server.js'
import type Database from 'better-sqlite3'

export interface ServeOptions {
  port: number
  db: Database.Database
}

export function serve(options: ServeOptions): void {
  const server = createApiServer(options.db)

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
