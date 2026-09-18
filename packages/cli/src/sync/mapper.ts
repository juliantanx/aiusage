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
  // Parser-generated ids are the only unique key for these: several Antigravity
  // usage events share one generation index (their lineOffset), and every Trae
  // session in a database shares offset 0, so (device, sourceFile, lineOffset)
  // collapses distinct records into one wire id.
  'antigravity',
  'trae',
])

/**
 * True for tools whose wire id is derived from `(deviceInstanceId, sourceFile,
 * lineOffset)` rather than taken from the parser. Their wire id changes when
 * the device id stamped on the row changes (see `backfillUnknownDeviceInstanceId`).
 */
export function usesGeneratedWireId(tool: Tool): boolean {
  return !RECORD_ID_SYNC_TOOLS.has(tool)
}

export function mapStatsRecordToSyncRecord(record: StatsRecord): SyncRecord {
  // Records merged from synced_records already carry their wire-format id and
  // have lineOffset=0, so regenerating the id from (device, sourceFile, 0)
  // would collapse every record of a source file into one id. Their
  // provenance is the explicit `origin` flag — never the source_file value.
  // (Such records are never uploaded; this keeps the id stable if they are
  // ever mapped, e.g. for export.)
  // Several imports use database rows or JSON-array indexes, where lineOffset is not a
  // stable byte position. Use record.id because those parsers already encode row/session identity.
  const id = record.origin === 'synced'
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
