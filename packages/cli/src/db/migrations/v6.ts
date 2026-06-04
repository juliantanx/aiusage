import type Database from 'better-sqlite3'

export function migrateV6(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info('synced_records')").all() as Array<{ name: string }>
  if (!columns.some(c => c.name === 'source_file')) {
    db.exec(`ALTER TABLE synced_records ADD COLUMN source_file TEXT NOT NULL DEFAULT ''`)
  }
  if (!columns.some(c => c.name === 'cwd')) {
    db.exec(`ALTER TABLE synced_records ADD COLUMN cwd TEXT NOT NULL DEFAULT ''`)
  }
  db.prepare('INSERT INTO schema_version (version) VALUES (6)').run()
}
