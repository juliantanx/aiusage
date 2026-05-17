import type Database from 'better-sqlite3'
import type { Config } from '../config.js'

export interface RuntimeSettingsControllerOptions {
  db: Database.Database
  loadConfig: () => Config | null
  runParse: (db: Database.Database) => Promise<unknown>
  runCleanup: (db: Database.Database, retentionDays: number) => unknown
  cleanupIntervalMs?: number
}

const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export class RuntimeSettingsController {
  private readonly db: Database.Database
  private readonly loadConfigFn: RuntimeSettingsControllerOptions['loadConfig']
  private readonly runParseFn: RuntimeSettingsControllerOptions['runParse']
  private readonly runCleanupFn: RuntimeSettingsControllerOptions['runCleanup']
  private readonly cleanupIntervalMs: number
  private parseTimer: ReturnType<typeof setInterval> | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private parseInFlight = false
  private started = false

  constructor(options: RuntimeSettingsControllerOptions) {
    this.db = options.db
    this.loadConfigFn = options.loadConfig
    this.runParseFn = options.runParse
    this.runCleanupFn = options.runCleanup
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.applyConfig()
  }

  reload(): void {
    if (!this.started) return
    this.applyConfig()
  }

  stop(): void {
    this.started = false
    if (this.parseTimer) clearInterval(this.parseTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.parseTimer = null
    this.cleanupTimer = null
  }

  private applyConfig(): void {
    if (this.parseTimer) clearInterval(this.parseTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.parseTimer = null
    this.cleanupTimer = null

    const config = this.loadConfigFn()
    const parseInterval = Number(config?.parseInterval ?? 0)
    const retentionDays = Number(config?.retentionDays ?? 0)

    if (parseInterval > 0) {
      this.parseTimer = setInterval(() => {
        void this.runParseSafely()
      }, parseInterval)
    }

    if (retentionDays > 0) {
      this.cleanupTimer = setInterval(() => {
        try {
          this.runCleanupFn(this.db, retentionDays)
        } catch (err) {
          // Keep scheduling active after individual cleanup failures.
          console.error('[settings-controller] cleanup failed:', err)
        }
      }, this.cleanupIntervalMs)
    }
  }

  private async runParseSafely(): Promise<void> {
    if (this.parseInFlight) return
    this.parseInFlight = true
    try {
      await this.runParseFn(this.db)
    } catch (err) {
      // Keep scheduling active after individual parse failures.
      console.error('[settings-controller] parse failed:', err)
    } finally {
      this.parseInFlight = false
    }
  }
}
