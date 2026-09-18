import type { SyncRecord } from '@aiusage/core'
import type { SyncBackend } from './index.js'
import { canonicalDigest, isDayFilePath, manifestPath, parseManifest, parseNdjsonLines, type NamespaceManifest } from './manifest.js'

/**
 * The one way to read a device namespace from a file-based backend.
 *
 * Pull, `aiusage clean --before` and `aiusage sync --repair` all need the
 * same answer to the same question: *what does this namespace hold, and can
 * that be trusted?* Sharing the reader guarantees that the three agree on
 * the rule (see `manifest.ts` for the protocol):
 *
 *  - a namespace with a manifest is read through it — only the day files it
 *    names are considered, and every one of them must be present, parse
 *    cleanly and hash to the digest recorded for it. Day files the manifest
 *    does not name are leftovers of an interrupted deletion and are ignored;
 *  - a namespace without a manifest was last written by a pre-manifest
 *    client: every listed day file is read and must parse cleanly.
 *
 * A namespace that fails any of this is *unreliable*: the owner is rewriting
 * it, was interrupted, or a file is corrupt. Readers that only mirror may
 * still use what they read (additively); readers that would rewrite the
 * namespace must leave it alone, because a manifest published on top of a
 * mixed or partial snapshot would make that accident authoritative.
 */

export interface NamespaceReadPlan {
  owner: string
  /** The manifest, when the namespace carries one that parses. */
  manifest: NamespaceManifest | null
  /** True when `<owner>/manifest.json` exists at all (even unparsable). */
  hasManifest: boolean
  /** Day files to read: those the manifest names, or the listed ones. */
  paths: string[]
  /** False from the start when the manifest exists but cannot be parsed. */
  reliable: boolean
  /** Human-readable reasons the namespace is not reliable, in order found. */
  problems: string[]
}

export interface NamespaceSnapshot extends NamespaceReadPlan {
  /** Records per day file, keyed by path relative to the namespace, for every file that could be read. */
  files: Map<string, SyncRecord[]>
  /** Planned files that were gone when read (relative paths). */
  missing: string[]
}

/** Day files of `owner` among `listedPaths` (manifests and other owners excluded). */
export function ownerDataPaths(owner: string, listedPaths: Iterable<string>): string[] {
  const prefix = `${owner}/`
  const out: string[] = []
  for (const p of listedPaths) if (p.startsWith(prefix) && isDayFilePath(p)) out.push(p)
  return out.sort()
}

/**
 * Read the manifest of `owner` and decide which day files make up its
 * snapshot. Reads exactly one file so callers can plan progress before
 * reading any data.
 */
export async function planNamespaceRead(backend: SyncBackend, owner: string, listedPaths: Iterable<string>): Promise<NamespaceReadPlan> {
  const listed = ownerDataPaths(owner, listedPaths)
  const manifestContent = await backend.readFile(manifestPath(owner))
  if (manifestContent === null) {
    return { owner, manifest: null, hasManifest: false, paths: listed, reliable: true, problems: [] }
  }
  const manifest = parseManifest(manifestContent)
  if (!manifest) {
    // Unreadable manifest: the listed files are all there is to read, but
    // nothing about them can be verified.
    return { owner, manifest: null, hasManifest: true, paths: listed, reliable: false, problems: ['manifest cannot be parsed'] }
  }
  const paths = Object.keys(manifest.files).sort().map(rel => `${owner}/${rel}`)
  return { owner, manifest, hasManifest: true, paths, reliable: true, problems: [] }
}

/**
 * Read the day files of a plan. `visit` receives every file that could be
 * read, in path order, as soon as it was read (so a caller that only needs
 * to stream the records does not have to hold the whole namespace); the
 * returned snapshot also collects them unless `collect` is false.
 */
export async function readNamespaceFiles(
  backend: SyncBackend,
  plan: NamespaceReadPlan,
  options: { visit?: (path: string, records: SyncRecord[]) => void | Promise<void>; collect?: boolean } = {},
): Promise<NamespaceSnapshot> {
  const files = new Map<string, SyncRecord[]>()
  const missing: string[] = []
  let reliable = plan.reliable
  const problems = [...plan.problems]
  for (const path of plan.paths) {
    const rel = path.slice(plan.owner.length + 1)
    const content = await backend.readFile(path)
    if (content === null) {
      // Listed (or named by the manifest) a moment ago, gone now: the owner
      // is rewriting the namespace.
      reliable = false
      missing.push(rel)
      problems.push(`${rel} is missing`)
      continue
    }
    const { records, malformed } = parseNdjsonLines(content)
    if (malformed > 0) {
      reliable = false
      problems.push(`${rel} has ${malformed} malformed line(s)`)
    }
    if (plan.manifest) {
      const expected = plan.manifest.files[rel]
      if (!expected || expected.digest !== canonicalDigest(records)) {
        reliable = false
        problems.push(`${rel} does not match the manifest`)
      }
    }
    if (options.collect !== false) files.set(rel, records)
    if (options.visit) await options.visit(path, records)
  }
  return { ...plan, files, missing, reliable, problems }
}

/** Plan and read a namespace in one go. */
export async function readNamespaceSnapshot(backend: SyncBackend, owner: string, listedPaths: Iterable<string>): Promise<NamespaceSnapshot> {
  return readNamespaceFiles(backend, await planNamespaceRead(backend, owner, listedPaths))
}

/** Owners of day files and manifests, including namespaces with no day files. */
export function listedOwners(listedPaths: Iterable<string>): string[] {
  const owners = new Set<string>()
  for (const p of listedPaths) {
    if (isDayFilePath(p) || /^[^/]+\/manifest\.json$/.test(p)) owners.add(p.slice(0, p.indexOf('/')))
  }
  return [...owners].sort()
}
