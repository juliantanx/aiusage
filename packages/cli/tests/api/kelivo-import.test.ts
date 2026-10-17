import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import Database from 'better-sqlite3'
import { createApiServer } from '../../src/api/server.js'
import { initializeDatabase } from '../../src/db/index.js'
import { createKelivoDatabase } from '../helpers/kelivo-fixture.js'

describe('POST /api/import/kelivo', () => {
  let db: Database.Database
  let server: http.Server
  let baseUrl: string

  function createKelivoForm() {
    const form = new FormData()
    form.append('file', new Blob([JSON.stringify({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          timestamp: '2026-06-05T10:01:00.000Z',
          modelId: 'gpt-4o',
          providerId: 'openai',
          promptTokens: 100,
          completionTokens: 25,
          cachedTokens: 10,
          conversationId: 'conversation-1',
        },
      ],
    })], { type: 'application/json' }), 'chats.json')
    return form
  }

  beforeEach(async () => {
    db = new Database(':memory:')
    initializeDatabase(db)
    server = createApiServer(db, { currentDeviceInstanceId: 'device-1' })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number }
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    if (server?.listening) {
      server.closeIdleConnections?.()
      server.closeAllConnections?.()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    db.close()
  })

  it('imports Kelivo chats.json uploaded from the browser', async () => {
    const form = createKelivoForm()

    const res = await fetch(`${baseUrl}/api/import/kelivo`, { method: 'POST', body: form })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ imported: 1, added: 1, errors: [] })
    expect(typeof data.lastImportedAt).toBe('number')
    const row = db.prepare('SELECT tool, model, input_tokens, output_tokens, cache_read_tokens, session_id, device_instance_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'kelivo',
      model: 'gpt-4o',
      input_tokens: 90,
      output_tokens: 25,
      cache_read_tokens: 10,
      session_id: 'conversation-1',
      device_instance_id: 'device-1',
    })
  })

  it('reports incremental imports without rewriting unchanged rows', async () => {
    const firstRes = await fetch(`${baseUrl}/api/import/kelivo`, { method: 'POST', body: createKelivoForm() })
    const firstData = await firstRes.json()
    const secondRes = await fetch(`${baseUrl}/api/import/kelivo`, { method: 'POST', body: createKelivoForm() })
    const secondData = await secondRes.json()

    expect(firstData).toMatchObject({ imported: 1, added: 1 })
    expect(secondData).toMatchObject({ imported: 1, added: 0 })
    expect(typeof secondData.lastImportedAt).toBe('number')
    expect(secondData.lastImportedAt).toBeGreaterThanOrEqual(firstData.lastImportedAt)

    // The row was already identical, so it was left alone: `lastImportedAt`
    // reports when this tool's records were last written, not when a repeated
    // import of the same file ran.
    const row = db.prepare("SELECT ingested_at, updated_at FROM records WHERE tool = 'kelivo'").get() as any
    expect(row).toMatchObject({
      ingested_at: firstData.lastImportedAt,
      updated_at: firstData.lastImportedAt,
    })
    const toolsRes = await fetch(`${baseUrl}/api/detected-tools`)
    const toolsData = await toolsRes.json()
    const kelivo = toolsData.tools.find((tool: any) => tool.sourceKey === 'kelivo')

    expect(kelivo).toMatchObject({ sourceKey: 'kelivo', lastImportedAt: firstData.lastImportedAt })
  })

  it('returns the last Kelivo import time with detected tools', async () => {
    const importedAt = 1770000000000
    db.prepare(`
      INSERT INTO records (
        id, ts, ingested_at, synced_at, updated_at, line_offset,
        tool, model, provider, input_tokens, output_tokens, cache_read_tokens,
        cache_write_tokens, thinking_tokens, cost, cost_source, session_id,
        source_file, device, device_instance_id
      ) VALUES (
        'kelivo-last-import', 1769999999000, @importedAt, NULL, @importedAt, 0,
        'kelivo', 'gpt-4o', 'openai', 100, 25, 0,
        0, 0, 0, 'pricing', 'conversation-1',
        'uploaded/chats.json', 'local-device', 'device-1'
      )
    `).run({ importedAt })

    const res = await fetch(`${baseUrl}/api/detected-tools`)
    const data = await res.json()
    const kelivo = data.tools.find((tool: any) => tool.sourceKey === 'kelivo')

    expect(res.status).toBe(200)
    expect(kelivo).toMatchObject({ sourceKey: 'kelivo', lastImportedAt: importedAt })
  })

  it('rejects unsupported upload filenames', async () => {
    const form = new FormData()
    form.append('file', new Blob(['{}'], { type: 'application/json' }), 'notes.json')

    const res = await fetch(`${baseUrl}/api/import/kelivo`, { method: 'POST', body: form })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error.code).toBe('INVALID_FILE')
  })
  it('imports a SQLite-era Kelivo database uploaded from the browser', async () => {
    const form = new FormData()
    form.append('file', new Blob([createKelivoDatabase([
      {
        id: 'assistant-db-1',
        conversation_id: 'conversation-db',
        role: 'assistant',
        timestamp: Date.UTC(2026, 5, 5, 13, 1) * 1000,
        model_id: 'claude-sonnet-4-6',
        provider_id: 'anthropic',
        prompt_tokens: 1042,
        completion_tokens: 153,
        cached_tokens: 384,
        total_tokens: 1195,
        extras_json: JSON.stringify({ 'tokens.cacheWrite': 108, 'tokens.reasoning': 53 }),
      },
    ])], { type: 'application/vnd.sqlite3' }), 'kelivo.db')

    const res = await fetch(`${baseUrl}/api/import/kelivo`, { method: 'POST', body: form })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ imported: 1, added: 1, errors: [] })
    const row = db.prepare('SELECT tool, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'kelivo',
      model: 'claude-sonnet-4-6',
      input_tokens: 550,
      output_tokens: 100,
      cache_read_tokens: 384,
      cache_write_tokens: 108,
      thinking_tokens: 53,
      session_id: 'conversation-db',
    })
  })
})
