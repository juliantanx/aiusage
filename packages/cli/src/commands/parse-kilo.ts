import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'
import type { OpenCodeCursor } from '../watermark.js'

export interface KiloImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: OpenCodeCursor | null
  exchangeRate?: number
}

export interface KiloImportResult {
  records: StatsRecord[]
  nextCursor: OpenCodeCursor | null
  errors: string[]
}

interface KiloMessageRow {
  id: string
  session_id: string
  time_created: number
  data: string
}

interface KiloMessageData {
  role?: string
  mode?: string
  agent?: string
  modelID?: string
  providerID?: string
  cost?: number
  finish?: string
  error?: { name?: string }
  path?: {
    cwd?: string
    root?: string
  }
  time?: {
    created?: number
    completed?: number
  }
  tokens?: {
    total?: number
    input?: number
    output?: number
    reasoning?: number
    cache?: {
      read?: number
      write?: number
    }
  }
}

export function runParseKilo(
  db: Database.Database,
  options: KiloImportOptions,
): KiloImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  let lastCursor: OpenCodeCursor | null = null

  const messages = db.prepare(
    `SELECT id, session_id, time_created, data
     FROM message
     WHERE time_created > ? OR (time_created = ? AND id > ?)
     ORDER BY time_created, id`,
  ).all(
    cursor?.lastMessageCreatedAt ?? 0,
    cursor?.lastMessageCreatedAt ?? 0,
    cursor?.lastMessageId ?? '',
  ) as KiloMessageRow[]

  for (const message of messages) {
    lastCursor = {
      lastMessageCreatedAt: message.time_created,
      lastMessageId: message.id,
    }

    let parsed: KiloMessageData
    try {
      parsed = JSON.parse(message.data) as KiloMessageData
    } catch (e) {
      errors.push(`message ${message.id}: invalid JSON: ${e instanceof Error ? e.message : e}`)
      continue
    }

    if (parsed.role !== 'assistant' || !parsed.tokens) continue

    const inputTokens = parsed.tokens.input ?? 0
    const outputTokens = parsed.tokens.output ?? 0
    const thinkingTokens = parsed.tokens.reasoning ?? 0
    const cacheReadTokens = parsed.tokens.cache?.read ?? 0
    const cacheWriteTokens = parsed.tokens.cache?.write ?? 0

    if (inputTokens === 0 && outputTokens === 0 && thinkingTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0) continue

    const ts = parsed.time?.completed ?? parsed.time?.created ?? message.time_created
    const model = parsed.modelID ?? 'unknown'
    const provider = parsed.providerID ?? inferProvider(model)
    const cwd = parsed.path?.cwd ?? ''
    const recordId = generateRecordId(deviceInstanceId, `${dbPath}:${message.id}`, message.time_created)

    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
    const calculatedCost = model !== 'unknown' ? calculateCost(model, tokenArgs, exchangeRate) : 0
    const logCostValid = parsed.cost != null && parsed.cost > 0
    const cost = logCostValid ? parsed.cost : calculatedCost
    const costSource: StatsRecord['costSource'] = logCostValid ? 'log' : calculatedCost > 0 ? 'pricing' : 'unknown'

    records.push({
      id: recordId,
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'kilocode',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost,
      costSource,
      sessionId: message.session_id,
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
      cwd,
    })
  }

  return { records, nextCursor: records.length > 0 ? lastCursor : null, errors }
}
