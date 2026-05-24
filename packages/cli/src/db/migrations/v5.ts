import type Database from 'better-sqlite3'

export function migrateV5(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info('records')").all() as Array<{ name: string }>
  if (!columns.some(c => c.name === 'cwd')) {
    db.exec(`ALTER TABLE records ADD COLUMN cwd TEXT NOT NULL DEFAULT ''`)
  }
  db.prepare('INSERT INTO schema_version (version) VALUES (5)').run()
}
