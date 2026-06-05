import type Database from 'better-sqlite3'

export function migrateV8(db: Database.Database): void {
  // Composite indexes for dashboard aggregate queries (§11.2)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_records_tool_ts ON records(tool, ts);
    CREATE INDEX IF NOT EXISTS idx_records_model_ts ON records(model, ts);
    CREATE INDEX IF NOT EXISTS idx_records_device_ts ON records(device_instance_id, ts);
    CREATE INDEX IF NOT EXISTS idx_records_session_ts ON records(session_id, ts);

    CREATE INDEX IF NOT EXISTS idx_synced_records_device_ts ON synced_records(device_instance_id, ts);
    CREATE INDEX IF NOT EXISTS idx_synced_records_tool_ts ON synced_records(tool, ts);
    CREATE INDEX IF NOT EXISTS idx_synced_records_model_ts ON synced_records(model, ts);
  `)

  db.prepare('INSERT INTO schema_version (version) VALUES (8)').run()
}
