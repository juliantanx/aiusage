import { createHash } from 'node:crypto'
import type { SyncRecord } from '@aiusage/core'

/**
 * Per-namespace manifest for the file-based sync backends.
 *
 * A device namespace (`<deviceInstanceId>/YYYY/MM/DD.ndjson`) is published as
 * a set of day files, and only the GitHub backend can replace all of them in
 * one atomic step (a commit). On S3 every object is written on its own, so a
 * peer listing the namespace while its owner rewrites it — or after the owner
 * crashed half-way — can observe a mixture of old and new files. Because
 * peers mirror namespaces authoritatively (rows missing remotely are pruned
 * locally), such a mixture must never be mistaken for the owner's intent.
 *
 * `<deviceInstanceId>/manifest.json` closes that gap. It lists every day file
 * of the namespace with the digest of its *canonical* content
 * (`serializeSnapshot` of its records, see `canonicalDigest`). The owner
 * writes the day files first, the manifest second and deletes stale files
 * last. A peer reads the manifest and then the files it names; it treats the
 * namespace as authoritative only when every named file is present, parses
 * cleanly and hashes to the digest recorded for it. Anything else — a file
 * gone missing, a malformed line, a digest mismatch, a manifest that cannot
 * be parsed — means the namespace is being rewritten (or was left half
 * rewritten) and the peer upserts what it read without pruning anything.
 *
 * A namespace without a manifest was last written by a client that predates
 * manifests. Those clients only ever merged into day files and never removed
 * lines, so a partially written legacy namespace is at worst a superset of
 * the owner's state and remains safe to reconcile against.
 *
 * Digests are computed over canonical content rather than raw bytes so that
 * a Git checkout with `core.autocrlf` (which rewrites line endings in the
 * working tree) still verifies.
 */

export const MANIFEST_FILE = 'manifest.json'
export const MANIFEST_VERSION = 1

export interface ManifestFileEntry {
  /** MD5 hex digest of the file's canonical content. */
  digest: string
  /** Number of records in the file. */
  records: number
}

export interface NamespaceManifest {
  version: number
  /** Keyed by path relative to the namespace, e.g. `2026/09/06.ndjson`. */
  files: Record<string, ManifestFileEntry>
}

export function manifestPath(owner: string): string {
  return `${owner}/${MANIFEST_FILE}`
}

export function isManifestPath(path: string): boolean {
  return path.endsWith(`/${MANIFEST_FILE}`)
}

/**
 * True for a day file inside a namespace folder (`<owner>/...ndjson`). A
 * listing can contain other `.ndjson` files — a stray file at the top of the
 * data directory has no owner and no namespace to read, and must not be
 * mistaken for one (its name would become an owner and its manifest path a
 * file component, which the backends rightly refuse to read through).
 */
export function isDayFilePath(path: string): boolean {
  return path.endsWith('.ndjson') && path.indexOf('/') > 0
}

/** Parse a single ndjson line, normalising string timestamps. Returns null on bad input. */
export function parseSyncRecordLine(line: string): SyncRecord | null {
  try {
    const record: SyncRecord = JSON.parse(line)
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') return null
    if (typeof record.ts === 'string') {
      (record as any).ts = new Date(record.ts).getTime()
    }
    if (typeof record.updatedAt === 'string') {
      (record as any).updatedAt = new Date(record.updatedAt).getTime()
    }
    return record
  } catch {
    return null
  }
}

export interface ParsedNdjson {
  /** Every parsable line, in file order, duplicates included. */
  records: SyncRecord[]
  /** Non-empty lines that did not parse as a sync record. */
  malformed: number
}

/** Parse ndjson content line by line without collapsing duplicate ids. */
export function parseNdjsonLines(content: string): ParsedNdjson {
  const records: SyncRecord[] = []
  let malformed = 0
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    const record = parseSyncRecordLine(line)
    if (record) records.push(record)
    else malformed++
  }
  return { records, malformed }
}

/**
 * Canonical file content for a set of wire records: one JSON line per record,
 * sorted by id. Deterministic so that unchanged snapshots hash identically
 * and no-op syncs never rewrite a file.
 */
export function serializeSnapshot(records: SyncRecord[]): string {
  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return sorted.map(r => JSON.stringify(r)).join('\n') + '\n'
}

export function contentDigest(content: string): string {
  return createHash('md5').update(content, 'utf8').digest('hex')
}

/** Digest of the canonical serialisation of `records` (duplicates are *not* collapsed). */
export function canonicalDigest(records: SyncRecord[]): string {
  return contentDigest(serializeSnapshot(records))
}

/**
 * True when a remote file already holds exactly `canonical` (the output of
 * `serializeSnapshot`): every line parses, and re-serialising the lines yields
 * the same bytes. Line order is irrelevant; duplicated ids, malformed lines,
 * and any field difference are not.
 */
export function matchesCanonical(existing: string, canonical: string): boolean {
  const { records, malformed } = parseNdjsonLines(existing)
  if (malformed > 0) return false
  return serializeSnapshot(records) === canonical
}

export function buildManifest(files: Map<string, SyncRecord[]>): NamespaceManifest {
  const entries: Record<string, ManifestFileEntry> = {}
  for (const rel of [...files.keys()].sort()) {
    const records = files.get(rel)!
    entries[rel] = { digest: canonicalDigest(records), records: records.length }
  }
  return { version: MANIFEST_VERSION, files: entries }
}

/** Deterministic manifest bytes: identical namespaces produce identical manifests. */
export function serializeManifest(manifest: NamespaceManifest): string {
  const files: Record<string, ManifestFileEntry> = {}
  for (const rel of Object.keys(manifest.files).sort()) {
    const entry = manifest.files[rel]
    files[rel] = { digest: entry.digest, records: entry.records }
  }
  return JSON.stringify({ version: manifest.version, files }, null, 2) + '\n'
}

export function parseManifest(content: string): NamespaceManifest | null {
  try {
    const value = JSON.parse(content)
    if (!value || typeof value !== 'object') return null
    if (value.version !== MANIFEST_VERSION) return null
    if (!value.files || typeof value.files !== 'object' || Array.isArray(value.files)) return null
    const files: Record<string, ManifestFileEntry> = {}
    for (const [rel, entry] of Object.entries<any>(value.files)) {
      if (typeof rel !== 'string' || !rel.endsWith('.ndjson') || rel.includes('..') || rel.startsWith('/')) return null
      if (!entry || typeof entry.digest !== 'string' || !/^[0-9a-f]{32}$/.test(entry.digest)) return null
      if (typeof entry.records !== 'number' || !Number.isInteger(entry.records) || entry.records < 0) return null
      files[rel] = { digest: entry.digest, records: entry.records }
    }
    return { version: MANIFEST_VERSION, files }
  } catch {
    return null
  }
}
