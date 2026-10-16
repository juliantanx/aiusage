import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

/** How long a writer waits for another process to finish its update. */
export const SETTINGS_LOCK_TIMEOUT_MS = 10_000

/** The settings lock was not free within the timeout. Nothing was written. */
export class SettingsLockTimeoutError extends Error {
  constructor(public readonly path: string, timeoutMs: number) {
    super(`Another aiusage process kept ${path} locked for more than ${Math.round(timeoutMs / 1000)} seconds, so the settings were not saved. Try again.`)
    this.name = 'SettingsLockTimeoutError'
  }
}

// Locks this process holds, by lock file, with their nesting depth.
const held = new Map<string, number>()

/**
 * Run `fn` holding the lock that serializes changes to `state.json` and
 * `config.json` in `aiusageDir` across processes (`aiusage serve` and every
 * CLI command are separate processes, and each file is rewritten whole). A
 * writer reads the file, changes it and writes it back inside `fn`, so no
 * other process can write between its read and its write.
 *
 * The lock is an exclusive SQLite transaction on a file of its own, as in
 * `sync/cloud-lock.ts`: the operating system's file lock behind it is taken
 * atomically on Windows, macOS and Linux and goes away with a process that
 * crashes, so there is no stale lock to detect. Another process waits up to
 * `timeoutMs`, then gets `SettingsLockTimeoutError`. Nothing is ever written
 * to the lock file.
 *
 * The lock is re-entrant within a process (saving the config and then the
 * consent in state.json is one update). `fn` must be synchronous: the lock
 * is held only until it returns.
 */
export function withSettingsLock<T>(aiusageDir: string, fn: () => T, timeoutMs = SETTINGS_LOCK_TIMEOUT_MS): T {
  const lockPath = resolve(join(aiusageDir, 'settings.lock'))
  const depth = held.get(lockPath) ?? 0
  if (depth > 0) {
    held.set(lockPath, depth + 1)
    try {
      return checkSynchronous(fn())
    } finally {
      held.set(lockPath, depth)
    }
  }

  mkdirSync(aiusageDir, { recursive: true, mode: 0o700 })
  const lockDb = new Database(lockPath, { timeout: timeoutMs })
  try {
    try {
      lockDb.exec('BEGIN EXCLUSIVE')
    } catch (error) {
      const code = (error as { code?: string }).code
      if (typeof code === 'string' && code.startsWith('SQLITE_BUSY')) throw new SettingsLockTimeoutError(lockPath, timeoutMs)
      throw error
    }
    held.set(lockPath, 1)
    try {
      return checkSynchronous(fn())
    } finally {
      held.delete(lockPath)
      lockDb.exec('ROLLBACK')
    }
  } finally {
    lockDb.close()
  }
}

function checkSynchronous<T>(result: T): T {
  if (result != null && typeof (result as { then?: unknown }).then === 'function') {
    throw new TypeError('withSettingsLock needs a synchronous function: the lock is released when it returns')
  }
  return result
}
