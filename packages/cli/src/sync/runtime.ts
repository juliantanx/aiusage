import type { State } from '../init.js'

export type SyncPhase = 'pulling' | 'merging' | 'uploading' | 'finalizing'

export interface SyncProgress {
  phase: SyncPhase
  currentPath?: string
  completedFiles?: number
  totalFiles?: number
  pulledCount?: number
  uploadedCount?: number
}

export interface SyncRuntimeStatus {
  isRunning: boolean
  startedAt?: number
  phase?: SyncPhase
  currentPath?: string
  completedFiles?: number
  totalFiles?: number
  pulledCount?: number
  uploadedCount?: number
}

export interface SyncStatusSnapshot {
  isRunning: boolean
  startedAt?: number
  phase?: SyncPhase
  currentPath?: string
  completedFiles?: number
  totalFiles?: number
  pulledCount?: number
  uploadedCount?: number
  lastSyncAt?: number
  lastSyncStatus?: State['lastSyncStatus']
  lastSyncError?: string
  lastSyncTarget?: string
  lastSyncUploaded?: number
  lastSyncPulled?: number
  lastSyncDurationMs?: number
}

export interface SyncStartResult {
  accepted: boolean
  alreadyRunning: boolean
  status: SyncStatusSnapshot
}

interface SyncRuntimeOptions {
  runSync: (options: { onProgress?: (progress: SyncProgress) => void }) => Promise<void>
  getPersistedState: () => State | null
}

export class SyncRuntimeController {
  private readonly runSyncFn: SyncRuntimeOptions['runSync']
  private readonly getPersistedState: SyncRuntimeOptions['getPersistedState']
  private current: SyncRuntimeStatus = { isRunning: false }

  constructor(options: SyncRuntimeOptions) {
    this.runSyncFn = options.runSync
    this.getPersistedState = options.getPersistedState
  }

  start(): SyncStartResult {
    if (this.current.isRunning) {
      return {
        accepted: false,
        alreadyRunning: true,
        status: this.getStatus(),
      }
    }

    this.current = {
      isRunning: true,
      startedAt: Date.now(),
    }

    // Yield one tick so the HTTP handler can flush its response before sync work starts.
    setImmediate(() => {
      void this.runInBackground()
    })

    return {
      accepted: true,
      alreadyRunning: false,
      status: this.getStatus(),
    }
  }

  getStatus(): SyncStatusSnapshot {
    const persisted = this.getPersistedState()
    return {
      ...this.current,
      lastSyncAt: persisted?.lastSyncAt,
      lastSyncStatus: persisted?.lastSyncStatus,
      lastSyncError: persisted?.lastSyncError,
      lastSyncTarget: persisted?.lastSyncTarget,
      lastSyncUploaded: persisted?.lastSyncUploaded,
      lastSyncPulled: persisted?.lastSyncPulled,
      lastSyncDurationMs: persisted?.lastSyncDurationMs,
    }
  }

  private async runInBackground(): Promise<void> {
    try {
      await this.runSyncFn({
        onProgress: (progress) => {
          this.current = {
            ...this.current,
            isRunning: true,
            phase: progress.phase,
            currentPath: progress.currentPath,
            completedFiles: progress.completedFiles,
            totalFiles: progress.totalFiles,
            pulledCount: progress.pulledCount,
            uploadedCount: progress.uploadedCount,
          }
        },
      })
    } finally {
      this.current = { isRunning: false }
    }
  }
}
