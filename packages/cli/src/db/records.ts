import type Database from 'better-sqlite3'
import type { StatsRecord } from '@aiusage/core'

export function insertRecord(db: Database.Database, record: StatsRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO records (
      id, ts, ingested_at, synced_at, updated_at, line_offset,
      tool, model, provider, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, thinking_tokens,
      cost, cost_source, session_id, source_file, device, device_instance_id, platform
    ) VALUES (
      @id, @ts, @ingestedAt, @syncedAt, @updatedAt, @lineOffset,
      @tool, @model, @provider, @inputTokens, @outputTokens,
      @cacheReadTokens, @cacheWriteTokens, @thinkingTokens,
      @cost, @costSource, @sessionId, @sourceFile, @device, @deviceInstanceId, @platform
    )
  `).run({
    id: record.id,
    ts: record.ts,
    ingestedAt: record.ingestedAt,
    syncedAt: record.syncedAt ?? null,
    updatedAt: record.updatedAt,
    lineOffset: record.lineOffset,
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
    sessionId: record.sessionId,
    sourceFile: record.sourceFile,
    device: record.device,
    deviceInstanceId: record.deviceInstanceId,
    platform: record.platform ?? '',
  })
}

export function getRecordById(db: Database.Database, id: string): StatsRecord | null {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return mapRowToRecord(row)
}

export function getRecordsBySourceFile(db: Database.Database, sourceFile: string): StatsRecord[] {
  const rows = db.prepare('SELECT * FROM records WHERE source_file = ?').all(sourceFile) as Record<string, unknown>[]
  return rows.map(mapRowToRecord)
}

export function deleteRecordsBySourceFile(db: Database.Database, sourceFile: string): number {
  const result = db.prepare('DELETE FROM records WHERE source_file = ?').run(sourceFile)
  return result.changes
}

export function getUnsyncedRecords(db: Database.Database): StatsRecord[] {
  const rows = db.prepare(
    'SELECT * FROM records WHERE synced_at IS NULL OR updated_at > synced_at'
  ).all() as Record<string, unknown>[]
  return rows.map(mapRowToRecord)
}

function mapRowToRecord(row: Record<string, unknown>): StatsRecord {
  return {
    id: row.id as string,
    ts: row.ts as number,
    ingestedAt: row.ingested_at as number,
    syncedAt: row.synced_at != null ? (row.synced_at as number) : undefined,
    updatedAt: row.updated_at as number,
    lineOffset: row.line_offset as number,
    tool: row.tool as StatsRecord['tool'],
    model: row.model as string,
    provider: row.provider as string,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    cacheReadTokens: row.cache_read_tokens as number,
    cacheWriteTokens: row.cache_write_tokens as number,
    thinkingTokens: row.thinking_tokens as number,
    cost: row.cost as number,
    costSource: row.cost_source as StatsRecord['costSource'],
    sessionId: row.session_id as string,
    sourceFile: row.source_file as string,
    device: row.device as string,
    deviceInstanceId: row.device_instance_id as string,
    platform: (row.platform as string) || undefined,
  }
}
