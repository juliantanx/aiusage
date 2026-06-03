import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'

export interface GooseCursor {
  lastCreatedAt: string
  lastId: string
}

export interface GooseImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: GooseCursor | null
  exchangeRate?: number
}

export interface GooseImportResult {
  records: StatsRecord[]
  nextCursor: GooseCursor | null
  errors: string[]
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

function parseModel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'unknown'
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed?.model_name === 'string' && parsed.model_name.trim()) return parsed.model_name.trim()
  } catch {}
  return 'unknown'
}

function parseTs(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim())
    ? `${value.trim()}Z`
    : value
  const ts = new Date(normalized).getTime()
  return Number.isFinite(ts) ? ts : fallback
}

export function runParseGoose(db: Database.Database, options: GooseImportOptions): GooseImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  let nextCursor: GooseCursor | null = null

  const hasAccumulated = hasColumn(db, 'sessions', 'accumulated_total_tokens')
  const providerExpr = hasColumn(db, 'sessions', 'provider_name') ? 'provider_name' : "NULL AS provider_name"
  const accumulatedExpr = hasAccumulated
    ? 'accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens'
    : 'NULL AS accumulated_total_tokens, NULL AS accumulated_input_tokens, NULL AS accumulated_output_tokens'

  const rows = db.prepare(`
    SELECT id, model_config_json, ${providerExpr}, created_at,
           total_tokens, input_tokens, output_tokens, ${accumulatedExpr}
    FROM sessions
    WHERE model_config_json IS NOT NULL
      AND TRIM(model_config_json) != ''
      AND (created_at > ? OR (created_at = ? AND id > ?))
    ORDER BY created_at, id
  `).all(cursor?.lastCreatedAt ?? '', cursor?.lastCreatedAt ?? '', cursor?.lastId ?? '') as any[]

  for (const row of rows) {
    nextCursor = { lastCreatedAt: String(row.created_at ?? ''), lastId: String(row.id ?? '') }
    const model = parseModel(row.model_config_json)
    const inputTokens = Number(row.accumulated_input_tokens ?? row.input_tokens ?? 0) || 0
    const outputTokens = Number(row.accumulated_output_tokens ?? row.output_tokens ?? 0) || 0
    const totalTokens = Number(row.accumulated_total_tokens ?? row.total_tokens ?? 0) || 0
    if (inputTokens + outputTokens + totalTokens === 0) continue

    const adjustedInput = inputTokens > 0 || outputTokens > 0 ? inputTokens : Math.max(0, totalTokens - outputTokens)
    const tokenArgs = { inputTokens: adjustedInput, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
    const cost = model !== 'unknown' ? calculateCost(model, tokenArgs, exchangeRate) : 0

    records.push({
      id: generateRecordId(deviceInstanceId, `${dbPath}:${row.id}`, parseTs(row.created_at, now)),
      ts: parseTs(row.created_at, now),
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'goose',
      model,
      provider: typeof row.provider_name === 'string' && row.provider_name.trim() ? row.provider_name.trim() : inferProvider(model),
      inputTokens: adjustedInput,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
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
