import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'

export interface ZcodeCursor {
  lastStartedAt: number  // Unix timestamp in milliseconds (model_usage.started_at)
  lastId: string         // model_usage.id
}

export interface ZcodeImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: ZcodeCursor | null
  exchangeRate?: number
}

export interface ZcodeImportResult {
  records: StatsRecord[]
  nextCursor: ZcodeCursor | null
  errors: string[]
}

interface ZcodeModelUsageRow {
  id: string
  session_id: string
  model_id: string
  started_at: number
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  directory?: string | null
}

/**
 * Normalize a ZCode model_id for provider inference and price matching.
 *
 * ZCode stores model names in their vendor display form (e.g. "GLM-5.2"),
 * while the provider map and price table key on lowercase prefixes
 * (e.g. "glm-"). Lowercasing lets both lookups succeed without changes
 * to the shared provider/pricing tables.
 */
function normalizeZcodeModel(value: unknown): string {
  if (typeof value !== 'string') return 'unknown'
  const trimmed = value.trim()
  if (!trimmed) return 'unknown'
  return trimmed.toLowerCase()
}

/**
 * Parse ZCode CLI usage data from its SQLite database.
 *
 * ZCode stores per-request token usage in the `model_usage` table, which we
 * read incrementally using (started_at, id) as a stable ordering. The related
 * `session` table provides the working directory used as `cwd`.
 *
 * Only completed requests with non-zero token usage are emitted. Errors and
 * zero-token rows (e.g. failed title-generation calls) are skipped.
 */
export function runParseZcode(db: Database.Database, options: ZcodeImportOptions): ZcodeImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  let nextCursor: ZcodeCursor | null = null

  const rows = db.prepare(`
    SELECT m.id, m.session_id, m.model_id, m.started_at,
           m.input_tokens, m.output_tokens, m.reasoning_tokens,
           m.cache_creation_input_tokens, m.cache_read_input_tokens,
           s.directory
    FROM model_usage m
    LEFT JOIN session s ON s.id = m.session_id
    WHERE m.status = 'completed'
      AND (m.started_at > ? OR (m.started_at = ? AND m.id > ?))
    ORDER BY m.started_at, m.id
  `).all(
    cursor?.lastStartedAt ?? 0,
    cursor?.lastStartedAt ?? 0,
    cursor?.lastId ?? '',
  ) as ZcodeModelUsageRow[]

  for (const row of rows) {
    nextCursor = { lastStartedAt: Number(row.started_at), lastId: String(row.id) }

    const inputTokens = Number(row.input_tokens) || 0
    const outputTokens = Number(row.output_tokens) || 0
    const thinkingTokens = Number(row.reasoning_tokens) || 0
    const cacheReadTokens = Number(row.cache_read_input_tokens) || 0
    const cacheWriteTokens = Number(row.cache_creation_input_tokens) || 0

    if (inputTokens + outputTokens + thinkingTokens + cacheReadTokens + cacheWriteTokens === 0) continue

    const model = normalizeZcodeModel(row.model_id)
    const provider = inferProvider(model)
    const ts = Number(row.started_at) || now
    const recordId = generateRecordId(deviceInstanceId, `${dbPath}:${row.id}`, ts)

    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
    const calculatedCost = model !== 'unknown' ? calculateCost(model, tokenArgs, exchangeRate) : 0

    records.push({
      id: recordId,
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'zcode',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost: calculatedCost,
      costSource: calculatedCost > 0 ? 'pricing' : 'unknown',
      sessionId: String(row.session_id ?? 'unknown'),
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
      cwd: typeof row.directory === 'string' && row.directory ? row.directory : '',
    })
  }

  return { records, nextCursor: records.length > 0 ? nextCursor : null, errors }
}
