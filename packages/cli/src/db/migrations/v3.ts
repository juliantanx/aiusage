import type Database from 'better-sqlite3'
import { createReadonlyViews } from '../schema.js'

export function migrateV3(db: Database.Database): void {
  createReadonlyViews(db)
  db.prepare('INSERT INTO schema_version (version) VALUES (3)').run()
}
