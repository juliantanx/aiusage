import type Database from 'better-sqlite3'

export function migrateV7(db: Database.Database): void {
  // Local aggregate cache for dashboard performance
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_daily_aggregates (
      day TEXT NOT NULL,
      device_instance_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      thinking_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      record_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (day, device_instance_id, tool, model)
    )
  `)

  // Dashboard query cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_query_cache (
      cache_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      source_max_updated_at INTEGER NOT NULL,
      generated_at INTEGER NOT NULL
    )
  `)

  // Indexes for aggregate queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_usage_daily_day ON usage_daily_aggregates(day);
    CREATE INDEX IF NOT EXISTS idx_usage_daily_tool ON usage_daily_aggregates(tool, day);
    CREATE INDEX IF NOT EXISTS idx_usage_daily_device ON usage_daily_aggregates(device_instance_id, day);
  `)

  db.prepare('INSERT INTO schema_version (version) VALUES (7)').run()
}
