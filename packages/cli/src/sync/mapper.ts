import type { StatsRecord, SyncRecord } from '@aiusage/core'
import type { Tool } from '@aiusage/core'
import { generateSyncRecordId, generateSessionKey } from '@aiusage/core'

const RECORD_ID_SYNC_TOOLS = new Set<Tool>([
  'opencode',
  'hermes',
  'qoder',
  'cursor',
  'kilocode',
  'kelivo',
  'goose',
  'zed',
  'kiro',
  'roocode',
  'zcode',
  'codefuse',
])

export function mapStatsRecordToSyncRecord(record: StatsRecord): SyncRecord {
  // Records merged from synced_records have source_file='synced/<deviceId>' and lineOffset=0,
  // which would cause all records from the same device to collide to one ID.
  // Use the existing record ID directly for these — it's already a valid sync record ID.
  // Several imports use database rows or JSON-array indexes, where lineOffset is not a
  // stable byte position. Use record.id because those parsers already encode row/session identity.
  const id = record.sourceFile.startsWith('synced/')
    ? record.id
    : RECORD_ID_SYNC_TOOLS.has(record.tool)
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
    sourceFile: record.sourceFile,
    cwd: record.cwd,
  }
}
