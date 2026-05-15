import type Database from 'better-sqlite3'

export function migrateV4(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info('records')").all() as Array<{ name: string }>
  if (!columns.some(c => c.name === 'platform')) {
    db.exec(`ALTER TABLE records ADD COLUMN platform TEXT NOT NULL DEFAULT ''`)
  }
  db.prepare('INSERT INTO schema_version (version) VALUES (4)').run()
}
