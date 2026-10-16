import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonFileError, readJsonObjectFile, writeFileAtomic } from './json-file.js'
import { withSettingsLock } from './settings-lock.js'

export interface State {
  deviceInstanceId: string
  lastSyncAt?: number
  lastSyncStatus: 'ok' | 'failed' | 'conflict_resolved' | 'blocked_pending_consent'
  lastSyncError?: string
  syncConsentAt?: number
  syncConsentTarget?: string
  syncConsents?: Record<string, { syncConsentAt: number; syncConsentTarget: string }>
  lastSyncTarget?: string
  lastSyncUploaded?: number
  lastSyncPulled?: number
  lastSyncDurationMs?: number
  syncTargets?: Record<string, SyncTargetState>
  lastRemoteCleanAt?: number
  lastRemoteCleanSummary?: string
  lastLeaderboardUploadAt?: number
}

export interface SyncTargetState {
  lastSyncAt?: number
  lastSyncStatus?: State['lastSyncStatus']
  lastSyncError?: string
  lastSyncTarget?: string
  lastSyncUploaded?: number
  lastSyncPulled?: number
  lastSyncDurationMs?: number
  /**
   * Cloud target only: the server's sync generation this device last synced
   * under. The server starts a new, empty generation when the cloud data is
   * cleared; see `CloudSyncOrchestrator.sync`.
   */
  syncGeneration?: number
}

/**
 * `state.json` exists but cannot be used; see `JsonFileError`. The file holds
 * the device identity, so nothing ever writes a new one over it.
 */
export class StateFileError extends JsonFileError {
  constructor(path: string, problem: string) {
    super(path, problem, 'Fix the JSON in it or restore it from a backup. Moving it aside instead makes aiusage create a new device identity, under which the records this device already synced count as another device\'s.')
    this.name = 'StateFileError'
  }
}

export type StateFileRead =
  | { status: 'missing' }
  | { status: 'ok'; state: State }
  | { status: 'invalid'; error: StateFileError }

function statePathOf(aiusageDir: string): string {
  return join(aiusageDir, 'state.json')
}

/**
 * Read `state.json` without throwing, for a caller that has to tell a
 * missing file from one that exists but cannot be used (`getState` answers
 * `null` for both). A file without a `deviceInstanceId` cannot be used
 * either: every writer has always stored one.
 */
export function readStateFile(aiusageDir: string): StateFileRead {
  const statePath = statePathOf(aiusageDir)
  const read = readJsonObjectFile(statePath)
  if (read.status === 'missing') return read
  if (read.status === 'invalid') return { status: 'invalid', error: new StateFileError(statePath, read.problem) }
  if (typeof read.value.deviceInstanceId !== 'string' || !read.value.deviceInstanceId) {
    return { status: 'invalid', error: new StateFileError(statePath, 'it has no deviceInstanceId') }
  }
  return { status: 'ok', state: read.value as unknown as State }
}

/**
 * Create the directory and, when there is none, `state.json` with a new
 * device identity. An existing file is never touched, whatever it contains,
 * and of two processes starting at once only one creates it.
 */
export function ensureAiusageDir(aiusageDir: string): void {
  if (!existsSync(aiusageDir)) {
    mkdirSync(aiusageDir, { recursive: true, mode: 0o700 })
  }

  const statePath = statePathOf(aiusageDir)
  if (!existsSync(statePath)) {
    const initialState: State = {
      deviceInstanceId: randomUUID(),
      lastSyncStatus: 'ok',
    }
    writeFileAtomic(statePath, JSON.stringify(initialState, null, 2), { exclusive: true })
  }
}

/**
 * The state, or `null` when `state.json` is missing or cannot be used. Use
 * `readStateFile` to tell the two apart; the writers below do, and throw
 * rather than write over a file that cannot be used.
 */
export function getState(aiusageDir: string): State | null {
  const read = readStateFile(aiusageDir)
  return read.status === 'ok' ? read.state : null
}

/**
 * The state a writer builds on. A new device identity is generated only when
 * there is no `state.json` at all; a file that exists but cannot be used
 * throws `StateFileError`.
 */
function loadStateForUpdate(aiusageDir: string): State {
  let read = readStateFile(aiusageDir)
  if (read.status === 'missing') {
    ensureAiusageDir(aiusageDir)
    read = readStateFile(aiusageDir)
  }
  if (read.status === 'ok') return read.state
  throw read.status === 'invalid' ? read.error : new StateFileError(statePathOf(aiusageDir), 'it could not be created')
}

/** Replace `state.json` through a temporary file and a rename. */
function writeState(aiusageDir: string, state: State): void {
  writeFileAtomic(statePathOf(aiusageDir), JSON.stringify(state, null, 2))
}

/**
 * Change `state.json`: `mutate` gets the state as it is on disk now and
 * returns the new state, or `undefined` to leave the file as it is. The read
 * and the write happen under the settings lock (`withSettingsLock`), so an
 * update another process makes at the same time is never written over with
 * an older copy of the file. Build every change from `current`, not from a
 * state read earlier. Returns the state the file holds afterwards.
 */
export function updateState(aiusageDir: string, mutate: (current: State) => State | undefined): State {
  return withSettingsLock(aiusageDir, () => {
    const current = loadStateForUpdate(aiusageDir)
    const updated = mutate(current)
    if (updated === undefined) return current
    writeState(aiusageDir, updated)
    return updated
  })
}

export function setState(aiusageDir: string, updates: Partial<State>): void {
  updateState(aiusageDir, current => ({ ...current, ...updates }))
}

export function setSyncTargetState(aiusageDir: string, target: string, updates: SyncTargetState): void {
  updateState(aiusageDir, current => syncTargetStateUpdate(current, target, updates))
}

function syncTargetStateUpdate(current: State, target: string, updates: SyncTargetState): State {
  const targetState = {
    ...(current.syncTargets?.[target] ?? {}),
    ...updates,
    lastSyncTarget: target,
  }
  const legacyUpdates = {
    lastSyncAt: targetState.lastSyncAt,
    lastSyncStatus: targetState.lastSyncStatus ?? current.lastSyncStatus,
    lastSyncError: targetState.lastSyncError,
    lastSyncTarget: target,
    lastSyncUploaded: targetState.lastSyncUploaded,
    lastSyncPulled: targetState.lastSyncPulled,
    lastSyncDurationMs: targetState.lastSyncDurationMs,
  }
  return {
    ...current,
    ...legacyUpdates,
    syncTargets: {
      ...(current.syncTargets ?? {}),
      [target]: targetState,
    },
  }
}

export function setSyncConsent(aiusageDir: string, target: string, consent: { syncConsentAt: number; syncConsentTarget: string }): void {
  updateState(aiusageDir, current => ({
    ...current,
    syncConsentAt: consent.syncConsentAt,
    syncConsentTarget: consent.syncConsentTarget,
    syncConsents: {
      ...(current.syncConsents ?? {}),
      [target]: consent,
    },
  }))
}
