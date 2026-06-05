import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { initializeDatabase } from '../../src/db/index.js'

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return {
    ...actual,
    homedir: () => join(tmpdir(), 'aiusage-parse-kelivo-test'),
  }
})

const { runParse } = await import('../../src/commands/parse.js')

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zipSingleFile(name: string, content: string): Buffer {
  const fileName = Buffer.from(name)
  const raw = Buffer.from(content)
  const compressed = deflateRawSync(raw)
  const crc = crc32(raw)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(0, 10)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(fileName.length, 26)
  local.writeUInt16LE(0, 28)
  const localRecord = Buffer.concat([local, fileName, compressed])

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(0, 12)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(fileName.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)
  const centralRecord = Buffer.concat([central, fileName])

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralRecord.length, 12)
  eocd.writeUInt32LE(localRecord.length, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([localRecord, centralRecord, eocd])
}

describe('runParse with Kelivo exports', () => {
  const testDir = join(tmpdir(), 'aiusage-parse-kelivo-test')
  let cacheDb: Database.Database

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
})
