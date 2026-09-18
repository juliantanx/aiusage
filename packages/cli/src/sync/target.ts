import type Database from 'better-sqlite3'
import type { SyncConfig } from '../config.js'
import { getBookkeepingTargets } from '../db/sync-claims.js'
import { getState, setState, type State } from '../init.js'

/**
 * Sync target identity.
 *
 * The target string keys everything a device remembers about a remote store:
 * consent and last-sync status in `state.json`, `sync_record_state` (what was
 * published there), `sync_record_claims` (what was mirrored from there) and
 * `sync_retired_wire_ids`. Two configurations must therefore share a key only
 * when they address the same physical store — otherwise reconciling one of
 * them replaces the other's claims and prunes rows the other still carries.
 *
 * Clients before this release keyed GitHub by repository and S3 by bucket
 * alone. A different branch of the same repository, or a different prefix or
 * endpoint on the same bucket name, holds a different dataset, so those fields
 * are now part of the key. The default configuration (branch `main`, prefix
 * `aiusage/`, the AWS endpoint) keeps its old key so that nothing changes for
 * the common case; other configurations get a new key and adopt the state
 * recorded under their old one once (see `adoptLegacySyncTarget`).
 *
 * The S3 region is deliberately not part of the key: it selects the signing
 * region, not the store (bucket names are unique per partition on AWS, and a
 * custom endpoint identifies the store on every other provider).
 */

export const DEFAULT_GITHUB_BRANCH = 'main'
export const DEFAULT_S3_PREFIX = 'aiusage/'
const DEFAULT_S3_ENDPOINTS = new Set(['', 'https://s3.amazonaws.com'])

/** The prefix exactly as the S3 backend applies it: no leading slash, one trailing slash. */
export function normalizeS3Prefix(prefix: string | undefined): string {
  return (prefix ?? DEFAULT_S3_PREFIX).replace(/^\/+/, '').replace(/\/?$/, '/')
}

function normalizeS3Endpoint(endpoint: string | undefined): string {
  const trimmed = (endpoint ?? '').trim().replace(/\/+$/, '')
  return DEFAULT_S3_ENDPOINTS.has(trimmed) ? '' : trimmed
}

export function getSyncTarget(sync: SyncConfig | undefined): string | null {
  if (!sync) return null
  if (sync.backend === 'cloud') return 'cloud'
  if (sync.backend === 'github' && sync.repo) {
    const branch = sync.branch?.trim() || DEFAULT_GITHUB_BRANCH
    if (branch === DEFAULT_GITHUB_BRANCH) return `github:${sync.repo}`
    return `github:${sync.repo}?${new URLSearchParams({ branch })}`
  }
  if (sync.backend === 's3' && sync.bucket) {
    const params = new URLSearchParams()
    const prefix = normalizeS3Prefix(sync.prefix)
    if (prefix !== DEFAULT_S3_PREFIX) params.set('prefix', prefix)
    const endpoint = normalizeS3Endpoint(sync.endpoint)
    if (endpoint) params.set('endpoint', endpoint)
    const query = params.toString()
    return query ? `s3:${sync.bucket}?${query}` : `s3:${sync.bucket}`
  }
  return null
}

/**
 * The key clients up to 1.5.17 used for this configuration, when it differs
 * from the current one (a non-default branch, prefix or endpoint). `null` for
 * the cloud and for default configurations, whose key did not change.
 */
export function getLegacySyncTarget(sync: SyncConfig | undefined): string | null {
  const current = getSyncTarget(sync)
  if (!sync || !current) return null
  const legacy = sync.backend === 'github' ? `github:${sync.repo}` : sync.backend === 's3' ? `s3:${sync.bucket}` : current
  return legacy === current ? null : legacy
}

export interface LegacyTargetAdoption {
  target: string
  legacy: string
  /** Consent and/or last-sync status were copied in `state.json`. */
  stateCopied: boolean
  syncStateRows: number
  claimRows: number
  retiredWireIdRows: number
}

const TARGET_TABLES = [
  { table: 'sync_record_state', columns: ['record_id', 'synced_at'], key: 'syncStateRows' },
  { table: 'sync_record_claims', columns: ['device_instance_id', 'record_id'], key: 'claimRows' },
  { table: 'sync_retired_wire_ids', columns: ['wire_id'], key: 'retiredWireIdRows' },
] as const

/**
 * Seed the state of a configuration whose key changed from what was recorded
 * under its legacy key, once.
 *
 * Everything is *copied*, never moved, and only when the new key has nothing
 * yet: the legacy key may also be the current key of another configuration
 * (branch `main` next to branch `x` of the same repository), whose state must
 * stay in place. Copied claims can be broader than the store really holds when
 * two configurations shared the legacy key; that only delays pruning until the
 * first reliable read of each namespace on each target corrects them, it
 * never deletes anything. Namespace verdicts are *not* copied: a verdict
 * permits deletion, and one recorded under the legacy key was made by
 * whichever configuration synced under it — not necessarily this one, and
 * never against this store's key. Returns what was copied, or `null` when
 * the configuration has no legacy key.
 */
export function adoptLegacySyncTarget(aiusageDir: string, db: Database.Database, sync: SyncConfig | undefined): LegacyTargetAdoption | null {
  const target = getSyncTarget(sync)
  const legacy = getLegacySyncTarget(sync)
  if (!target || !legacy) return null

  let stateCopied = false
  const state = getState(aiusageDir)
  if (state) {
    const consents = state.syncConsents ?? {}
    const targets = state.syncTargets ?? {}
    const updates: Partial<State> = {}
    if (!consents[target] && consents[legacy]) {
      updates.syncConsents = { ...consents, [target]: consents[legacy] }
      stateCopied = true
    }
    if (!targets[target] && targets[legacy]) {
      updates.syncTargets = { ...targets, [target]: { ...targets[legacy], lastSyncTarget: target } }
      stateCopied = true
    }
    if (stateCopied) setState(aiusageDir, updates)
  }

  const copied = { syncStateRows: 0, claimRows: 0, retiredWireIdRows: 0 }
  db.transaction(() => {
    for (const { table, columns, key } of TARGET_TABLES) {
      const present = db.prepare(`SELECT 1 FROM ${table} WHERE target = ? LIMIT 1`).get(target)
      if (present) continue
      const cols = columns.join(', ')
      copied[key] = db.prepare(`
        INSERT OR IGNORE INTO ${table} (target, ${cols})
        SELECT @target, ${cols} FROM ${table} WHERE target = @legacy
      `).run({ target, legacy }).changes
    }
  })()

  return { target, legacy, stateCopied, ...copied }
}

/**
 * Every sync target recorded in state — each repository, bucket or the cloud
 * this device has ever synced with — with `target` always included.
 * Unresolved pulled rows are deleted only once every target in this set has
 * judged their namespace, so a target that is never synced again keeps them
 * until `aiusage sync --repair` removes them, or until the target is
 * forgotten with `aiusage sync --repair --forget-target` (see
 * `forgetSyncTargetState`).
 *
 * The key clients up to 1.5.17 used for a configuration whose key changed
 * (see `getLegacySyncTarget`) stays in the set: it is also the current key of
 * the default configuration of the same repository or bucket (branch `main`
 * next to branch `x`), and nothing recorded locally tells whether the rows
 * claimed under it came from that configuration or from this one before the
 * upgrade. Dropping it would let this configuration alone settle rows the
 * other one may still carry.
 */
export function knownSyncTargets(state: State | null, target: string): string[] {
  const known = new Set<string>([target])
  if (state) {
    for (const key of Object.keys(state.syncConsents ?? {})) known.add(key)
    for (const key of Object.keys(state.syncTargets ?? {})) known.add(key)
    if (state.lastSyncTarget) known.add(state.lastSyncTarget)
  }
  return [...known].sort()
}

/** True when `state.json` lists `target` anywhere `knownSyncTargets` looks. */
export function isSyncTargetInState(state: State | null, target: string): boolean {
  if (!state) return false
  return target in (state.syncConsents ?? {}) || target in (state.syncTargets ?? {}) || state.lastSyncTarget === target
}

/**
 * Stop listing `target` in `state.json`: its consent, its last-sync status
 * and — when it was the last target synced — `lastSyncTarget`. After this
 * `knownSyncTargets` no longer names it, so it no longer withholds the
 * verdict unresolved rows wait for. Nothing else is touched: a later sync
 * under the key records it again the normal way. Returns true when the file
 * changed.
 */
export function forgetSyncTargetState(aiusageDir: string, target: string): boolean {
  const state = getState(aiusageDir)
  if (!state || !isSyncTargetInState(state, target)) return false
  const { [target]: _consent, ...syncConsents } = state.syncConsents ?? {}
  const { [target]: _status, ...syncTargets } = state.syncTargets ?? {}
  setState(aiusageDir, {
    syncConsents,
    syncTargets,
    lastSyncTarget: state.lastSyncTarget === target ? undefined : state.lastSyncTarget,
  })
  return true
}

/**
 * Target keys other than `current` that still count on this device: keys
 * with claims or verdicts in the database, or listed in `state.json`. Each
 * of them either shields the rows it claims or withholds a verdict from
 * unresolved rows until it syncs again. `sync --repair` names them as a
 * hint; whether one is really no longer used is the user's call, so nothing
 * acts on this list.
 */
export function otherSyncTargets(db: Database.Database, state: State | null, current: string): string[] {
  const keys = new Set<string>(getBookkeepingTargets(db))
  for (const key of knownSyncTargets(state, current)) keys.add(key)
  keys.delete(current)
  return [...keys].sort()
}

