import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'
import { runParse } from '../../src/commands/parse.js'

// insertRecord keeps the ingested_at of a row that already exists, but the
// last import time shown for Kelivo is MAX(ingested_at). Reading a backup
// again through `aiusage parse` still counts as an import. The home directory
// is the per-file one from tests/setup-home.ts.

const assistant = {
  id: 'assistant-1',
  role: 'assistant',
  content: 'Hello',
  timestamp: '2026-06-05T10:01:00.000Z',
  modelId: 'gpt-4o',
  providerId: 'openai',
  promptTokens: 842,
  completionTokens: 53,
  cachedTokens: 384,
  totalTokens: 895,
  conversationId: 'conversation-1',
}

function chats(messages: unknown[]): string {
  return JSON.stringify({
    version: 1,
    conversations: [{ id: 'conversation-1', title: 'Demo', createdAt: '2026-06-05T10:00:00.000Z', updatedAt: '2026-06-05T10:01:00.000Z', messageIds: [] }],
    messages,
  })
}

describe('runParse with a Kelivo backup read again', () => {
  const aiusageDir = join(homedir(), '.aiusage')
  const backupDir = join(homedir(), 'kelivo-backups')
  let db: Database.Database

  beforeEach(() => {
    mkdirSync(aiusageDir, { recursive: true })
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(aiusageDir, 'watermark.json'), '{}')
    writeFileSync(join(aiusageDir, 'config.json'), JSON.stringify({ sources: { kelivo: backupDir } }))
    db = new Database(':memory:')
    initializeDatabase(db)
  })

  afterEach(() => {
    db.close()
    rmSync(aiusageDir, { recursive: true, force: true })
    rmSync(backupDir, { recursive: true, force: true })
  })

  it('moves the last import time and leaves the unchanged record synced', async () => {
    writeFileSync(join(backupDir, 'chats.json'), chats([assistant]))
    await runParse(db, 'kelivo')
    expect(db.prepare(`SELECT COUNT(*) AS n FROM records WHERE tool = 'kelivo'`).get()).toEqual({ n: 1 })

    // An earlier import, acknowledged by a sync since.
    db.prepare(`UPDATE records SET ingested_at = 1000, synced_at = updated_at WHERE tool = 'kelivo'`).run()
    const before = db.prepare(`SELECT id, updated_at, synced_at FROM records WHERE tool = 'kelivo'`).get()

    // A newer backup with the same assistant message and one more user message.
    writeFileSync(join(backupDir, 'chats.json'), chats([
      assistant,
      { id: 'user-2', role: 'user', content: 'Thanks', timestamp: '2026-06-05T10:02:00.000Z', conversationId: 'conversation-1' },
    ]))
    const startedAt = Date.now()
    await runParse(db, 'kelivo')

    const after = db.prepare(`SELECT id, ingested_at, updated_at, synced_at FROM records WHERE tool = 'kelivo'`).all() as Array<{ ingested_at: number }>
    expect(after).toHaveLength(1)
    expect(after[0].ingested_at).toBeGreaterThanOrEqual(startedAt)
    expect(after[0]).toMatchObject(before as object)
  })
})
