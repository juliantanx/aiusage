import type Database from 'better-sqlite3'

export function migrateV9(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_record_state (
      record_id  TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      target     TEXT NOT NULL,
      synced_at  INTEGER NOT NULL,
      PRIMARY KEY (record_id, target)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_record_state_target
      ON sync_record_state(target, synced_at);

    INSERT INTO schema_version (version) VALUES (9);
  `)
}
