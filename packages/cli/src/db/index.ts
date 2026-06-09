import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { applyPragmas } from './schema.js'
import { runMigrations } from './migrations/index.js'
import { loadConfig } from '../config.js'
import { loadPricingRuntime } from '../pricing-registry.js'

export function initializeDatabase(db: Database.Database): void {
  applyPragmas(db)
  runMigrations(db)
  loadPricingRuntime(db, loadConfig())
}

export function createDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new Database(path)
  initializeDatabase(db)
  return db
}
