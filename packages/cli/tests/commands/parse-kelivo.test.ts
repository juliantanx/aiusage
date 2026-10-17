import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { initializeDatabase } from '../../src/db/index.js'
import { isKelivoSourceFile } from '../../src/commands/parse-kelivo.js'
import { createKelivoDatabase, createKelivoDatabaseFile, zipEntries, zipSingleFile } from '../helpers/kelivo-fixture.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-kelivo-test'),
  }
})

// Track the extraction and snapshot directories the importer creates, so a test
// can assert it removes them again.
const fsTrace = vi.hoisted(() => ({ created: [] as string[], removed: [] as string[] }))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    mkdtempSync: (prefix: Parameters<typeof actual.mkdtempSync>[0]) => {
      const dir = actual.mkdtempSync(prefix)
      if (String(dir).includes('aiusage-kelivo-')) fsTrace.created.push(String(dir))
      return dir
    },
    rmSync: (target: Parameters<typeof actual.rmSync>[0], options?: Parameters<typeof actual.rmSync>[1]) => {
      if (typeof target === 'string' && target.includes('aiusage-kelivo-')) fsTrace.removed.push(target)
      return actual.rmSync(target, options)
    },
  }
})

const { runParse } = await import('../../src/commands/parse.js')


describe('runParse with Kelivo exports', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-kelivo-test')
  let cacheDb: Database.Database

  const ASSISTANT_TIMESTAMP_MS = Date.UTC(2026, 5, 5, 13, 1)

  function assistantDatabaseRow(id: string) {
    return {
      id,
      conversation_id: 'conversation-db',
      role: 'assistant',
      // drift's MicrosecondDateTimeConverter stores microseconds since epoch.
      timestamp: ASSISTANT_TIMESTAMP_MS * 1000,
      model_id: 'claude-sonnet-4-6',
      provider_id: 'anthropic',
      prompt_tokens: 1042,
      completion_tokens: 153,
      cached_tokens: 384,
      total_tokens: 1195,
      extras_json: JSON.stringify({ 'tokens.cacheWrite': 108, 'tokens.reasoning': 53 }),
    }
  }

  beforeEach(() => {
    mkdirSync(join(testDir, '.aiusage'), { recursive: true })
    writeFileSync(join(testDir, '.aiusage', 'watermark.json'), '{}')
    writeFileSync(join(testDir, '.aiusage', 'config.json'), JSON.stringify({
      sources: {
        kelivo: join(testDir, 'kelivo-backups'),
      },
    }))

    cacheDb = new Database(':memory:')
    initializeDatabase(cacheDb)
  })

  afterEach(() => {
    cacheDb.close()
    rmSync(testDir, { recursive: true, force: true })
  })

  it('imports assistant token usage from Kelivo chats.json', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'chats.json'), JSON.stringify({
      version: 1,
      conversations: [
        { id: 'conversation-1', title: 'Demo', createdAt: '2026-06-05T10:00:00.000Z', updatedAt: '2026-06-05T10:01:00.000Z', messageIds: ['user-1', 'assistant-1'] },
      ],
      messages: [
        { id: 'user-1', role: 'user', content: 'Hi', timestamp: '2026-06-05T10:00:00.000Z', conversationId: 'conversation-1' },
        {
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
        },
      ],
    }))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'kelivo',
      model: 'gpt-4o',
      provider: 'openai',
      input_tokens: 458,
      output_tokens: 53,
      cache_read_tokens: 384,
      cache_write_tokens: 0,
      thinking_tokens: 0,
      session_id: 'conversation-1',
    })
  })

  it('imports assistant token usage from Kelivo backup zip', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo_backup.zip'), zipSingleFile('chats.json', JSON.stringify({
      version: 1,
      conversations: [],
      messages: [
        {
          id: 'assistant-zip-1',
          role: 'assistant',
          content: 'Hello from zip',
          timestamp: '2026-06-05T11:01:00.000Z',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          promptTokens: 100,
          completionTokens: 25,
          cachedTokens: 10,
          conversationId: 'conversation-zip',
        },
      ],
    })))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT tool, model, input_tokens, output_tokens, cache_read_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'kelivo',
      model: 'claude-sonnet-4-6',
      input_tokens: 90,
      output_tokens: 25,
      cache_read_tokens: 10,
      session_id: 'conversation-zip',
    })
  })

  it('deduplicates the same Kelivo message across repeated backup files', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    const chats = JSON.stringify({
      version: 1,
      conversations: [],
      messages: [
        {
          id: 'same-message-id',
          role: 'assistant',
          content: 'Same message in two exports',
          timestamp: '2026-06-05T12:01:00.000Z',
          modelId: 'gpt-4o',
          providerId: 'openai',
          promptTokens: 20,
          completionTokens: 5,
          cachedTokens: 0,
          conversationId: 'same-conversation-id',
        },
      ],
    })
    writeFileSync(join(backupDir, 'kelivo_backup_1.zip'), zipSingleFile('chats.json', chats))
    writeFileSync(join(backupDir, 'kelivo_backup_2.zip'), zipSingleFile('chats.json', chats))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(cacheDb.prepare('SELECT COUNT(*) AS count FROM records WHERE tool = ?').get('kelivo')).toMatchObject({ count: 1 })
  })
  it('maps cache-write and reasoning tokens from chats.json', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'chats.json'), JSON.stringify({
      version: 1,
      conversations: [],
      messages: [
        {
          id: 'assistant-legacy-1',
          role: 'assistant',
          content: 'Hello',
          timestamp: '2026-06-05T14:01:00.000Z',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          promptTokens: 1042,
          completionTokens: 153,
          cachedTokens: 384,
          cacheWriteTokens: 108,
          reasoningTokens: 53,
          conversationId: 'conversation-legacy',
        },
      ],
    }))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      model: 'claude-sonnet-4-6',
      input_tokens: 550,
      output_tokens: 100,
      cache_read_tokens: 384,
      cache_write_tokens: 108,
      thinking_tokens: 53,
      session_id: 'conversation-legacy',
    })
  })

  it('imports assistant token usage from a SQLite-era Kelivo backup zip', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo_backup_v3.zip'), zipEntries([
      { name: 'manifest.json', content: JSON.stringify({ format: 'kelivo-backup', formatVersion: 3 }) },
      { name: 'settings.json', content: '{}' },
      { name: 'database/kelivo.db', content: createKelivoDatabase([assistantDatabaseRow('assistant-db-1')]) },
    ]))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT tool, model, provider, ts, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, session_id FROM records').get() as any
    expect(row).toMatchObject({
      tool: 'kelivo',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      ts: ASSISTANT_TIMESTAMP_MS,
      input_tokens: 550,
      output_tokens: 100,
      cache_read_tokens: 384,
      cache_write_tokens: 108,
      thinking_tokens: 53,
      session_id: 'conversation-db',
    })
  })

  it('imports assistant token usage from a raw Kelivo database file', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo.db'), createKelivoDatabase([assistantDatabaseRow('assistant-raw-1')]))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT model, ts, input_tokens, output_tokens, cache_write_tokens, thinking_tokens FROM records').get() as any
    expect(row).toMatchObject({
      model: 'claude-sonnet-4-6',
      ts: ASSISTANT_TIMESTAMP_MS,
      input_tokens: 550,
      output_tokens: 100,
      cache_write_tokens: 108,
      thinking_tokens: 53,
    })
  })

  it('reads a Kelivo database from before cache-write tokens moved into extras_json', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(
      join(backupDir, 'kelivo.db'),
      createKelivoDatabase([assistantDatabaseRow('assistant-v1-1')], { schemaVersion: 1 }),
    )

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(result.parsedCount).toBe(1)
    const row = cacheDb.prepare('SELECT model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens FROM records').get() as any
    expect(row).toMatchObject({
      model: 'claude-sonnet-4-6',
      input_tokens: 658,
      output_tokens: 153,
      cache_read_tokens: 384,
      cache_write_tokens: 0,
      thinking_tokens: 0,
    })
  })
  it('prefers chats.json when a backup zip carries both formats', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo_backup_mixed.zip'), zipEntries([
      { name: 'database/kelivo.db', content: createKelivoDatabase([assistantDatabaseRow('assistant-from-db')]) },
      {
        name: 'chats.json',
        content: JSON.stringify({
          version: 1,
          conversations: [],
          messages: [
            {
              id: 'assistant-from-chats',
              role: 'assistant',
              timestamp: '2026-06-05T13:01:00.000Z',
              modelId: 'claude-sonnet-4-6',
              providerId: 'anthropic',
              promptTokens: 20,
              completionTokens: 5,
              cachedTokens: 0,
              conversationId: 'conversation-db',
            },
          ],
        }),
      },
    ]))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    const row = cacheDb.prepare('SELECT model, input_tokens, output_tokens FROM records').get() as any
    expect(row).toMatchObject({ model: 'claude-sonnet-4-6', input_tokens: 20, output_tokens: 5 })
  })

  it('deduplicates a message imported from both chats.json and the SQLite database', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'chats.json'), JSON.stringify({
      version: 1,
      conversations: [],
      messages: [
        {
          id: 'assistant-shared',
          role: 'assistant',
          timestamp: '2026-06-05T13:01:00.000Z',
          modelId: 'claude-sonnet-4-6',
          providerId: 'anthropic',
          promptTokens: 1042,
          completionTokens: 153,
          cachedTokens: 384,
          conversationId: 'conversation-db',
        },
      ],
    }))
    writeFileSync(join(backupDir, 'kelivo.db'), createKelivoDatabase([assistantDatabaseRow('assistant-shared')]))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    expect(cacheDb.prepare("SELECT COUNT(*) AS count FROM records WHERE tool = 'kelivo'").get()).toMatchObject({ count: 1 })
  })

  it('reports a Kelivo zip with neither chats.json nor a database', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo_backup_empty.zip'), zipEntries([
      { name: 'manifest.json', content: '{"format":"kelivo-backup","formatVersion":3}' },
      { name: 'settings.json', content: '{}' },
    ]))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.parsedCount).toBe(0)
    expect(result.errors.join(' ')).toContain('neither chats.json nor a Kelivo database')
  })

  it('reports a database file that is not a Kelivo chat database', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo.db'), 'not a sqlite database')

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.parsedCount).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(cacheDb.prepare('SELECT COUNT(*) AS count FROM records').get()).toMatchObject({ count: 0 })
  })
  it('infers the provider from the model and falls back to the Kelivo label', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo.db'), createKelivoDatabase([
      { ...assistantDatabaseRow('assistant-known-model'), model_id: 'claude-sonnet-4-6', provider_id: 'OpenAI - MiMo' },
      { ...assistantDatabaseRow('assistant-custom-model'), model_id: 'MiniMax-M2.7', provider_id: 'OpenAI - MiMo' },
    ]))

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.errors).toHaveLength(0)
    const rows = cacheDb.prepare('SELECT model, provider FROM records ORDER BY model').all() as any[]
    expect(rows).toEqual([
      { model: 'MiniMax-M2.7', provider: 'OpenAI - MiMo' },
      { model: 'claude-sonnet-4-6', provider: 'anthropic' },
    ])
  })
  it('re-reads an unchanged database without rewriting its rows', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'kelivo.db'), createKelivoDatabase([assistantDatabaseRow('assistant-repeat')]))

    const first = await runParse(cacheDb, 'kelivo')
    expect(first.parsedCount).toBe(1)
    const imported = cacheDb.prepare("SELECT ingested_at, updated_at FROM records WHERE tool = 'kelivo'").get() as any
    // Pretend cloud sync acknowledged the row before the second import.
    cacheDb.prepare("UPDATE records SET synced_at = 4242 WHERE tool = 'kelivo'").run()

    const second = await runParse(cacheDb, 'kelivo')

    expect(second.errors).toHaveLength(0)
    expect(second.parsedCount).toBe(0)
    const after = cacheDb.prepare("SELECT ingested_at, updated_at, synced_at FROM records WHERE tool = 'kelivo'").get() as any
    expect(after).toMatchObject({
      ingested_at: imported.ingested_at,
      updated_at: imported.updated_at,
      synced_at: 4242,
    })
  })

  it('updates a record whose database value changed without the file growing', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    const dbPath = join(backupDir, 'kelivo.db')
    writeFileSync(dbPath, createKelivoDatabase([{
      id: 'assistant-resized',
      conversation_id: 'conversation-db',
      role: 'assistant',
      timestamp: ASSISTANT_TIMESTAMP_MS * 1000,
      model_id: 'claude-sonnet-4-6',
      provider_id: 'anthropic',
      prompt_tokens: 100,
      completion_tokens: 10,
      cached_tokens: 40,
      total_tokens: 110,
    }]))

    const first = await runParse(cacheDb, 'kelivo')
    expect(first.parsedCount).toBe(1)
    const sizeAfterFirstImport = statSync(dbPath).size

    // SQLite rewrites pages in place: the file keeps its size, so the
    // watermark's offset reaches EOF while the content still changes.
    const db = new Database(dbPath)
    db.prepare('UPDATE message_rows SET prompt_tokens = 127 WHERE id = ?').run('assistant-resized')
    db.close()
    expect(statSync(dbPath).size).toBe(sizeAfterFirstImport)

    const second = await runParse(cacheDb, 'kelivo')

    expect(second.errors).toHaveLength(0)
    expect(second.parsedCount).toBe(1)
    expect(cacheDb.prepare("SELECT input_tokens FROM records WHERE tool = 'kelivo'").get())
      .toMatchObject({ input_tokens: 87 })
  })

  it('reads rows that only exist in the live database WAL', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    const livePath = join(backupDir, 'kelivo.db')
    const live = createKelivoDatabaseFile(livePath, [assistantDatabaseRow('assistant-live-wal')], { journalMode: 'wal' })
    try {
      expect(existsSync(`${livePath}-wal`)).toBe(true)
      const before = statSync(livePath)

      const result = await runParse(cacheDb, 'kelivo')

      expect(result.errors).toHaveLength(0)
      expect(result.parsedCount).toBe(1)
      const after = statSync(livePath)
      expect(after.size).toBe(before.size)
      expect(after.mtimeMs).toBe(before.mtimeMs)
    } finally {
      live.close()
    }
  })

  it('warns when a WAL-mode database was copied without its -wal', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    const dbPath = join(backupDir, 'kelivo.db')
    const closed = createKelivoDatabaseFile(dbPath, [assistantDatabaseRow('assistant-copied')], { journalMode: 'wal' })
    closed.close()
    expect(existsSync(`${dbPath}-wal`)).toBe(false)

    const result = await runParse(cacheDb, 'kelivo')

    expect(result.parsedCount).toBe(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('-wal')
  })
  it('removes the snapshot directory when the snapshot is not a Kelivo database', async () => {
    const backupDir = join(testDir, 'kelivo-backups')
    mkdirSync(backupDir, { recursive: true })
    const dbPath = join(backupDir, 'kelivo.db')
    const foreign = createKelivoDatabaseFile(dbPath, [], { journalMode: 'wal' })
    // Keep the WAL (so the online-backup path runs) but drop the table it needs,
    // so the failure happens after the snapshot exists on disk.
    foreign.exec('DROP TABLE message_rows')
    fsTrace.created = []
    fsTrace.removed = []
    try {
      const result = await runParse(cacheDb, 'kelivo')

      expect(result.parsedCount).toBe(0)
      expect(result.errors.join(' ')).toContain('message_rows')
    } finally {
      foreign.close()
    }

    expect(fsTrace.created.length).toBeGreaterThan(0)
    for (const dir of fsTrace.created) expect(existsSync(dir)).toBe(false)
  })
})

describe('isKelivoSourceFile', () => {
  it('accepts every Kelivo export shape and rejects other files', () => {
    for (const name of ['chats.json', 'kelivo_backup.zip', 'kelivo.db', 'kelivo.sqlite', 'kelivo.sqlite3']) {
      expect(isKelivoSourceFile(name)).toBe(true)
    }
    for (const name of ['notes.json', 'my-chats.json', 'kelivo.db-wal', 'backup.tar.gz']) {
      expect(isKelivoSourceFile(name)).toBe(false)
    }
  })
})
