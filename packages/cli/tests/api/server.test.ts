import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import { createApiServer } from '../../src/api/server.js'
import Database from 'better-sqlite3'
import { initializeDatabase } from '../../src/db/index.js'

describe('API Server', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  it('returns summary data', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data).toHaveProperty('totalTokens')
    expect(data).toHaveProperty('totalCost')
  })

  it('returns 400 for invalid range', async () => {
    const response = await fetch(`${baseUrl}/api/summary?range=invalid`)
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error.code).toBe('INVALID_PARAM')
  })

  it('returns empty data array when no records exist', async () => {
    const response = await fetch(`${baseUrl}/api/tokens?range=day`)
    expect(response.ok).toBe(true)
    const data = await response.json()
    expect(data.data).toEqual([])
  })
})
