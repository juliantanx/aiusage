import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
}

export interface SyncTargetState {
  lastSyncAt?: number
  lastSyncStatus?: State['lastSyncStatus']
  lastSyncError?: string
  lastSyncTarget?: string
  lastSyncUploaded?: number
  lastSyncPulled?: number
  lastSyncDurationMs?: number
}

export function ensureAiusageDir(aiusageDir: string): void {
  if (!existsSync(aiusageDir)) {
    mkdirSync(aiusageDir, { recursive: true, mode: 0o700 })
  }

  const statePath = join(aiusageDir, 'state.json')
  if (!existsSync(statePath)) {
    const initialState: State = {
      deviceInstanceId: randomUUID(),
      lastSyncStatus: 'ok',
    }
    writeFileSync(statePath, JSON.stringify(initialState, null, 2), 'utf-8')
  }
}

export function getState(aiusageDir: string): State | null {
  const statePath = join(aiusageDir, 'state.json')
  if (!existsSync(statePath)) return null
  try {
    const content = readFileSync(statePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function setState(aiusageDir: string, updates: Partial<State>): void {
  const statePath = join(aiusageDir, 'state.json')
  const current = getState(aiusageDir) ?? {
    deviceInstanceId: randomUUID(),
    lastSyncStatus: 'ok' as const,
  }
  const updated = { ...current, ...updates }
  writeFileSync(statePath, JSON.stringify(updated, null, 2), 'utf-8')
}

export function setSyncTargetState(aiusageDir: string, target: string, updates: SyncTargetState): void {
  const statePath = join(aiusageDir, 'state.json')
  const current = getState(aiusageDir) ?? {
    deviceInstanceId: randomUUID(),
    lastSyncStatus: 'ok' as const,
  }
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
  const updated = {
    ...current,
    ...legacyUpdates,
    syncTargets: {
      ...(current.syncTargets ?? {}),
      [target]: targetState,
    },
  }
  writeFileSync(statePath, JSON.stringify(updated, null, 2), 'utf-8')
}

export function setSyncConsent(aiusageDir: string, target: string, consent: { syncConsentAt: number; syncConsentTarget: string }): void {
  const statePath = join(aiusageDir, 'state.json')
  const current = getState(aiusageDir) ?? {
    deviceInstanceId: randomUUID(),
    lastSyncStatus: 'ok' as const,
  }
  const updated = {
    ...current,
    syncConsentAt: consent.syncConsentAt,
    syncConsentTarget: consent.syncConsentTarget,
    syncConsents: {
      ...(current.syncConsents ?? {}),
      [target]: consent,
    },
  }
  writeFileSync(statePath, JSON.stringify(updated, null, 2), 'utf-8')
}
