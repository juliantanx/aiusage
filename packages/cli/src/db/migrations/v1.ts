import type Database from 'better-sqlite3'
import { createV1Schema } from '../schema.js'

export function migrateV1(db: Database.Database): void {
  createV1Schema(db)
  db.prepare('INSERT INTO schema_version (version) VALUES (1)').run()
}
