import Database from 'better-sqlite3'
import { mkdirSync, unlinkSync } from 'node:fs'
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

function removeCorruptedDb(path: string): void {
  for (const suffix of ['', '-shm', '-wal']) {
    try { unlinkSync(path + suffix) } catch {}
  }
}

export function createDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  try {
    const db = new Database(path)
    initializeDatabase(db)
    return db
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') {
      console.warn(`Database corrupted, recreating: ${path}`)
      removeCorruptedDb(path)
      const db = new Database(path)
      initializeDatabase(db)
      return db
    }
    throw err
  }
}
