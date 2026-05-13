import type Database from 'better-sqlite3'
import type { SyncRecord } from '@aiusage/core'

export function insertSyncedRecord(db: Database.Database, record: SyncRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO synced_records (
      id, ts, tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_key, device, device_instance_id, platform, updated_at
    ) VALUES (
      @id, @ts, @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionKey, @device, @deviceInstanceId, @platform, @updatedAt
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
    platform: record.platform ?? '',
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

/**
 * Merge synced_records into records table so API queries can see them.
 * Only inserts records that don't already exist in records.
 * Returns the number of newly inserted records.
 */
export function mergeSyncedRecordsIntoRecords(db: Database.Database): number {
  const now = Date.now()
  const newRows = db.prepare(`
    SELECT sr.* FROM synced_records sr
    LEFT JOIN records r ON sr.id = r.id
    WHERE r.id IS NULL
  `).all() as Record<string, unknown>[]

  if (newRows.length === 0) return 0

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO records (
      id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id
    ) VALUES (
      @id, @ts, @ingestedAt, @syncedAt, @updatedAt, 0,
      @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionId, @sourceFile, @device, @deviceInstanceId
    )
  `)

  const tx = db.transaction((rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      insertStmt.run({
        id: row.id,
        ts: row.ts,
        ingestedAt: now,
        syncedAt: now,
        updatedAt: row.updated_at,
        tool: row.tool,
        model: row.model,
        provider: row.provider,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        thinkingTokens: row.thinking_tokens,
        cost: row.cost,
        costSource: row.cost_source,
        sessionId: row.session_key,
        sourceFile: `synced/${row.device_instance_id}`,
        device: row.device,
        deviceInstanceId: row.device_instance_id,
      })
    }
  })

  tx(newRows)
  return newRows.length
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
