import Database from 'better-sqlite3'
import { applyPragmas } from './schema.js'
import { runMigrations } from './migrations/index.js'

export function initializeDatabase(db: Database.Database): void {
  applyPragmas(db)
  runMigrations(db)
}

export function createDatabase(path: string): Database.Database {
  const db = new Database(path)
  initializeDatabase(db)
  return db
}
