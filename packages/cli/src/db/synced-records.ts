import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'

export function insertSyncedRecord(db: Database.Database, record: SyncRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO synced_records (
      id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_key, device, device_instance_id, updated_at
    ) VALUES (
      @id, @ts, @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionKey, @device, @deviceInstanceId, @updatedAt
    )
  `).run({
    id: record.id,
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
    sessionKey: record.sessionKey,
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    updatedAt: record.updatedAt,
  })
}

export function getSyncedRecordById(db: Database.Database, id: string): SyncRecord | null {
  const row = db.prepare('SELECT * FROM synced_records WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return mapRowToSyncRecord(row)
}

export function upsertSyncedRecord(db: Database.Database, record: SyncRecord): void {
  const existing = getSyncedRecordById(db, record.id)
  if (!existing || record.updatedAt > existing.updatedAt) {
    insertSyncedRecord(db, record)
  }
}

function mapRowToSyncRecord(row: Record<string, unknown>): SyncRecord {
  return {
    id: row.id as string,
    ts: row.ts as number,
    tool: row.tool as SyncRecord['tool'],
    model: row.model as string,
    provider: row.provider as string,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    cacheWriteTokens: row.cache_write_tokens as number,
    thinkingTokens: row.thinking_tokens as number,
    cost: row.cost as number,
    costSource: row.cost_source as SyncRecord['costSource'],
    sessionKey: row.session_key as string,
    device: row.device as string,
    deviceInstanceId: row.device_instance_id as string,
    updatedAt: row.updated_at as number,
  }
}
