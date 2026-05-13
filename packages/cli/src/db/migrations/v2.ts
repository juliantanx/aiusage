import type Database from 'better-sqlite3'

export function migrateV2(db: Database.Database): void {
  // Add platform column to synced_records for OS type tracking
  db.exec(`ALTER TABLE synced_records ADD COLUMN platform TEXT NOT NULL DEFAULT ''`)

  db.prepare('INSERT INTO schema_version (version) VALUES (2)').run()
}
