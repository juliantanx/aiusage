import Database from 'better-sqlite3'
import { deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  content: Buffer | string
}

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

/** Minimal deflate ZIP writer: enough to build Kelivo backup archives in tests. */
export function zipEntries(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const { name, content } of entries) {
    const fileName = Buffer.from(name)
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content)
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
    localParts.push(localRecord)

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
    central.writeUInt32LE(offset, 42)
    centralParts.push(Buffer.concat([central, fileName]))

    offset += localRecord.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, eocd])
}

export function zipSingleFile(name: string, content: Buffer | string): Buffer {
  return zipEntries([{ name, content }])
}

export interface KelivoDatabaseRow {
  id: string
  conversation_id: string
  role: string
  /** Microseconds since epoch, matching Kelivo's drift DateTime converter. */
  timestamp: number
  model_id?: string | null
  provider_id?: string | null
  total_tokens?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  cached_tokens?: number | null
  extras_json?: string | null
}

const MESSAGE_COLUMNS = [
  'id',
  'conversation_id',
  'role',
  'timestamp',
  'model_id',
  'provider_id',
  'total_tokens',
  'prompt_tokens',
  'completion_tokens',
  'cached_tokens',
] as const

/**
 * Builds a Kelivo chat database. `schemaVersion: 1` omits `extras_json`, which
 * SQLite-era Kelivo only added in schema v3, so the importer's column
 * detection can be exercised against both shapes.
 */
function createSchema(db: Database.Database, withExtras: boolean): void {
  db.exec(`CREATE TABLE message_rows (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      model_id TEXT,
      provider_id TEXT,
      total_tokens INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      cached_tokens INTEGER${withExtras ? ',\n      extras_json TEXT' : ''}
    )`)
}

function insertRows(db: Database.Database, rows: KelivoDatabaseRow[], withExtras: boolean): void {
  const columns: string[] = [...MESSAGE_COLUMNS, ...(withExtras ? ['extras_json'] : [])]
  const insert = db.prepare(
    `INSERT INTO message_rows (${columns.join(', ')})
     VALUES (${columns.map((column) => `@${column}`).join(', ')})`,
  )
  for (const row of rows) {
    const values: Record<string, unknown> = {
      model_id: null,
      provider_id: null,
      total_tokens: null,
      prompt_tokens: null,
      completion_tokens: null,
      cached_tokens: null,
    }
    if (withExtras) values.extras_json = null
    for (const column of columns) {
      const value = (row as unknown as Record<string, unknown>)[column]
      if (value !== undefined) values[column] = value
    }
    insert.run(values)
  }
}

export function createKelivoDatabase(
  rows: KelivoDatabaseRow[],
  options: { schemaVersion?: 1 | 3 } = {},
): Buffer {
  const withExtras = (options.schemaVersion ?? 3) >= 3
  const db = new Database(':memory:')
  try {
    createSchema(db, withExtras)
    insertRows(db, rows, withExtras)
    return db.serialize()
  } finally {
    db.close()
  }
}

/**
 * Opens a Kelivo database *as a file* and returns the open connection, so a
 * test can reproduce a running app: with `journalMode: 'wal'` the newest rows
 * sit in the `-wal` sidecar until the connection is closed (which checkpoints
 * and removes it), and writes made while it is open are visible to this file.
 */
export function createKelivoDatabaseFile(
  path: string,
  rows: KelivoDatabaseRow[],
  options: { schemaVersion?: 1 | 3; journalMode?: 'delete' | 'wal' } = {},
): Database.Database {
  const withExtras = (options.schemaVersion ?? 3) >= 3
  const db = new Database(path)
  try {
    if (options.journalMode === 'wal') db.pragma('journal_mode = WAL')
    createSchema(db, withExtras)
    insertRows(db, rows, withExtras)
    return db
  } catch (e) {
    db.close()
    throw e
  }
}
