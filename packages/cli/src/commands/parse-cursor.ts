import type Database from 'better-sqlite3'
import type { StatsRecord, ToolCallRecord } from '@aiusage/core'
import { generateRecordId } from '@aiusage/core'
import type { CursorCursor } from '../watermark.js'

export interface CursorImportOptions {
  dbPath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor: CursorCursor | null
}

export interface CursorImportResult {
  records: StatsRecord[]
  toolCalls: ToolCallRecord[]
  nextCursor: CursorCursor | null
  errors: string[]
}

interface ComposerRow {
  key: string
  value: string
}

interface ComposerData {
  composerId: string
  createdAt: number
  usageData?: {
    default?: {
      costInCents?: number
      amount?: number
    }
  }
}

interface BubbleTokenCount {
  inputTokens: number
  outputTokens: number
}

interface BubbleData {
  type: number          // 1 = user, 2 = assistant
  tokenCount?: BubbleTokenCount
}

export function runParseCursor(
  db: Database.Database,
  options: CursorImportOptions,
): CursorImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, cursor } = options
  const records: StatsRecord[] = []
  const toolCalls: ToolCallRecord[] = []
  const errors: string[] = []
  let lastCursor: CursorCursor | null = null

  // Fetch all composerData entries with content
  const composerRows = db
    .prepare(`SELECT key, CAST(value AS TEXT) as value FROM cursorDiskKV WHERE key LIKE 'composerData:%' AND length(value) > 100`)
    .all() as ComposerRow[]

  // Parse and filter composerData entries
  const composers: ComposerData[] = []
  for (const row of composerRows) {
    try {
      const j = JSON.parse(row.value)
      const composerId = row.key.slice('composerData:'.length)
      const createdAt: number = j.createdAt ?? 0
      if (!createdAt) continue

      composers.push({
        composerId,
        createdAt,
        usageData: j.usageData,
      })
    } catch {
      // Skip malformed entries
    }
  }

  // Sort by createdAt asc, then composerId asc (for stable ordering)
  composers.sort((a, b) =>
    a.createdAt !== b.createdAt
      ? a.createdAt - b.createdAt
      : a.composerId.localeCompare(b.composerId),
  )

  // Apply cursor filter: skip already-processed conversations
  const filtered = cursor
    ? composers.filter(
        (c) =>
          c.createdAt > cursor.lastCreatedAt ||
          (c.createdAt === cursor.lastCreatedAt && c.composerId > cursor.lastId),
      )
    : composers

  if (filtered.length === 0) {
    return { records, toolCalls, nextCursor: lastCursor, errors }
  }

  // Prepare statement to fetch all bubbles for a composer
  const bubbleStmt = db.prepare(
    `SELECT CAST(value AS TEXT) as value FROM cursorDiskKV WHERE key LIKE ?`,
  )

  for (const composer of filtered) {
    lastCursor = { lastCreatedAt: composer.createdAt, lastId: composer.composerId }

    try {
      // Fetch all bubble entries for this conversation
      const bubbleRows = bubbleStmt.all(`bubbleId:${composer.composerId}:%`) as { value: string }[]

      let totalInputTokens = 0
      let totalOutputTokens = 0

      for (const row of bubbleRows) {
        try {
          const bubble: BubbleData = JSON.parse(row.value)
          // Only count assistant (type=2) bubbles with actual token data
          if (bubble.type !== 2) continue
          const tc = bubble.tokenCount
          if (!tc) continue
          totalInputTokens += tc.inputTokens ?? 0
          totalOutputTokens += tc.outputTokens ?? 0
        } catch {
          // Skip malformed bubble entries
        }
      }

      // Skip conversations with no token data
      if (totalInputTokens === 0 && totalOutputTokens === 0) continue

      const ts = composer.createdAt

      // Determine cost from usageData.default.costInCents
      let cost = 0
      let costSource: StatsRecord['costSource'] = 'unknown'
      const defaultUsage = composer.usageData?.default
      if (defaultUsage?.costInCents != null && defaultUsage.costInCents > 0) {
        cost = defaultUsage.costInCents / 100
        costSource = 'log'
      }

      const recordId = generateRecordId(deviceInstanceId, `${dbPath}:${composer.composerId}`, ts)

      const record: StatsRecord = {
        id: recordId,
        ts,
        ingestedAt: now,
        updatedAt: now,
        lineOffset: 0,
        tool: 'cursor',
        model: 'cursor-composer',
        provider: 'cursor',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        thinkingTokens: 0,
        cost,
        costSource,
        sessionId: composer.composerId,
        sourceFile: dbPath,
        device,
        deviceInstanceId,
        platform,
      }

      records.push(record)
    } catch (e) {
      errors.push(`composerId ${composer.composerId}: ${e instanceof Error ? e.message : e}`)
    }
  }

  return { records, toolCalls, nextCursor: lastCursor, errors }
}
