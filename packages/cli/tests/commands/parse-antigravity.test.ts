import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runParseAntigravity } from '../../src/commands/parse-antigravity.js'

function varint(value: number): Buffer {
  const bytes: number[] = []
  let remaining = value
  do {
    let byte = remaining % 128
    remaining = Math.floor(remaining / 128)
    if (remaining > 0) byte |= 0x80
    bytes.push(byte)
  } while (remaining > 0)
  return Buffer.from(bytes)
}

function field(number: number, value: number | Buffer | string): Buffer {
  if (typeof value === 'number') return Buffer.concat([varint(number * 8), varint(value)])
  const data = typeof value === 'string' ? Buffer.from(value) : value
  return Buffer.concat([varint(number * 8 + 2), varint(data.length), data])
}

function message(...fields: Array<Buffer | undefined>): Buffer {
  return Buffer.concat(fields.filter((value): value is Buffer => value != null))
}

interface UsageOptions {
  modelId?: number
  input: number
  totalOutput: number
  cacheWrite?: number
  cacheRead?: number
  thinking?: number
  responseOutput?: number
  messageId?: string
  responseId?: string
  providerMessageId?: string
}

function usage(options: UsageOptions): Buffer {
  return message(
    options.modelId ? field(1, options.modelId) : undefined,
    field(2, options.input),
    field(3, options.totalOutput),
    field(4, options.cacheWrite ?? 0),
    field(5, options.cacheRead ?? 0),
    options.messageId ? field(7, options.messageId) : undefined,
    field(9, options.thinking ?? 0),
    field(10, options.responseOutput ?? Math.max(0, options.totalOutput - (options.thinking ?? 0))),
    options.responseId ? field(11, options.responseId) : undefined,
    options.providerMessageId ? field(12, options.providerMessageId) : undefined,
  )
}

function retry(value: Buffer): Buffer {
  return message(field(2, value))
}

function generationMetadata(options: {
  model?: string
  modelId?: number
  usage?: Buffer
  retries?: Buffer[]
  stepIndices?: number[]
  ts?: number
}): Buffer {
  const chatModel = message(
    options.modelId ? field(3, options.modelId) : undefined,
    options.usage ? field(4, options.usage) : undefined,
    options.ts != null ? field(9, message(field(4, timestamp(options.ts)))) : undefined,
    ...(options.retries ?? []).map((value) => field(17, retry(value))),
    options.model ? field(19, options.model) : undefined,
  )
  const stepIndices = options.stepIndices ?? []
  return message(
    field(1, chatModel),
    stepIndices.length > 0 ? field(2, Buffer.concat(stepIndices.map(varint))) : undefined,
  )
}

function timestamp(ts: number): Buffer {
  return message(
    field(1, Math.floor(ts / 1000)),
    field(2, (ts % 1000) * 1_000_000),
  )
}

function trajectoryMetadata(ts: number): Buffer {
  return message(field(2, timestamp(ts)))
}

function stepMetadata(options: {
  ts: number
  usage?: Buffer
  retries?: Buffer[]
  modelId?: number
}): Buffer {
  return message(
    field(1, timestamp(options.ts)),
    options.usage ? field(9, options.usage) : undefined,
    ...(options.retries ?? []).map((value) => field(28, retry(value))),
    options.modelId ? field(24, message(field(1, options.modelId))) : undefined,
  )
}

describe('parse-antigravity', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE gen_metadata (idx INTEGER, data BLOB, size INTEGER);
      CREATE TABLE steps (idx INTEGER, metadata BLOB);
      CREATE TABLE trajectory_metadata_blob (id TEXT, data BLOB);
    `)
  })

  afterEach(() => db.close())

  function parse(startIndex = 0) {
    return runParseAntigravity(db, {
      dbPath: '/home/test/.gemini/antigravity/conversations/session-1.db',
      device: 'laptop',
      deviceInstanceId: 'device-123',
      now: Date.UTC(2026, 8, 7),
      fallbackTs: Date.UTC(2026, 8, 7),
      startIndex,
    })
  }

  it('imports exact usage from generation metadata', () => {
    const createdAt = Date.UTC(2026, 8, 6, 14, 19, 29, 321)
    db.prepare('INSERT INTO steps (idx, metadata) VALUES (?, ?)').run(7, stepMetadata({ ts: createdAt }))
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      model: 'gemini-3.8-flash',
      usage: usage({
        input: 12_727,
        totalOutput: 278,
        cacheWrite: 3,
        cacheRead: 8_151,
        thinking: 201,
        responseOutput: 77,
      }),
      stepIndices: [7, 8],
    }), 1)

    const result = parse()

    expect(result.errors).toEqual([])
    expect(result.nextIndex).toBe(1)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      ts: createdAt,
      tool: 'antigravity',
      model: 'gemini-3.8-flash',
      provider: 'google',
      inputTokens: 12_727,
      outputTokens: 77,
      cacheWriteTokens: 3,
      cacheReadTokens: 8_151,
      thinkingTokens: 201,
      sessionId: 'session-1',
    })
  })

  it('collects retries and deduplicates overlapping generation and step usage', () => {
    const shared = usage({
      input: 100,
      totalOutput: 50,
      cacheRead: 7,
      thinking: 10,
      messageId: 'message-1',
      responseId: 'response-1',
      providerMessageId: 'provider-1',
    })
    const duplicateRetry = usage({
      input: 80,
      totalOutput: 30,
      thinking: 5,
      messageId: 'message-1',
      responseId: 'retry-response',
      providerMessageId: 'provider-1',
    })
    const distinctRetry = usage({
      input: 11,
      totalOutput: 22,
      thinking: 2,
      responseId: 'distinct-retry',
    })
    db.prepare('INSERT INTO steps (idx, metadata) VALUES (?, ?)').run(1, stepMetadata({
      ts: 2_000,
      usage: shared,
      retries: [distinctRetry],
    }))
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      model: 'gemini-2.5-pro',
      usage: shared,
      retries: [duplicateRetry],
      stepIndices: [1],
    }), 1)

    const result = parse()

    expect(result.errors).toEqual([])
    expect(result.records).toHaveLength(2)
    expect(result.records.map((record) => record.inputTokens).sort((a, b) => a - b)).toEqual([11, 100])
    expect(result.records.reduce((sum, record) => sum + record.inputTokens, 0)).toBe(111)
  })

  it('imports usage available only from steps', () => {
    db.prepare('INSERT INTO steps (idx, metadata) VALUES (?, ?)').run(4, stepMetadata({
      ts: 2_000,
      usage: usage({ input: 42, totalOutput: 9 }),
      modelId: 312,
    }))
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      stepIndices: [4],
    }), 1)

    const result = parse()

    expect(result.errors).toEqual([])
    expect(result.nextIndex).toBe(1)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ model: 'gemini-2.5-flash', inputTokens: 42, outputTokens: 9 })
  })

  it('parses gen_metadata when the optional steps table is absent', () => {
    db.exec('DROP TABLE steps')
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      model: 'gemini-2.5-flash',
      usage: usage({ input: 20, totalOutput: 5 }),
    }), 1)

    const result = parse()

    expect(result.errors).toEqual([])
    expect(result.records).toHaveLength(1)
    expect(result.nextIndex).toBe(1)
  })

  it('falls back to numeric model IDs when names are unavailable', () => {
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      usage: usage({ modelId: 246, input: 20, totalOutput: 5 }),
    }), 1)

    expect(parse().records[0]).toMatchObject({
      model: 'gemini-2.5-pro',
      provider: 'google',
    })
  })

  it('normalizes Antigravity display labels and routing aliases before pricing', () => {
    const models = [
      ['Gemini 3 Pro', 'gemini-3-pro', 'google'],
      ['Claude Sonnet 4.6 (Thinking)', 'claude-sonnet-4-6', 'anthropic'],
      ['gemini-3-flash-agent', 'gemini-3.5-flash-high', 'google'],
      ['MODEL_PLACEHOLDER_M35', 'claude-sonnet-4-6', 'anthropic'],
    ] as const
    for (const [index, [model]] of models.entries()) {
      db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(index, generationMetadata({
        model,
        usage: usage({ input: 1_000_000, totalOutput: 1, responseId: `response-${index}` }),
      }), 1)
    }

    const records = parse().records

    expect(records).toHaveLength(models.length)
    for (const [index, [, model, provider]] of models.entries()) {
      expect(records[index]).toMatchObject({ model, provider, costSource: 'pricing' })
      expect(records[index].cost).toBeGreaterThan(0)
    }
  })

  it('preserves unknown Antigravity model names', () => {
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      model: 'Future Experimental Model',
      usage: usage({ input: 20, totalOutput: 5 }),
    }), 1)

    expect(parse().records[0]).toMatchObject({
      model: 'Future Experimental Model',
      provider: 'unknown',
      costSource: 'unknown',
    })
  })

  it('resumes from the generation metadata index', () => {
    const data = generationMetadata({
      model: 'gemini-2.5-flash',
      usage: usage({ input: 100, totalOutput: 25, thinking: 5 }),
    })
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, data, data.length)
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(1, data, data.length)

    const result = parse(1)

    expect(result.records.map((record) => record.lineOffset)).toEqual([1])
    expect(result.nextIndex).toBe(2)
  })

  it('advances past an empty generation when a later generation has usage', () => {
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({}), 0)
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(1, generationMetadata({
      model: 'gemini-2.5-flash',
      usage: usage({ input: 100, totalOutput: 25 }),
    }), 1)

    const result = parse()

    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ lineOffset: 1, inputTokens: 100 })
    expect(result.nextIndex).toBe(2)
  })

  it('uses the trajectory timestamp before the database mtime fallback', () => {
    const trajectoryTs = Date.UTC(2026, 7, 31, 10, 11, 12, 345)
    db.prepare('INSERT INTO trajectory_metadata_blob (id, data) VALUES (?, ?)').run('main', trajectoryMetadata(trajectoryTs))
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      model: 'gemini-2.5-flash',
      usage: usage({ input: 20, totalOutput: 5 }),
    }), 1)

    expect(parse().records[0].ts).toBe(trajectoryTs)
  })

  it('prefers generation timestamps over the trajectory timestamp', () => {
    const generationTs = Date.UTC(2026, 8, 1, 1, 2, 3, 456)
    db.prepare('INSERT INTO trajectory_metadata_blob (id, data) VALUES (?, ?)').run('main', trajectoryMetadata(generationTs - 60_000))
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({
      model: 'gemini-2.5-flash',
      usage: usage({ input: 20, totalOutput: 5 }),
      ts: generationTs,
    }), 1)

    expect(parse().records[0].ts).toBe(generationTs)
  })

  it('accepts 10-byte varints in generation and step metadata', () => {
    // int64 -1 on the wire: nine 0xff continuation bytes followed by 0x01.
    const negativeOne = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])
    const maxUint64 = Buffer.concat([varint(99 * 8), negativeOne])
    const createdAt = Date.UTC(2026, 8, 6, 14, 19, 29, 321)
    db.prepare('INSERT INTO steps (idx, metadata) VALUES (?, ?)').run(3, Buffer.concat([
      stepMetadata({ ts: createdAt }),
      maxUint64,
    ]))
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, Buffer.concat([
      maxUint64,
      generationMetadata({
        model: 'gemini-3.8-flash',
        usage: usage({ input: 42, totalOutput: 10, thinking: 4, responseOutput: 6 }),
        stepIndices: [3],
      }),
    ]), 1)

    const result = parse()

    expect(result.errors).toEqual([])
    expect(result.nextIndex).toBe(1)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      ts: createdAt,
      model: 'gemini-3.8-flash',
      inputTokens: 42,
      outputTokens: 6,
      thinkingTokens: 4,
    })
  })

  it('rejects varints longer than 10 bytes', () => {
    const overlong = Buffer.concat([varint(99 * 8), Buffer.alloc(11, 0xff)])
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, Buffer.concat([
      generationMetadata({ model: 'gemini-3.8-flash', usage: usage({ input: 1, totalOutput: 1 }) }),
      overlong,
    ]), 1)

    const result = parse()

    expect(result.records).toEqual([])
    expect(result.errors).toEqual(['generation metadata 0: invalid protobuf varint'])
  })

  it('leaves an unfinished metadata row for a later parse', () => {
    db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)').run(0, generationMetadata({}), 0)

    const result = parse()

    expect(result.records).toEqual([])
    expect(result.nextIndex).toBe(0)
  })
})
