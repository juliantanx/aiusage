import type Database from 'better-sqlite3'
import type { Config } from '../config.js'

export interface RuntimeSettingsControllerOptions {
  db: Database.Database
  loadConfig: () => Config | null
  runParse: (db: Database.Database) => Promise<unknown>
  runCleanup: (db: Database.Database, retentionDays: number) => unknown
  runLeaderboardUpload?: (db: Database.Database) => Promise<unknown>
  runSync?: () => void
  cleanupIntervalMs?: number
}

const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_LEADERBOARD_UPLOAD_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

export class RuntimeSettingsController {
  private readonly db: Database.Database
  private readonly loadConfigFn: RuntimeSettingsControllerOptions['loadConfig']
  private readonly runParseFn: RuntimeSettingsControllerOptions['runParse']
  private readonly runCleanupFn: RuntimeSettingsControllerOptions['runCleanup']
  private readonly runLeaderboardUploadFn: RuntimeSettingsControllerOptions['runLeaderboardUpload']
  private readonly runSyncFn: RuntimeSettingsControllerOptions['runSync']
  private readonly cleanupIntervalMs: number
  private parseTimer: ReturnType<typeof setInterval> | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private leaderboardUploadTimer: ReturnType<typeof setInterval> | null = null
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private parseInFlight = false
  private leaderboardUploadInFlight = false
  private started = false

  constructor(options: RuntimeSettingsControllerOptions) {
    this.db = options.db
    this.loadConfigFn = options.loadConfig
    this.runParseFn = options.runParse
    this.runCleanupFn = options.runCleanup
    this.runLeaderboardUploadFn = options.runLeaderboardUpload
    this.runSyncFn = options.runSync
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
    if (this.leaderboardUploadTimer) clearInterval(this.leaderboardUploadTimer)
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.parseTimer = null
    this.cleanupTimer = null
    this.leaderboardUploadTimer = null
    this.syncTimer = null
  }

  private applyConfig(): void {
    if (this.parseTimer) clearInterval(this.parseTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    if (this.leaderboardUploadTimer) clearInterval(this.leaderboardUploadTimer)
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.parseTimer = null
    this.cleanupTimer = null
    this.leaderboardUploadTimer = null
    this.syncTimer = null

    const config = this.loadConfigFn()
    const parseInterval = Number(config?.refreshInterval ?? config?.parseInterval ?? 0)
    const retentionDays = Number(config?.retentionDays ?? 0)
    const leaderboardUploadInterval = Number(config?.leaderboardUploadInterval ?? DEFAULT_LEADERBOARD_UPLOAD_INTERVAL_MS)

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

    if (config?.leaderboardAutoUpload === true && leaderboardUploadInterval > 0 && this.runLeaderboardUploadFn) {
      this.leaderboardUploadTimer = setInterval(() => {
        void this.runLeaderboardUploadSafely()
      }, leaderboardUploadInterval)
    }

    const syncInterval = Number(config?.syncInterval ?? 0)
    if (syncInterval > 0 && config?.sync?.backend && this.runSyncFn) {
      this.syncTimer = setInterval(() => {
        this.runSyncFn!()
      }, syncInterval)
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

  private async runLeaderboardUploadSafely(): Promise<void> {
    if (this.leaderboardUploadInFlight) return
    this.leaderboardUploadInFlight = true
    try {
      await this.runParseFn(this.db)
      await this.runLeaderboardUploadFn?.(this.db)
    } catch (err) {
      // Keep scheduling active after individual upload failures.
      console.error('[settings-controller] leaderboard upload failed:', err)
    } finally {
      this.leaderboardUploadInFlight = false
    }
  }
}
