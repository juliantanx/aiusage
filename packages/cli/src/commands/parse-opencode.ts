import type Database from 'better-sqlite3'
import type { StatsRecord, ToolCallRecord } from '@aiusage/core'
import { generateRecordId, generateToolCallId, inferProvider, calculateCost } from '@aiusage/core'
import type { OpenCodeCursor } from '../watermark.js'

export interface OpenCodeImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: OpenCodeCursor | null
}

export interface OpenCodeImportResult {
  records: StatsRecord[]
  toolCalls: ToolCallRecord[]
  nextCursor: OpenCodeCursor | null
  errors: string[]
}

interface MessageRow {
  id: string
  session_id: string
  time_created: number
  data: string
}

interface PartRow {
  id: string
  message_id: string
  session_id: string
  time_created: number
  data: string
}

interface ParsedMessageData {
  role: string
  modelID?: string
  providerID?: string
  cost?: number
  tokens?: {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
  }
  time?: { created?: number; completed?: number }
}

interface ParsedPartData {
  type?: string
  tool?: string
}

export function runParseOpenCode(
  db: Database.Database,
  options: OpenCodeImportOptions,
): OpenCodeImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor } = options
  const records: StatsRecord[] = []
  const toolCalls: ToolCallRecord[] = []
  const errors: string[] = []
  let lastCursor: OpenCodeCursor | null = null

  const messages = db
    .prepare(
      `SELECT m.id, m.session_id, m.time_created, m.data
       FROM message m
       WHERE m.time_created > ? OR (m.time_created = ? AND m.id > ?)
       ORDER BY m.time_created, m.id`,
    )
    .all(
      cursor?.lastMessageCreatedAt ?? 0,
      cursor?.lastMessageCreatedAt ?? 0,
      cursor?.lastMessageId ?? '',
    ) as MessageRow[]

  const partsStmt = db.prepare(
    `SELECT id, message_id, session_id, time_created, data
     FROM part
     WHERE message_id = ?
     ORDER BY time_created, id`,
  )

  for (const message of messages) {
    // Always advance cursor past every message we visit, including skipped ones
    lastCursor = {
      lastMessageCreatedAt: message.time_created,
      lastMessageId: message.id,
    }

    let parsed: ParsedMessageData
    try {
      parsed = JSON.parse(message.data) as ParsedMessageData
    } catch (e) {
      errors.push(`message ${message.id}: invalid JSON: ${e instanceof Error ? e.message : e}`)
      continue
    }

    // Only process assistant messages with tokens
    if (parsed.role !== 'assistant' || !parsed.tokens) continue

    const inputTokens = parsed.tokens.input ?? 0
    const outputTokens = parsed.tokens.output ?? 0
    const reasoningTokens = parsed.tokens.reasoning ?? 0
    const cacheReadTokens = parsed.tokens.cache?.read ?? 0
    const cacheWriteTokens = parsed.tokens.cache?.write ?? 0

    // Skip messages with no token usage
    if (inputTokens === 0 && outputTokens === 0 && reasoningTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0) continue

    const model = parsed.modelID ?? 'unknown'
    const provider = parsed.providerID ?? inferProvider(model)
    const ts = parsed.time?.created ?? message.time_created

    const recordId = generateRecordId(deviceInstanceId, dbPath + ':' + message.id, message.time_created)

    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens: reasoningTokens }
    const calculatedCost = model !== 'unknown' ? calculateCost(model, tokenArgs) : 0
    // OpenCode often logs cost:0 even for paid models; fall back to pricing table when that happens
    const logCostValid = parsed.cost != null && parsed.cost > 0
    const cost = logCostValid ? parsed.cost : calculatedCost
    const costSource: StatsRecord['costSource'] = logCostValid ? 'log' : calculatedCost > 0 ? 'pricing' : 'unknown'

    const record: StatsRecord = {
      id: recordId,
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0, // DB-sourced records have no byte offset; use 0 as sentinel
      tool: 'opencode',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens: reasoningTokens,
      cost,
      costSource,
      sessionId: message.session_id,
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
    }

    records.push(record)

    // Load tool parts for this message
    const parts = partsStmt.all(message.id) as PartRow[]
    let callIndex = 0
    for (const part of parts) {
      let partParsed: ParsedPartData

      try {
        partParsed = JSON.parse(part.data) as ParsedPartData
      } catch (e) {
        errors.push(`message ${message.id} part ${part.id}: invalid JSON: ${e instanceof Error ? e.message : e}`)
        continue
      }

      if (partParsed.type === 'tool' && partParsed.tool) {
        toolCalls.push({
          id: generateToolCallId(recordId, partParsed.tool, part.time_created, callIndex),
          recordId,
          name: partParsed.tool,
          ts: part.time_created,
          callIndex,
        })
        callIndex++
      }
    }
  }

  return { records, toolCalls, nextCursor: records.length > 0 ? lastCursor : null, errors }
}
