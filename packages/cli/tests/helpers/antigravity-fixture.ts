import type Database from 'better-sqlite3'

/**
 * Minimal protobuf encoder for Antigravity conversation databases, mirroring
 * the layout `runParseAntigravity` reads (generation metadata with usage and
 * retry messages). Kept deliberately small: only what sync tests need.
 */
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

function timestamp(ts: number): Buffer {
  return message(field(1, Math.floor(ts / 1000)), field(2, (ts % 1000) * 1_000_000))
}

export function antigravityUsage(options: { input: number; totalOutput: number; responseId: string }): Buffer {
  return message(
    field(2, options.input),
    field(3, options.totalOutput),
    field(4, 0),
    field(5, 0),
    field(9, 0),
    field(10, options.totalOutput),
    field(11, options.responseId),
  )
}

export function antigravityGeneration(options: { model: string; usage: Buffer; retries?: Buffer[]; ts: number }): Buffer {
  const chatModel = message(
    field(4, options.usage),
    field(9, message(field(4, timestamp(options.ts)))),
    ...(options.retries ?? []).map((value) => field(17, message(field(2, value)))),
    field(19, options.model),
  )
  return message(field(1, chatModel))
}

export function createAntigravitySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE gen_metadata (idx INTEGER, data BLOB, size INTEGER);
    CREATE TABLE steps (idx INTEGER, metadata BLOB);
    CREATE TABLE trajectory_metadata_blob (id TEXT, data BLOB);
  `)
}

/**
 * Populate `db` with `generations` generation rows, each carrying one usage
 * event and `retriesPerGeneration` retry events. Every event of a generation
 * shares the generation index as its `lineOffset`, which is exactly the shape
 * that collided on the wire. Produces `generations * (1 + retries)` records.
 */
export function seedAntigravityGenerations(db: Database.Database, generations: number, retriesPerGeneration: number, baseTs: number): void {
  const insert = db.prepare('INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)')
  for (let index = 0; index < generations; index++) {
    const retries: Buffer[] = []
    for (let r = 0; r < retriesPerGeneration; r++) {
      retries.push(antigravityUsage({ input: 10 + r, totalOutput: 5 + r, responseId: `gen-${index}-retry-${r}` }))
    }
    insert.run(index, antigravityGeneration({
      model: 'gemini-2.5-pro',
      usage: antigravityUsage({ input: 100 + index, totalOutput: 50, responseId: `gen-${index}-response` }),
      retries,
      ts: baseTs + index * 60_000,
    }), 1)
  }
}
