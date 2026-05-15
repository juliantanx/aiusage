import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runParseOpenCode } from '../../src/commands/parse-opencode.js'

function createOpenCodeDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      data TEXT NOT NULL
    )
  `)
}

describe('parse-opencode', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createOpenCodeDb(db)
  })

  afterEach(() => {
    db.close()
  })

  it('imports assistant messages and tool parts from opencode db', () => {
    const messageData = JSON.stringify({
      role: 'assistant',
      modelID: 'glm-5.1',
      providerID: 'qianfan',
      cost: 0,
      tokens: {
        input: 120,
        output: 30,
        reasoning: 5,
        cache: { read: 0, write: 0 },
      },
      time: { created: 1778821880545, completed: 1778821881000 },
    })

    db.prepare(
      'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
    ).run('msg_1', 'sess_1', 1778821880545, messageData)

    const partData1 = JSON.stringify({ type: 'tool', tool: 'bash' })
    const partData2 = JSON.stringify({ type: 'tool', tool: 'read' })

    db.prepare(
      'INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)'
    ).run('part_1', 'msg_1', 'sess_1', 1778821880546, partData1)

    db.prepare(
      'INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)'
    ).run('part_2', 'msg_1', 'sess_1', 1778821880547, partData2)

    const result = runParseOpenCode(db, {
      dbPath: '/home/user/.local/share/opencode/opencode.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })

    expect(result.records).toHaveLength(1)
    expect(result.records[0].tool).toBe('opencode')
    expect(result.records[0].model).toBe('glm-5.1')
    expect(result.records[0].provider).toBe('qianfan')
    expect(result.records[0].inputTokens).toBe(120)
    expect(result.toolCalls.map(tc => tc.name)).toEqual(['bash', 'read'])
    expect(result.nextCursor).toEqual({
      lastMessageCreatedAt: 1778821880545,
      lastMessageId: 'msg_1',
    })
  })

  it('skips non-assistant messages', () => {
    const messageData = JSON.stringify({
      role: 'user',
      content: 'hello',
    })

    db.prepare(
      'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
    ).run('msg_1', 'sess_1', 1778821880545, messageData)

    const result = runParseOpenCode(db, {
      dbPath: '/home/user/.local/share/opencode/opencode.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })

    expect(result.records).toHaveLength(0)
    expect(result.toolCalls).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  it('respects cursor for incremental import', () => {
    const msg1Data = JSON.stringify({
      role: 'assistant',
      modelID: 'glm-5.1',
      providerID: 'qianfan',
      cost: 0,
      tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1778821880000, completed: 1778821881000 },
    })
    const msg2Data = JSON.stringify({
      role: 'assistant',
      modelID: 'glm-5.1',
      providerID: 'qianfan',
      cost: 0,
      tokens: { input: 200, output: 40, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1778821881000, completed: 1778821882000 },
    })

    db.prepare(
      'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
    ).run('msg_1', 'sess_1', 1778821880000, msg1Data)
    db.prepare(
      'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
    ).run('msg_2', 'sess_1', 1778821881000, msg2Data)

    // First import: get everything
    const result1 = runParseOpenCode(db, {
      dbPath: '/home/user/.local/share/opencode/opencode.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })
    expect(result1.records).toHaveLength(2)
    expect(result1.nextCursor).toEqual({
      lastMessageCreatedAt: 1778821881000,
      lastMessageId: 'msg_2',
    })

    // Second import with cursor: should get nothing
    const result2 = runParseOpenCode(db, {
      dbPath: '/home/user/.local/share/opencode/opencode.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: result1.nextCursor,
    })
    expect(result2.records).toHaveLength(0)
  })

  it('uses inferProvider when providerID is missing', () => {
    const messageData = JSON.stringify({
      role: 'assistant',
      modelID: 'glm-5.1',
      cost: 0,
      tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1778821880000, completed: 1778821881000 },
    })

    db.prepare(
      'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
    ).run('msg_1', 'sess_1', 1778821880000, messageData)

    const result = runParseOpenCode(db, {
      dbPath: '/home/user/.local/share/opencode/opencode.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })

    expect(result.records).toHaveLength(1)
    // glm- prefix maps to zhipu via inferProvider
    expect(result.records[0].provider).toBe('zhipu')
  })

  it('returns errors for malformed data', () => {
    db.prepare(
      'INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)'
    ).run('msg_1', 'sess_1', 1778821880000, 'not-json')

    const result = runParseOpenCode(db, {
      dbPath: '/home/user/.local/share/opencode/opencode.db',
      device: 'macbook',
      deviceInstanceId: 'device-123',
      now: 1778822000000,
      cursor: null,
    })

    expect(result.records).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
