import type Database from 'better-sqlite3'
import type { Config } from '../config.js'

export interface RuntimeSettingsControllerOptions {
  db: Database.Database
  loadConfig: () => Config | null
  runParse: (db: Database.Database) => Promise<unknown>
  runCleanup: (db: Database.Database, retentionDays: number) => unknown | Promise<unknown>
  /** Resolves to `false` when there was nothing to upload. Rejects when the upload failed. */
  runLeaderboardUpload?: (db: Database.Database) => Promise<unknown>
  /** Time of the last successful leaderboard upload, kept across restarts. */
  getLastLeaderboardUploadAt?: () => number | undefined
  setLastLeaderboardUploadAt?: (ts: number) => void
  runSync?: () => void
  onSyncScheduleChanged?: (nextSyncAt: number | undefined) => void
  cleanupIntervalMs?: number
}

const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_LEADERBOARD_UPLOAD_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_LEADERBOARD_UPLOAD_INTERVAL_MS = 60 * 60 * 1000
const MIN_PARSE_INTERVAL_MS = 1000
const MIN_SYNC_INTERVAL_MS = 60 * 1000

/** A positive interval raised to `min`; 0, a negative or a non-number stays off (0). */
function atLeast(value: number, min: number): number {
  return Number.isFinite(value) && value > 0 ? Math.max(value, min) : 0
}
const LEADERBOARD_UPLOAD_RETRY_MS = 60 * 60 * 1000
// Node keeps a timer delay in a 32-bit signed integer. It replaces a longer
// delay with 1 ms, so a 30-day setInterval fires continuously.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

export class RuntimeSettingsController {
  private readonly db: Database.Database
  private readonly loadConfigFn: RuntimeSettingsControllerOptions['loadConfig']
  private readonly runParseFn: RuntimeSettingsControllerOptions['runParse']
  private readonly runCleanupFn: RuntimeSettingsControllerOptions['runCleanup']
  private readonly runLeaderboardUploadFn: RuntimeSettingsControllerOptions['runLeaderboardUpload']
  private readonly getLastLeaderboardUploadAtFn: RuntimeSettingsControllerOptions['getLastLeaderboardUploadAt']
  private readonly setLastLeaderboardUploadAtFn: RuntimeSettingsControllerOptions['setLastLeaderboardUploadAt']
  private readonly runSyncFn: RuntimeSettingsControllerOptions['runSync']
  private readonly onSyncScheduleChangedFn: RuntimeSettingsControllerOptions['onSyncScheduleChanged']
  private readonly cleanupIntervalMs: number
  private parseTimer: ReturnType<typeof setInterval> | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private leaderboardUploadTimer: ReturnType<typeof setTimeout> | null = null
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private parseInFlight = false
  private cleanupInFlight = false
  private leaderboardUploadInFlight = false
  private leaderboardUploadInterval: number | null = null
  private lastLeaderboardUploadAt = 0
  private leaderboardUploadRetryAt = 0
  private started = false

  constructor(options: RuntimeSettingsControllerOptions) {
    this.db = options.db
    this.loadConfigFn = options.loadConfig
    this.runParseFn = options.runParse
    this.runCleanupFn = options.runCleanup
    this.runLeaderboardUploadFn = options.runLeaderboardUpload
    this.getLastLeaderboardUploadAtFn = options.getLastLeaderboardUploadAt
    this.setLastLeaderboardUploadAtFn = options.setLastLeaderboardUploadAt
    this.runSyncFn = options.runSync
    this.onSyncScheduleChangedFn = options.onSyncScheduleChanged
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
    if (this.leaderboardUploadTimer) clearTimeout(this.leaderboardUploadTimer)
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.parseTimer = null
    this.cleanupTimer = null
    this.leaderboardUploadTimer = null
    this.syncTimer = null
    this.leaderboardUploadInterval = null
  }

  /**
   * Tells the schedule about a leaderboard upload made outside it, such as one
   * started from the dashboard, so the next automatic upload comes one
   * interval after that one.
   */
  noteLeaderboardUpload(uploadedAt: number): void {
    // A time kept from before the clock was set back is no longer valid, so the new one replaces it.
    if (Number.isFinite(uploadedAt) && (uploadedAt > this.lastLeaderboardUploadAt || this.lastLeaderboardUploadAt > Date.now())) {
      this.lastLeaderboardUploadAt = uploadedAt
    }
    this.leaderboardUploadRetryAt = 0
    this.scheduleLeaderboardUpload()
  }

  private applyConfig(): void {
    if (this.parseTimer) clearInterval(this.parseTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    if (this.leaderboardUploadTimer) clearTimeout(this.leaderboardUploadTimer)
    if (this.syncTimer) clearInterval(this.syncTimer)
    this.parseTimer = null
    this.cleanupTimer = null
    this.leaderboardUploadTimer = null
    this.syncTimer = null

    const config = this.loadConfigFn()
    // The floors PUT /api/config enforces, applied here as well: releases
    // before it saved any value, and a refresh interval of 30 ms parsed back
    // to back.
    const parseInterval = atLeast(Number(config?.refreshInterval ?? config?.parseInterval ?? 0), MIN_PARSE_INTERVAL_MS)
    const retentionDays = Number(config?.retentionDays ?? 0)
    const leaderboardUploadInterval = Number(config?.leaderboardUploadInterval ?? DEFAULT_LEADERBOARD_UPLOAD_INTERVAL_MS)

    if (parseInterval > 0) {
      this.parseTimer = setInterval(() => {
        void this.runParseSafely()
      }, Math.min(parseInterval, MAX_TIMER_DELAY_MS))
    }

    if (retentionDays > 0) {
      this.cleanupTimer = setInterval(() => {
        void this.runCleanupSafely(retentionDays)
      }, this.cleanupIntervalMs)
    }

    if (config?.leaderboardAutoUpload === true && Number.isFinite(leaderboardUploadInterval) && leaderboardUploadInterval > 0 && this.runLeaderboardUploadFn) {
      this.leaderboardUploadInterval = Math.max(leaderboardUploadInterval, MIN_LEADERBOARD_UPLOAD_INTERVAL_MS)
    } else {
      this.leaderboardUploadInterval = null
      this.leaderboardUploadRetryAt = 0
    }
    this.scheduleLeaderboardUpload()

    // The reported next sync time uses the same clamped delay as the timer.
    const syncInterval = Math.min(atLeast(Number(config?.syncInterval ?? 0), MIN_SYNC_INTERVAL_MS), MAX_TIMER_DELAY_MS)
    if (syncInterval > 0 && config?.sync?.backend && this.runSyncFn) {
      const updateNextSyncAt = () => {
        this.onSyncScheduleChangedFn?.(Date.now() + syncInterval)
      }
      updateNextSyncAt()
      this.syncTimer = setInterval(() => {
        this.runSyncFn!()
        updateNextSyncAt()
      }, syncInterval)
    } else {
      this.onSyncScheduleChangedFn?.(undefined)
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

  private async runCleanupSafely(retentionDays: number): Promise<void> {
    if (this.cleanupInFlight) return
    this.cleanupInFlight = true
    try {
      await this.runCleanupFn(this.db, retentionDays)
    } catch (err) {
      // Keep scheduling active after individual cleanup failures.
      console.error('[settings-controller] cleanup failed:', err)
    } finally {
      this.cleanupInFlight = false
    }
  }

  // The upload is due one interval after the last successful one. That time is
  // stored, so a config save or a restart continues the wait instead of
  // starting it again, and an upload that came due while stopped runs on start.
  private scheduleLeaderboardUpload(): void {
    if (this.leaderboardUploadTimer) clearTimeout(this.leaderboardUploadTimer)
    this.leaderboardUploadTimer = null
    // An upload in flight schedules the next one when it settles.
    if (!this.started || this.leaderboardUploadInterval == null || this.leaderboardUploadInFlight) return

    // A wait longer than one timer can hold is split into a chain of timers.
    const delay = Math.min(this.getLeaderboardUploadDelay(this.leaderboardUploadInterval), MAX_TIMER_DELAY_MS)
    this.leaderboardUploadTimer = setTimeout(() => {
      this.leaderboardUploadTimer = null
      if (this.leaderboardUploadInterval == null) return
      if (this.getLeaderboardUploadDelay(this.leaderboardUploadInterval) > 0) {
        this.scheduleLeaderboardUpload()
        return
      }
      void this.runLeaderboardUploadSafely()
    }, delay)
  }

  private getLeaderboardUploadDelay(interval: number): number {
    const now = Date.now()
    const lastUploadAt = this.getLastLeaderboardUploadAt(now)
    const untilDue = lastUploadAt == null ? 0 : lastUploadAt + interval - now
    // A retry time set while the clock was ahead would outlast its hour once
    // the clock is corrected. Pull it back to an hour from now.
    if (this.leaderboardUploadRetryAt - now > LEADERBOARD_UPLOAD_RETRY_MS) {
      this.leaderboardUploadRetryAt = now + LEADERBOARD_UPLOAD_RETRY_MS
    }
    return Math.max(0, untilDue, this.leaderboardUploadRetryAt - now)
  }

  private getLastLeaderboardUploadAt(now: number): number | undefined {
    let stored: unknown
    try {
      stored = this.getLastLeaderboardUploadAtFn?.()
    } catch (err) {
      console.error('[settings-controller] reading the last leaderboard upload time failed:', err)
    }
    // A time in the future comes from a clock that was wrong when it was
    // stored. Waiting on it could postpone the upload indefinitely. Each
    // source is checked on its own, so a bad stored time cannot hide the one
    // kept in memory.
    const lastUploadAt = Math.max(0, ...[stored, this.lastLeaderboardUploadAt].filter(
      (ts): ts is number => typeof ts === 'number' && Number.isFinite(ts) && ts > 0 && ts <= now,
    ))
    return lastUploadAt > 0 ? lastUploadAt : undefined
  }

  private async runLeaderboardUploadSafely(): Promise<void> {
    if (this.leaderboardUploadInFlight) return
    this.leaderboardUploadInFlight = true
    let uploaded = false
    let skipped = false
    try {
      await this.runParseFn(this.db)
      // The parse can wait behind other work. A manual upload may have landed
      // meanwhile, or auto upload may have been turned off.
      const interval = this.leaderboardUploadInterval
      skipped = interval == null || this.getLeaderboardUploadDelay(interval) > 0
      if (!skipped) uploaded = (await this.runLeaderboardUploadFn?.(this.db)) !== false
    } catch (err) {
      // Keep scheduling active after individual upload failures.
      console.error('[settings-controller] leaderboard upload failed:', err)
    } finally {
      this.leaderboardUploadInFlight = false
    }

    const now = Date.now()
    if (skipped) {
      // Nothing was attempted, so there is nothing to store or to retry.
    } else if (uploaded) {
      this.leaderboardUploadRetryAt = 0
      // Kept in memory as well, so a failed write cannot make the upload due again at once.
      this.lastLeaderboardUploadAt = now
      try {
        this.setLastLeaderboardUploadAtFn?.(now)
      } catch (err) {
        console.error('[settings-controller] storing the last leaderboard upload time failed:', err)
      }
    } else {
      // Nothing is stored for a failed or empty upload, so it stays due. Wait before trying again.
      this.leaderboardUploadRetryAt = now + LEADERBOARD_UPLOAD_RETRY_MS
    }
    this.scheduleLeaderboardUpload()
  }
}
