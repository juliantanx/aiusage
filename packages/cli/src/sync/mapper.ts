import type { StatsRecord, SyncRecord } from '@aiusage/core'
import { generateSyncRecordId, generateSessionKey } from '@aiusage/core'

export function mapStatsRecordToSyncRecord(record: StatsRecord): SyncRecord {
  return {
    id: generateSyncRecordId(record.deviceInstanceId, record.sourceFile, record.lineOffset),
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
