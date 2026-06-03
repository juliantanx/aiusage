import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'
import type { TimestampIdCursor } from '../watermark.js'

export interface KiroImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: TimestampIdCursor | null
  exchangeRate?: number
}

export interface KiroImportResult {
  records: StatsRecord[]
  nextCursor: TimestampIdCursor | null
  errors: string[]
}

const CHARS_PER_TOKEN = 4

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  return row != null
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function ts(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim()) ? `${value.trim()}Z` : value
    const parsed = new Date(normalized).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeModel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'kiro-agent'
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/^(anthropic\.|openai\.|aws\.)/, '')
    .replace(/:\d+$/, '')
    .replace(/-\d{8}-v\d+(?:-\d+)?$/i, '')
}

function recordFromParts(options: {
  dbPath: string
  sourceId: string
  ts: number
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  sessionId: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  exchangeRate?: number
}): StatsRecord {
  const { dbPath, sourceId, ts: recordTs, model, provider, inputTokens, outputTokens, sessionId, device, deviceInstanceId, platform, now, exchangeRate } = options
  const tokenArgs = { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
  const cost = calculateCost(model, tokenArgs, exchangeRate)
  return {
    id: generateRecordId(deviceInstanceId, `${dbPath}:${sourceId}`, recordTs),
    ts: recordTs,
    ingestedAt: now,
    updatedAt: now,
    lineOffset: 0,
    tool: 'kiro',
    model,
    provider: provider || inferProvider(model),
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
    cost,
    costSource: cost > 0 ? 'pricing' : 'unknown',
    sessionId,
    sourceFile: dbPath,
    device,
    deviceInstanceId,
    platform,
  }
}

function parseTokensGenerated(db: Database.Database, options: KiroImportOptions): KiroImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  let nextCursor: TimestampIdCursor | null = null
  const rows = db.prepare(`
    SELECT id, model, provider, tokens_prompt, tokens_generated, timestamp
    FROM tokens_generated
    WHERE id > ?
    ORDER BY id
  `).all(Number(cursor?.lastId ?? 0) || 0) as any[]

  for (const row of rows) {
    nextCursor = { lastCreatedAt: String(row.timestamp ?? ''), lastId: String(row.id ?? '') }
    const inputTokens = num(row.tokens_prompt)
    const outputTokens = num(row.tokens_generated)
    if (inputTokens + outputTokens === 0) continue
    const model = normalizeModel(row.model)
    records.push(recordFromParts({
      dbPath,
      sourceId: String(row.id),
      ts: ts(row.timestamp, now),
      model,
      provider: typeof row.provider === 'string' ? row.provider : inferProvider(model),
      inputTokens,
      outputTokens,
      sessionId: String(row.id),
      device,
      deviceInstanceId,
      platform,
      now,
      exchangeRate,
    }))
  }

  return { records, nextCursor: records.length > 0 ? nextCursor : null, errors: [] }
}

function parseConversationsV2(db: Database.Database, options: KiroImportOptions): KiroImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  let nextCursor: TimestampIdCursor | null = null
  const rows = db.prepare(`
    SELECT conversation_id, updated_at, value
    FROM conversations_v2
    WHERE updated_at > ? OR (updated_at = ? AND conversation_id > ?)
    ORDER BY updated_at, conversation_id
  `).all(Number(cursor?.lastCreatedAt ?? 0) || 0, Number(cursor?.lastCreatedAt ?? 0) || 0, cursor?.lastId ?? '') as any[]

  for (const row of rows) {
    nextCursor = { lastCreatedAt: String(row.updated_at ?? 0), lastId: String(row.conversation_id ?? '') }
    let parsed: any
    try {
      parsed = JSON.parse(row.value)
    } catch (e) {
      errors.push(`conversation ${row.conversation_id}: ${e instanceof Error ? e.message : e}`)
      continue
    }
    const requests = parsed?.user_turn_metadata?.requests
    if (!Array.isArray(requests)) continue
    const sessionModel = parsed?.model_info?.model_id
    for (const request of requests) {
      const requestId = request?.request_id ?? request?.message_id
      if (!requestId) continue
      const inputTokens = Math.floor(num(request.user_prompt_length) / CHARS_PER_TOKEN)
      const outputTokens = Math.floor(num(request.response_size) / CHARS_PER_TOKEN)
      if (inputTokens + outputTokens === 0) continue
      const model = normalizeModel(request.model_id ?? sessionModel)
      records.push(recordFromParts({
        dbPath,
        sourceId: String(requestId),
        ts: ts(request.request_start_timestamp_ms, now),
        model,
        provider: inferProvider(model),
        inputTokens,
        outputTokens,
        sessionId: String(row.conversation_id ?? 'unknown'),
        device,
        deviceInstanceId,
        platform,
        now,
        exchangeRate,
      }))
    }
  }

  return { records, nextCursor: records.length > 0 ? nextCursor : null, errors }
}

export function runParseKiro(db: Database.Database, options: KiroImportOptions): KiroImportResult {
  if (tableExists(db, 'tokens_generated')) return parseTokensGenerated(db, options)
  if (tableExists(db, 'conversations_v2')) return parseConversationsV2(db, options)
  return { records: [], nextCursor: null, errors: ['no supported Kiro tables found'] }
}
