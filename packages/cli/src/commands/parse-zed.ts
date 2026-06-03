import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'
import type { TimestampIdCursor } from '../watermark.js'

export interface ZedImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: TimestampIdCursor | null
  exchangeRate?: number
}

export interface ZedImportResult {
  records: StatsRecord[]
  nextCursor: TimestampIdCursor | null
  errors: string[]
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

function coerce(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function readUsage(value: any): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } {
  return {
    inputTokens: coerce(value?.input_tokens),
    outputTokens: coerce(value?.output_tokens),
    cacheReadTokens: coerce(value?.cache_read_input_tokens),
    cacheWriteTokens: coerce(value?.cache_creation_input_tokens),
  }
}

function sumRequestUsage(value: any): ReturnType<typeof readUsage> {
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const entries = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []
  for (const entry of entries) {
    const usage = readUsage(entry)
    total.inputTokens += usage.inputTokens
    total.outputTokens += usage.outputTokens
    total.cacheReadTokens += usage.cacheReadTokens
    total.cacheWriteTokens += usage.cacheWriteTokens
  }
  return total
}

function parseTs(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : fallback
}

export function runParseZed(db: Database.Database, options: ZedImportOptions): ZedImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  let nextCursor: TimestampIdCursor | null = null

  if (!hasColumn(db, 'threads', 'data') || !hasColumn(db, 'threads', 'data_type')) {
    return { records, nextCursor, errors: ['threads table does not contain data/data_type columns'] }
  }

  const updatedExpr = hasColumn(db, 'threads', 'updated_at') ? 'updated_at' : "'' AS updated_at"
  const createdExpr = hasColumn(db, 'threads', 'created_at') ? 'created_at' : "'' AS created_at"
  const rows = db.prepare(`
    SELECT id, ${updatedExpr}, ${createdExpr}, data_type, data
    FROM threads
    WHERE updated_at > ? OR (updated_at = ? AND id > ?)
    ORDER BY updated_at, id
  `).all(cursor?.lastCreatedAt ?? '', cursor?.lastCreatedAt ?? '', cursor?.lastId ?? '') as any[]

  for (const row of rows) {
    nextCursor = { lastCreatedAt: String(row.updated_at ?? ''), lastId: String(row.id ?? '') }
    if (String(row.data_type ?? '').toLowerCase() !== 'json') {
      errors.push(`thread ${row.id}: skipped unsupported data_type ${row.data_type}`)
      continue
    }

    let thread: any
    try {
      const raw = Buffer.isBuffer(row.data) ? row.data.toString('utf8') : String(row.data ?? '')
      thread = JSON.parse(raw)
    } catch (e) {
      errors.push(`thread ${row.id}: ${e instanceof Error ? e.message : e}`)
      continue
    }

    if (thread?.imported === true) continue
    const model = typeof thread?.model?.model === 'string' && thread.model.model.trim() ? thread.model.model.trim() : 'unknown'
    const provider = typeof thread?.model?.provider === 'string' && thread.model.provider.trim() ? thread.model.provider.trim() : inferProvider(model)
    const request = sumRequestUsage(thread?.request_token_usage)
    const fallback = readUsage(thread?.cumulative_token_usage)
    const usage = request.inputTokens + request.outputTokens + request.cacheReadTokens + request.cacheWriteTokens > 0 ? request : fallback
    if (usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens === 0) continue

    const cost = model !== 'unknown' ? calculateCost(model, { ...usage, thinkingTokens: 0 }, exchangeRate) : 0
    const recordTs = parseTs(row.created_at || row.updated_at, now)
    records.push({
      id: generateRecordId(deviceInstanceId, `${dbPath}:${row.id}`, recordTs),
      ts: recordTs,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'zed',
      model,
      provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      thinkingTokens: 0,
      cost,
      costSource: cost > 0 ? 'pricing' : 'unknown',
      sessionId: String(row.id ?? 'unknown'),
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
    })
  }

  return { records, nextCursor: records.length > 0 ? nextCursor : null, errors }
}
