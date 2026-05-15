import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { generateSyncRecordId, generateSessionKey } from '@aiusage/core'

export function mapStatsRecordToSyncRecord(record: StatsRecord): SyncRecord {
  // Records merged from synced_records have source_file='synced/<deviceId>' and lineOffset=0,
  // which would cause all records from the same device to collide to one ID.
  // Use the existing record ID directly for these — it's already a valid sync record ID.
  // OpenCode records are sourced from a SQLite DB; lineOffset=0 is a sentinel with no
  // positional meaning, so generateSyncRecordId would produce the same ID for every
  // message. Use record.id directly since it already encodes the unique message ID.
  const id = record.sourceFile.startsWith('synced/')
    ? record.id
    : record.tool === 'opencode'
      ? record.id
      : generateSyncRecordId(record.deviceInstanceId, record.sourceFile, record.lineOffset)
  return {
    id,
    ts: record.ts,
    tool: record.tool,
    model: record.model,
    provider: record.provider,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    thinkingTokens: record.thinkingTokens,
    cost: record.cost,
    costSource: record.costSource,
    sessionKey: generateSessionKey(record.device, record.sessionId),
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    platform: record.platform,
    updatedAt: record.updatedAt,
  }
}
