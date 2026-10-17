import type { StatsRecord } from '@aiusage/core'
import { calculateCost, generateRecordId, inferProvider } from '@aiusage/core'
import Database from 'better-sqlite3'
import { closeSync, copyFileSync, createWriteStream, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import * as yauzl from 'yauzl'

export interface KelivoImportOptions {
  filePath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  exchangeRate?: number
}

export interface KelivoImportResult {
  records: StatsRecord[]
  errors: string[]
  /** Import succeeded but may be incomplete; callers should surface these. */
  warnings: string[]
}

/**
 * One usage-carrying message, normalized across the two Kelivo backup shapes:
 * the Hive-era `chats.json` export and the SQLite-era chat database.
 */
interface KelivoEntry {
  id: unknown
  role: unknown
  timestamp: unknown
  modelId: unknown
  providerId: unknown
  totalTokens: unknown
  promptTokens: unknown
  completionTokens: unknown
  cachedTokens: unknown
  cacheWriteTokens: unknown
  reasoningTokens: unknown
  conversationId: unknown
}

/** Row shape of the SQLite-era `message_rows` table (snake_case columns). */
interface KelivoSqliteRow {
  id?: string | null
  conversation_id?: string | null
  role?: string | null
  timestamp?: number | null
  model_id?: string | null
  provider_id?: string | null
  total_tokens?: number | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  cached_tokens?: number | null
  extras_json?: string | null
}

/** Columns `message_rows` has carried since the first SQLite-era schema (v1). */
const REQUIRED_MESSAGE_COLUMNS = ['id', 'conversation_id', 'role', 'timestamp'] as const

const DATABASE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3']

/** SQLite-era Kelivo chat database (kelivo.db, or any .sqlite export). */
export function isKelivoDatabaseFile(filePath: string): boolean {
  const name = basename(filePath).toLowerCase()
  return DATABASE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** Kelivo exports this importer accepts: chats.json, .zip backups, and raw databases. */
export function isKelivoSourceFile(filePath: string): boolean {
  return basename(filePath).toLowerCase() === 'chats.json'
    || filePath.toLowerCase().endsWith('.zip')
    || isKelivoDatabaseFile(filePath)
}

function toTokenCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1e12) return value * 1000
    // Kelivo's SQLite schema stores DateTime as microseconds since epoch.
    if (value >= 1e14) return Math.floor(value / 1000)
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

// ── Hive-era chats.json ──────────────────────────────────────────────

function readChatsJson(text: string): KelivoEntry[] {
  const parsed = JSON.parse(text) as { messages?: unknown }
  const messages = Array.isArray(parsed?.messages) ? parsed.messages : []
  return messages.map((message) => {
    const raw = (message ?? {}) as Record<string, unknown>
    return {
      id: raw.id,
      role: raw.role,
      timestamp: raw.timestamp,
      modelId: raw.modelId,
      providerId: raw.providerId,
      totalTokens: raw.totalTokens,
      promptTokens: raw.promptTokens,
      completionTokens: raw.completionTokens,
      cachedTokens: raw.cachedTokens,
      cacheWriteTokens: raw.cacheWriteTokens,
      // Kelivo has always called this "reasoning" internally; aiusage calls it thinking.
      reasoningTokens: raw.reasoningTokens ?? raw.thinkingTokens,
      conversationId: raw.conversationId,
    }
  })
}

// ── SQLite-era chat database ─────────────────────────────────────────

function readExtraTokenCount(extrasJson: unknown, key: string): number {
  if (typeof extrasJson !== 'string' || !extrasJson.trim()) return 0
  try {
    const parsed = JSON.parse(extrasJson) as Record<string, unknown>
    return toTokenCount(parsed?.[key])
  } catch {
    return 0
  }
}

function readKelivoDatabase(databasePath: string, options: { writable?: boolean } = {}): KelivoEntry[] {
  // Writable only for copies this importer owns: SQLite may need to recover a
  // WAL or write a journal, and that must never happen to the user's file.
  const db = options.writable
    ? new Database(databasePath, { fileMustExist: true })
    : new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message_rows'")
      .get() as { name?: string } | undefined
    if (!table) {
      throw new Error('message_rows table not found — not a Kelivo chat database')
    }

    const columns = new Set(
      (db.prepare('PRAGMA table_info(message_rows)').all() as Array<{ name?: unknown }>).map((column) =>
        String(column.name),
      ),
    )
    const missing = REQUIRED_MESSAGE_COLUMNS.filter((name) => !columns.has(name))
    if (missing.length > 0) {
      throw new Error(`message_rows is missing ${missing.join(', ')}`)
    }
    // Columns added by later schema versions (extras_json arrived in v3).
    const select = (name: string) => (columns.has(name) ? name : `NULL AS ${name}`)

    const rows = db
      .prepare(
        `SELECT id, conversation_id, role, timestamp, model_id, provider_id,
                total_tokens, prompt_tokens, completion_tokens, cached_tokens, ${select('extras_json')}
         FROM message_rows
         WHERE role = 'assistant'
         ORDER BY timestamp ASC, id ASC`,
      )
      .all() as KelivoSqliteRow[]

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      timestamp: row.timestamp,
      modelId: row.model_id,
      providerId: row.provider_id,
      totalTokens: row.total_tokens,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      cachedTokens: row.cached_tokens,
      // Not first-class columns: Kelivo keeps these in the extras JSON blob.
      cacheWriteTokens: readExtraTokenCount(row.extras_json, 'tokens.cacheWrite'),
      reasoningTokens: readExtraTokenCount(row.extras_json, 'tokens.reasoning'),
      conversationId: row.conversation_id,
    }))
  } finally {
    db.close()
  }
}

// ── zip / file loading ───────────────────────────────────────────────

function listZipEntryNames(filePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipfile) {
        reject(new Error('Unable to open zip file'))
        return
      }

      const names: string[] = []
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        names.push(entry.fileName)
        zipfile.readEntry()
      })
      zipfile.on('end', () => resolve(names))
      zipfile.on('error', (e) => reject(e))
    })
  })
}

async function readZipEntryText(filePath: string, entryName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipfile) {
        reject(new Error('Unable to open zip file'))
        return
      }

      let settled = false
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        if (basename(entry.fileName) !== entryName) {
          zipfile.readEntry()
          return
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            settled = true
            zipfile.close()
            reject(streamError)
            return
          }
          if (!stream) {
            settled = true
            zipfile.close()
            reject(new Error(`Missing ${entryName} stream`))
            return
          }

          const chunks: Buffer[] = []
          stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
          stream.on('error', (e) => {
            settled = true
            zipfile.close()
            reject(e)
          })
          stream.on('end', () => {
            settled = true
            zipfile.close()
            resolve(Buffer.concat(chunks).toString('utf-8'))
          })
        })
      })
      zipfile.on('end', () => {
        if (!settled) reject(new Error(`${entryName} not found in zip`))
      })
      zipfile.on('error', (e) => {
        if (!settled) reject(e)
      })
    })
  })
}

/** Streams one entry to disk so large chat databases never sit in memory. */
async function extractZipEntryToFile(filePath: string, entryName: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipfile) {
        reject(new Error('Unable to open zip file'))
        return
      }

      let settled = false
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        zipfile.close()
        reject(error)
      }

      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        if (basename(entry.fileName) !== entryName) {
          zipfile.readEntry()
          return
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail(streamError)
            return
          }
          if (!stream) {
            fail(new Error(`Missing ${entryName} stream`))
            return
          }

          pipeline(stream, createWriteStream(outPath))
            .then(() => {
              if (settled) return
              settled = true
              zipfile.close()
              resolve()
            })
            .catch(fail)
        })
      })
      zipfile.on('end', () => {
        if (!settled) reject(new Error(`${entryName} not found in zip`))
      })
      zipfile.on('error', (e) => {
        if (!settled) fail(e)
      })
    })
  })
}

function pickDatabaseEntry(names: string[]): string | null {
  const preferred = names.find((name) => basename(name).toLowerCase() === 'kelivo.db')
  if (preferred) return preferred
  return names.find((name) => DATABASE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) ?? null
}

interface LoadedKelivoEntries {
  entries: KelivoEntry[]
  /** Conditions that did not stop the import but can make it incomplete. */
  warnings: string[]
  cleanup: () => void
}

const NO_WARNINGS: string[] = []
const NO_CLEANUP = () => {}

/**
 * Removes an extraction or copy directory. Cleanup must never mask the parse
 * error that triggered it: on Windows a handle that is still closing makes
 * `rmSync` throw EBUSY, and `force` does not swallow that.
 */
function discardWorkDir(workDir: string): void {
  try {
    rmSync(workDir, { recursive: true, force: true })
  } catch {}
}

/**
 * A database copied on its own from a running Kelivo has no `-wal` next to it,
 * while the newest messages are exactly what the WAL holds. The import cannot
 * recover those frames, so it says so instead of reporting a clean result.
 */
const MISSING_WAL_WARNING =
  'this database is in WAL mode but no -wal sidecar was found beside it; if Kelivo is running, its newest messages only exist in that WAL. Export a Kelivo .zip backup instead, or copy the database together with its -wal file'

/**
 * The file-by-file copy is a last resort: Kelivo can checkpoint while the files
 * are copied, so the copy can be behind instead of complete.
 */
const COPIED_DATABASE_WARNING =
  'this database could not be read through SQLite\'s online backup, so its files were copied directly; if Kelivo checkpointed during the copy, the newest messages may be missing (the next import picks them up)'

/** SQLite records the journal mode the database was last written in at byte 18. */
function isWalModeDatabase(filePath: string): boolean {
  let handle: number | null = null
  try {
    handle = openSync(filePath, 'r')
    const header = Buffer.alloc(20)
    const read = readSync(handle, header, 0, header.length, 0)
    return read >= 19
      && header.subarray(0, 16).toString('latin1') === 'SQLite format 3\0'
      && header[18] === 2
  } catch {
    return false
  } finally {
    if (handle !== null) closeSync(handle)
  }
}

/**
 * Reads a `.db`/`.sqlite` file. When the database still has a WAL beside it,
 * SQLite's online backup produces the snapshot instead of copying the files one
 * by one: the copy then either includes the uncheckpointed WAL frames or was
 * taken before them, but it is never a torn mixture of the two, and the user's
 * files stay untouched.
 */
async function loadDatabaseFile(filePath: string): Promise<LoadedKelivoEntries> {
  const sidecars = [`${filePath}-wal`, `${filePath}-shm`].filter((sidecar) => existsSync(sidecar))
  if (sidecars.length === 0) {
    return {
      entries: readKelivoDatabase(filePath),
      warnings: isWalModeDatabase(filePath) ? [MISSING_WAL_WARNING] : NO_WARNINGS,
      cleanup: NO_CLEANUP,
    }
  }

  let snapshot: { path: string; cleanup: () => void }
  try {
    snapshot = await snapshotDatabase(filePath)
  } catch {
    // SQLite refused to read the live database online (for example a WAL whose
    // shared-memory file is gone); a plain copy is still worth a try.
    return loadCopiedDatabase(filePath, sidecars)
  }

  try {
    return { entries: readKelivoDatabase(snapshot.path), warnings: NO_WARNINGS, cleanup: snapshot.cleanup }
  } catch (e) {
    // The snapshot is a real database but not a Kelivo one; copying the files
    // would yield the same rows, so surface the error and leave no copy behind.
    snapshot.cleanup()
    throw e
  }
}

/**
 * Copies a database and its sidecars, then opens the copy read-write so SQLite
 * can replay the WAL. Kelivo can checkpoint while the copies run, so the result
 * is never torn but can be behind, which is why it carries a warning.
 */
function loadCopiedDatabase(filePath: string, sidecars: string[]): LoadedKelivoEntries {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const workDir = mkdtempSync(join(tmpdir(), 'aiusage-kelivo-'))
    try {
      const copyPath = join(workDir, basename(filePath))
      copyFileSync(filePath, copyPath)
      for (const sidecar of sidecars) {
        copyFileSync(sidecar, `${copyPath}${sidecar.slice(filePath.length)}`)
      }
      return {
        entries: readKelivoDatabase(copyPath, { writable: true }),
        warnings: [COPIED_DATABASE_WARNING],
        cleanup: () => discardWorkDir(workDir),
      }
    } catch (e) {
      lastError = e
      discardWorkDir(workDir)
    }
  }

  throw lastError
}

/** Consistent snapshot of a database, including frames still only in its WAL. */
async function snapshotDatabase(sourcePath: string): Promise<{ path: string; cleanup: () => void }> {
  const workDir = mkdtempSync(join(tmpdir(), 'aiusage-kelivo-'))
  try {
    const snapshotPath = join(workDir, basename(sourcePath))
    const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    try {
      await source.backup(snapshotPath)
    } finally {
      source.close()
    }
    return { path: snapshotPath, cleanup: () => discardWorkDir(workDir) }
  } catch (e) {
    discardWorkDir(workDir)
    throw e
  }
}

async function loadZipBackup(filePath: string): Promise<LoadedKelivoEntries> {
  const names = await listZipEntryNames(filePath)

  if (names.some((name) => basename(name) === 'chats.json')) {
    return { entries: readChatsJson(await readZipEntryText(filePath, 'chats.json')), warnings: NO_WARNINGS, cleanup: NO_CLEANUP }
  }

  const databaseEntry = pickDatabaseEntry(names)
  if (!databaseEntry) {
    throw new Error('zip contains neither chats.json nor a Kelivo database')
  }

  const workDir = mkdtempSync(join(tmpdir(), 'aiusage-kelivo-'))
  try {
    const databasePath = join(workDir, 'kelivo.db')
    await extractZipEntryToFile(filePath, basename(databaseEntry), databasePath)
    const entries = readKelivoDatabase(databasePath)
    return { entries, warnings: NO_WARNINGS, cleanup: () => discardWorkDir(workDir) }
  } catch (e) {
    discardWorkDir(workDir)
    throw e
  }
}

async function loadKelivoEntries(filePath: string): Promise<LoadedKelivoEntries> {
  const name = basename(filePath).toLowerCase()
  if (name.endsWith('.zip')) return loadZipBackup(filePath)
  if (DATABASE_EXTENSIONS.some((ext) => name.endsWith(ext))) return loadDatabaseFile(filePath)
  return { entries: readChatsJson(readFileSync(filePath, 'utf-8')), warnings: NO_WARNINGS, cleanup: NO_CLEANUP }
}

// ── import ───────────────────────────────────────────────────────────

export async function runParseKelivo(options: KelivoImportOptions): Promise<KelivoImportResult> {
  const { filePath, device, deviceInstanceId, platform, now, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  const warnings: string[] = []

  let loaded: LoadedKelivoEntries
  try {
    loaded = await loadKelivoEntries(filePath)
    warnings.push(...loaded.warnings)
  } catch (e) {
    return { records, errors: [`${filePath}: ${e instanceof Error ? e.message : e}`], warnings }
  }

  try {
    for (const [index, entry] of loaded.entries.entries()) {
      if (entry.role !== 'assistant') continue

      const promptTokens = toTokenCount(entry.promptTokens)
      const completionTokens = toTokenCount(entry.completionTokens)
      const cacheReadTokens = toTokenCount(entry.cachedTokens)
      const cacheWriteTokens = toTokenCount(entry.cacheWriteTokens)
      const thinkingTokens = toTokenCount(entry.reasoningTokens)
      const totalTokens = toTokenCount(entry.totalTokens)
      // Kelivo reports promptTokens inclusive of both cache buckets, and
      // completionTokens inclusive of reasoning tokens; aiusage prices those
      // buckets separately, so peel them off here.
      const inputTokens = promptTokens > 0
        ? Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens)
        : Math.max(0, totalTokens - completionTokens - cacheReadTokens - cacheWriteTokens)
      const outputTokens = Math.max(0, completionTokens - thinkingTokens)

      if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + thinkingTokens === 0) continue

      const model = readOptionalString(entry.modelId) || 'unknown'
      // Kelivo's providerId is a user-facing provider name ("OpenAI - MiMo")
      // or a UUID, so aiusage's own inference wins when it recognises the
      // model; otherwise the Kelivo label beats "unknown".
      const inferredProvider = inferProvider(model)
      const provider = inferredProvider !== 'unknown'
        ? inferredProvider
        : readOptionalString(entry.providerId) || 'unknown'
      const ts = parseTimestamp(entry.timestamp, now)
      const sessionId = readOptionalString(entry.conversationId) || 'unknown'
      const messageId = readOptionalString(entry.id) || `${sessionId}:${ts}:${index}`
      const sourceKey = `kelivo:${sessionId}:${messageId}`
      const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
      const cost = model !== 'unknown' ? calculateCost(model, tokenArgs, exchangeRate) : 0

      records.push({
        id: generateRecordId(deviceInstanceId, sourceKey, ts),
        ts,
        ingestedAt: now,
        updatedAt: now,
        lineOffset: index,
        tool: 'kelivo',
        model,
        provider,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        thinkingTokens,
        cost,
        costSource: cost > 0 ? 'pricing' : 'unknown',
        sessionId,
        sourceFile: filePath,
        device,
        deviceInstanceId,
        platform,
      })
    }
  } finally {
    loaded.cleanup()
  }

  return { records, errors, warnings }
}
