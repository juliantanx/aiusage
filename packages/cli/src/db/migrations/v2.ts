import type Database from 'better-sqlite3'

export function migrateV2(db: Database.Database): void {
  // Add platform column to synced_records for OS type tracking
  const columns = db.prepare("PRAGMA table_info('synced_records')").all() as Array<{ name: string }>
  if (!columns.some(column => column.name === 'platform')) {
    db.exec(`ALTER TABLE synced_records ADD COLUMN platform TEXT NOT NULL DEFAULT ''`)
  }

  db.prepare('INSERT INTO schema_version (version) VALUES (2)').run()
}
