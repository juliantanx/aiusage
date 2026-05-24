import type Database from 'better-sqlite3'
import type { StatsRecord, ToolCallRecord } from '@aiusage/core'
import { generateRecordId, generateToolCallId, inferProvider, calculateCost } from '@aiusage/core'
import type { HermesCursor } from '../watermark.js'

export interface HermesImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: HermesCursor | null
  exchangeRate?: number
}

export interface HermesImportResult {
  records: StatsRecord[]
  toolCalls: ToolCallRecord[]
  nextCursor: HermesCursor | null
  errors: string[]
}

interface SessionRow {
  id: string
  model: string | null
  billing_provider: string | null
  started_at: number
  ended_at: number | null
  session_ts: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  estimated_cost_usd: number | null
  actual_cost_usd: number | null
}

interface MessageRow {
  id: number
  session_id: string
  tool_calls: string | null
  timestamp: number
}

export function runParseHermes(
  db: Database.Database,
  options: HermesImportOptions,
): HermesImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const toolCalls: ToolCallRecord[] = []
  const errors: string[] = []
  let lastCursor: HermesCursor | null = null

  const sessions = db
    .prepare(
      `SELECT id, model, billing_provider, started_at, ended_at,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              reasoning_tokens, estimated_cost_usd, actual_cost_usd,
              COALESCE(ended_at, started_at) AS session_ts
       FROM sessions
       WHERE (ended_at IS NOT NULL OR input_tokens > 0 OR output_tokens > 0)
         AND (COALESCE(ended_at, started_at) > ? OR (COALESCE(ended_at, started_at) = ? AND id > ?))
       ORDER BY COALESCE(ended_at, started_at), id`,
    )
    .all(
      cursor?.lastEndedAt ?? 0,
      cursor?.lastEndedAt ?? 0,
      cursor?.lastId ?? '',
    ) as SessionRow[]

  const toolCallsStmt = db.prepare(
    `SELECT id, session_id, tool_calls, timestamp
     FROM messages
     WHERE session_id = ? AND tool_calls IS NOT NULL
     ORDER BY timestamp, id`,
  )

  for (const session of sessions) {
    lastCursor = { lastEndedAt: session.session_ts, lastId: session.id }

    const model = session.model ?? 'unknown'
    const ts = Math.round(session.started_at * 1000)

    const rawProvider = session.billing_provider
    const provider = (rawProvider && rawProvider !== 'custom')
      ? rawProvider
      : inferProvider(model)

    const inputTokens = session.input_tokens
    const outputTokens = session.output_tokens
    const cacheReadTokens = session.cache_read_tokens
    const cacheWriteTokens = session.cache_write_tokens
    const thinkingTokens = session.reasoning_tokens

    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }

    let cost: number
    let costSource: StatsRecord['costSource']

    if (session.actual_cost_usd != null && session.actual_cost_usd > 0) {
      cost = session.actual_cost_usd
      costSource = 'log'
    } else if (session.estimated_cost_usd != null && session.estimated_cost_usd > 0) {
      cost = session.estimated_cost_usd
      costSource = 'log'
    } else if (model !== 'unknown') {
      cost = calculateCost(model, tokenArgs, exchangeRate)
      costSource = cost > 0 ? 'pricing' : 'unknown'
    } else {
      cost = 0
      costSource = 'unknown'
    }

    const recordId = generateRecordId(deviceInstanceId, dbPath + ':' + session.id, ts)

    const record: StatsRecord = {
      id: recordId,
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'hermes',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost,
      costSource,
      sessionId: session.id,
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
    }

    records.push(record)

    // Extract tool calls from messages
    const messages = toolCallsStmt.all(session.id) as MessageRow[]
    let callIndex = 0
    for (const message of messages) {
      let toolCallList: Array<{ function?: { name?: string } }>
      try {
        const parsed = JSON.parse(message.tool_calls!)
        if (!Array.isArray(parsed)) {
          errors.push(`session ${session.id} message ${message.id}: tool_calls payload is not an array`)
          continue
        }
        toolCallList = parsed as Array<{ function?: { name?: string } }>
      } catch (e) {
        errors.push(`session ${session.id} message ${message.id}: invalid tool_calls JSON: ${e instanceof Error ? e.message : e}`)
        continue
      }
      for (const tc of toolCallList) {
        const name = tc.function?.name
        if (!name) continue
        toolCalls.push({
          id: generateToolCallId(recordId, name, Math.round(message.timestamp * 1000), callIndex),
          recordId,
          name,
          ts: Math.round(message.timestamp * 1000),
          callIndex,
        })
        callIndex++
      }
    }
  }

  return { records, toolCalls, nextCursor: lastCursor, errors }
}
