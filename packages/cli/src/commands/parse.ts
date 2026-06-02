import Database from 'better-sqlite3'
import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { join, extname } from 'node:path'
import { homedir, hostname, platform } from 'node:os'
import { Aggregator, resolveExchangeRate, generateToolCallId, inferProvider, type Tool } from '@aiusage/core'
import type { ToolCallRecord } from '@aiusage/core'
import { insertRecord } from '../db/records.js'
import { insertToolCall } from '../db/tool-calls.js'
import { getState } from '../init.js'
import { loadConfig, AIUSAGE_DIR } from '../config.js'
import { WatermarkManager } from '../watermark.js'
import { runParseOpenCode } from './parse-opencode.js'
import { runParseHermes } from './parse-hermes.js'
import { runParseQoder } from './parse-qoder.js'
import { runParseCursor } from './parse-cursor.js'
import { runParseKilo } from './parse-kilo.js'
import type { ProgressInfo } from '../progress.js'

interface ParseResult {
  parsedCount: number
  toolCallCount: number
  errors: string[]
}

interface ToolPaths {
  tool: Tool
  paths: string[]
}

function unique(paths: string[]): string[] {
  return [...new Set(paths)]
}

function findJsonlFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath))
      } else if (entry.isFile() && extname(entry.name) === '.jsonl') {
        results.push(fullPath)
      }
    }
  } catch {}
  return results
}

function findQoderSessionSegmentFiles(dir: string): string[] {
  return findJsonlFiles(dir).filter((filePath) => {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    const sessionsIndex = parts.lastIndexOf('sessions')
    const segmentsIndex = parts.lastIndexOf('segments')
    return sessionsIndex >= 0
      && segmentsIndex > sessionsIndex
      && segmentsIndex === parts.length - 2
  })
}

function windowsUserHomesFromWsl(): string[] {
  const homes: string[] = []
  if (!existsSync('/mnt')) return homes

  try {
    const drives = readdirSync('/mnt', { withFileTypes: true })
    for (const drive of drives) {
      if (!drive.isDirectory() || !/^[a-z]$/i.test(drive.name)) continue
      const usersDir = join('/mnt', drive.name, 'Users')
      if (!existsSync(usersDir)) continue

      try {
        const users = readdirSync(usersDir, { withFileTypes: true })
        for (const user of users) {
          if (!user.isDirectory()) continue
          if (['All Users', 'Default', 'Default User', 'Public'].includes(user.name)) continue
          homes.push(join(usersDir, user.name))
        }
      } catch {
        // Permission errors on individual user dirs are non-fatal; skip and continue.
      }
    }
  } catch {
    // /mnt may exist but be unreadable; WSL detection is best-effort.
  }

  return homes
}

function defaultQoderSessionDirs(home: string): string[] {
  const windowsHomes = [
    process.env.USERPROFILE,
    ...windowsUserHomesFromWsl(),
  ].filter((value): value is string => !!value)

  const dirs = [
    join(home, '.qoder', 'logs', 'sessions'),
    ...windowsHomes.flatMap((windowsHome) => [
      join(windowsHome, '.qoder', 'logs', 'sessions'),
      join(windowsHome, 'AppData', 'Local', '.qoder', 'logs', 'sessions'),
      join(windowsHome, 'AppData', 'Roaming', 'Qoder', 'logs', 'sessions'),
    ]),
  ]

  if (process.env.LOCALAPPDATA) {
    dirs.push(join(process.env.LOCALAPPDATA, '.qoder', 'logs', 'sessions'))
  }
  if (process.env.APPDATA) {
    dirs.push(join(process.env.APPDATA, 'Qoder', 'logs', 'sessions'))
  }

  return unique(dirs)
}

function qoderSessionDirs(source: string | undefined, home: string): string[] {
  if (!source) return defaultQoderSessionDirs(home)

  const normalized = source.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized.endsWith('/logs/sessions') || normalized.endsWith('/sessions') || normalized.endsWith('/segments')) {
    return [source]
  }
  if (normalized.endsWith('/logs')) return [join(source, 'sessions')]

  return [join(source, 'logs', 'sessions')]
}

export function defaultOpenCodeDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'win32') {
    // Windows: %APPDATA%\opencode\opencode.db
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'opencode', 'opencode.db')
  }
  if (plat === 'darwin') {
    // macOS: ~/Library/Application Support/opencode/opencode.db
    return join(home, 'Library', 'Application Support', 'opencode', 'opencode.db')
  }
  // Linux: $XDG_DATA_HOME/opencode/opencode.db (defaults to ~/.local/share)
  const xdgDataHome = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share')
  return join(xdgDataHome, 'opencode', 'opencode.db')
}

export function defaultHermesDbPath(): string {
  return join(homedir(), '.hermes', 'state.db')
}

export function defaultQoderDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
  }
  if (plat === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return join(localAppData, 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
  }
  // Linux: $XDG_DATA_HOME/Qoder/... (defaults to ~/.local/share)
  const xdgDataHome = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share')
  return join(xdgDataHome, 'Qoder', 'SharedClientCache', 'cache', 'db', 'local.db')
}

export function defaultCursorDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'win32') {
    // Windows: %APPDATA%\Cursor\User\globalStorage\state.vscdb
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
    return join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  if (plat === 'darwin') {
    // macOS: ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
    return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
  }
  // Linux: ~/.config/Cursor/User/globalStorage/state.vscdb
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(home, '.config')
  return join(xdgConfigHome, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

export function defaultKiloDbPath(): string {
  const home = homedir()
  const plat = platform()
  if (plat === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    const candidates = [
      join(localAppData, 'kilo', 'kilo.db'),
      join(home, '.local', 'share', 'kilo', 'kilo.db'),
    ]
    return candidates.find((path) => existsSync(path)) ?? candidates[0]
  }
  if (plat === 'darwin') {
    const candidates = [
      join(home, 'Library', 'Application Support', 'kilo', 'kilo.db'),
      join(home, '.local', 'share', 'kilo', 'kilo.db'),
    ]
    return candidates.find((path) => existsSync(path)) ?? candidates[0]
  }
  const xdgDataHome = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share')
  return join(xdgDataHome, 'kilo', 'kilo.db')
}

function discoverLogFiles(sources?: import('../config.js').SourcesConfig): ToolPaths[] {
  const home = homedir()
  const results: ToolPaths[] = []

  // Claude Code: ~/.claude/projects/**/*.jsonl (recursive, includes subagents)
  const claudeDir = sources?.['claude-code'] ?? join(home, '.claude', 'projects')
  if (existsSync(claudeDir)) {
    const claudePaths = findJsonlFiles(claudeDir)
    if (claudePaths.length > 0) {
      results.push({ tool: 'claude-code', paths: claudePaths })
    }
  }

  // Codex: ~/.codex/sessions/**/*.jsonl (recursive)
  const codexDir = sources?.['codex'] ?? join(home, '.codex', 'sessions')
  if (existsSync(codexDir)) {
    const codexPaths = findJsonlFiles(codexDir)
    if (codexPaths.length > 0) {
      results.push({ tool: 'codex', paths: codexPaths })
    }
  }

  // OpenClaw: ~/.openclaw/agents/*/sessions/*.jsonl (all agents, skip checkpoint files)
  const openclawBase = sources?.['openclaw'] ?? join(home, '.openclaw', 'agents')
  if (existsSync(openclawBase)) {
    // If user provided a custom path, treat it directly as the sessions dir
    // Otherwise scan all agents under ~/.openclaw/agents/*/sessions/
    let openclawPaths: string[]
    if (sources?.['openclaw']) {
      openclawPaths = findJsonlFiles(openclawBase).filter(p => !p.includes('.checkpoint.'))
    } else {
      openclawPaths = []
      try {
        const agentEntries = readdirSync(openclawBase, { withFileTypes: true })
        for (const agentEntry of agentEntries) {
          if (!agentEntry.isDirectory()) continue
          const sessionsDir = join(openclawBase, agentEntry.name, 'sessions')
          if (existsSync(sessionsDir)) {
            openclawPaths.push(...findJsonlFiles(sessionsDir).filter(p => !p.includes('.checkpoint.')))
          }
        }
      } catch {}
    }
    if (openclawPaths.length > 0) {
      results.push({ tool: 'openclaw', paths: openclawPaths })
    }
  }

  // Qoder: structured session logs only. Desktop context-usage snapshots and transcripts
  // are not per-request token records, so they are intentionally ignored.
  const qoderPaths = unique(
    qoderSessionDirs(sources?.['qoder'], home)
      .filter((dir) => existsSync(dir))
      .flatMap((dir) => findQoderSessionSegmentFiles(dir))
  )
  if (qoderPaths.length > 0) {
    results.push({ tool: 'qoder', paths: qoderPaths })
  }

  return results
}

function extractSessionId(filePath: string, tool: Tool): string {
  if (tool === 'claude-code') {
    // Extract from path like ~/.claude/projects/<project>/<session>.jsonl
    const parts = filePath.split('/')
    const filename = parts[parts.length - 1]
    return filename.replace('.jsonl', '')
  }
  if (tool === 'codex') {
    // Extract from path like ~/.codex/sessions/2026/04/22/rollout-<uuid>.jsonl
    const filename = filePath.split('/').pop() ?? ''
    const match = filename.match(/rollout-(.+)\.jsonl$/)
    return match ? match[1] : filename.replace('.jsonl', '')
  }
  if (tool === 'openclaw') {
    // Extract from path like ~/.openclaw/agents/main/sessions/<uuid>.jsonl
    const filename = filePath.split('/').pop() ?? ''
    return filename.replace('.jsonl', '')
  }
  if (tool === 'qoder') {
    // Extract from path like ~/.qoder/logs/sessions/<project>/<session>/segments/<segment>.jsonl
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    const segmentsIndex = parts.lastIndexOf('segments')
    if (segmentsIndex > 0) return parts[segmentsIndex - 1]
    const filename = parts[parts.length - 1] ?? ''
    return filename.replace('.jsonl', '') || 'unknown'
  }
  return 'unknown'
}

export async function runParse(db: Database.Database, filterTool?: string, options?: { openCodeDbPath?: string; hermesDbPath?: string; qoderDbPath?: string; cursorDbPath?: string; onProgress?: (info: ProgressInfo) => void }): Promise<ParseResult> {
  const state = getState(AIUSAGE_DIR)
  const config = loadConfig()
  const exchangeRate = resolveExchangeRate(config ?? {})
  const device = config?.device || hostname() || state?.deviceInstanceId?.slice(0, 8) || 'unknown'
  const deviceInstanceId = state?.deviceInstanceId ?? 'unknown'
  const devicePlatform = config?.platform

  const watermarkPath = join(AIUSAGE_DIR, 'watermark.json')
  const wm = new WatermarkManager(watermarkPath)

  const toolPaths = discoverLogFiles(config?.sources)
  const aggregator = new Aggregator()

  let parsedCount = 0
  let toolCallCount = 0
  const errors: string[] = []

  const onProgress = options?.onProgress ?? (() => {})
  const totalFiles = toolPaths
    .filter(({ tool }) => !filterTool || tool === filterTool)
    .reduce((sum, { paths }) => sum + paths.length, 0)
  let fileIndex = 0
  let currentTool: string | undefined

  for (const { tool, paths } of toolPaths) {
    if (filterTool && tool !== filterTool) continue
    currentTool = tool

    for (const filePath of paths) {
      fileIndex++
      try {
        const stat = statSync(filePath)
        const entry = wm.getEntry(tool, filePath)
        const offset = entry?.offset ?? 0

        if (offset >= stat.size) {
          onProgress({ phase: 'Parsing logs', tool, current: fileIndex, total: totalFiles, records: parsedCount, toolCalls: toolCallCount })
          continue // No new data
        }

        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        let byteOffset = 0

        // Extract cwd from the first line — it's always present in JSONL session files
        let fileCwd: string | undefined
        try {
          const firstData = JSON.parse(lines[0])
          if (typeof firstData.cwd === 'string' && firstData.cwd) fileCwd = firstData.cwd
        } catch {}

        const sessionId = extractSessionId(filePath, tool)

        for (const line of lines) {
          if (!line.trim()) {
            byteOffset += Buffer.byteLength(line, 'utf-8') + 1
            continue
          }

          if (byteOffset < offset) {
            // Still run through the parser to update stateful fields like currentModel,
            // but discard results — we only emit records from the watermark onwards.
            aggregator.parseLine(line, aggregator.createContext({
              tool,
              sourceFile: filePath,
              lineOffset: byteOffset,
              sessionId,
              device,
              deviceInstanceId,
              platform: devicePlatform,
              exchangeRate,
            }))
            byteOffset += Buffer.byteLength(line, 'utf-8') + 1
            continue
          }

          const context = aggregator.createContext({
            tool,
            sourceFile: filePath,
            lineOffset: byteOffset,
            sessionId,
            device,
            deviceInstanceId,
            platform: devicePlatform,
            exchangeRate,
          })

          const result = aggregator.parseLine(line, context)
          if (result) {
            if (result.record) {
              insertRecord(db, result.record)
              parsedCount++
            }

            for (const tc of result.toolCalls) {
              insertToolCall(db, tc)
              toolCallCount++
            }
          }

          byteOffset += Buffer.byteLength(line, 'utf-8') + 1
        }

        // Handle finalize (orphan tool calls for Codex)
        const orphanResults = aggregator.finalize()
        for (const result of orphanResults) {
          for (const tc of result.toolCalls) {
            insertToolCall(db, tc)
            toolCallCount++
          }
        }

        // Write cwd for all records from this file that don't have it yet
        if (fileCwd) {
          db.prepare(`UPDATE records SET cwd = ? WHERE source_file = ? AND cwd = ''`).run(fileCwd, filePath)
        }

        wm.setEntry(tool, filePath, {
          offset: stat.size,
          size: stat.size,
          mtime: stat.mtimeMs,
        })
        wm.save()
        onProgress({ phase: 'Parsing logs', tool, current: fileIndex, total: totalFiles, records: parsedCount, toolCalls: toolCallCount })
      } catch (e) {
        errors.push(`${filePath}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  // OpenCode: SQLite database
  const openCodeDbPath = options?.openCodeDbPath ?? config?.sources?.['opencode'] ?? defaultOpenCodeDbPath()
  if ((!filterTool || filterTool === 'opencode') && existsSync(openCodeDbPath)) {
    try {
      const openCodeDb = new Database(openCodeDbPath, { readonly: true })
      try {
        const result = runParseOpenCode(openCodeDb, {
          dbPath: openCodeDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getOpenCodeCursor(),
          exchangeRate,
        })

        for (const record of result.records) insertRecord(db, record)
        for (const tc of result.toolCalls) insertToolCall(db, tc)
        if (result.nextCursor) {
          wm.setOpenCodeCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        toolCallCount += result.toolCalls.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'opencode', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        openCodeDb.close()
      }
    } catch (e) {
      errors.push(`${openCodeDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Hermes: SQLite database
  const hermesDbPath = options?.hermesDbPath ?? config?.sources?.['hermes'] ?? defaultHermesDbPath()
  if ((!filterTool || filterTool === 'hermes') && existsSync(hermesDbPath)) {
    try {
      const hermesDb = new Database(hermesDbPath, { readonly: true })
      try {
        const result = runParseHermes(hermesDb, {
          dbPath: hermesDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getHermesCursor(),
          exchangeRate,
        })

        for (const record of result.records) insertRecord(db, record)
        for (const tc of result.toolCalls) insertToolCall(db, tc)
        if (result.nextCursor) {
          wm.setHermesCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        toolCallCount += result.toolCalls.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'hermes', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        hermesDb.close()
      }
    } catch (e) {
      errors.push(`${hermesDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Qoder: SQLite database (Mac/Linux/Windows desktop app)
  const qoderDbPath = options?.qoderDbPath ?? config?.sources?.['qoder-db'] ?? defaultQoderDbPath()
  if ((!filterTool || filterTool === 'qoder') && existsSync(qoderDbPath)) {
    try {
      const qoderDb = new Database(qoderDbPath, { readonly: true })
      try {
        const result = runParseQoder(qoderDb, {
          dbPath: qoderDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getQoderCursor(),
          exchangeRate,
        })

        for (const record of result.records) insertRecord(db, record)
        for (const tc of result.toolCalls) insertToolCall(db, tc)
        if (result.nextCursor) {
          wm.setQoderCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        toolCallCount += result.toolCalls.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'qoder', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        qoderDb.close()
      }
    } catch (e) {
      errors.push(`${qoderDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Cursor: SQLite database (state.vscdb)
  const cursorDbPath = options?.cursorDbPath ?? config?.sources?.['cursor'] ?? defaultCursorDbPath()
  if ((!filterTool || filterTool === 'cursor') && existsSync(cursorDbPath)) {
    try {
      const cursorDb = new Database(cursorDbPath, { readonly: true })
      try {
        const result = runParseCursor(cursorDb, {
          dbPath: cursorDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getCursorCursor(),
        })

        for (const record of result.records) insertRecord(db, record)
        for (const tc of result.toolCalls) insertToolCall(db, tc)
        if (result.nextCursor) {
          wm.setCursorCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        toolCallCount += result.toolCalls.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'cursor', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        cursorDb.close()
      }
    } catch (e) {
      errors.push(`${cursorDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Kilo: SQLite database (new Kilo local storage)
  const kiloDbPath = config?.sources?.['kilocode-db'] ?? defaultKiloDbPath()
  if ((!filterTool || filterTool === 'kilocode') && existsSync(kiloDbPath)) {
    try {
      const kiloDb = new Database(kiloDbPath, { readonly: true })
      try {
        const result = runParseKilo(kiloDb, {
          dbPath: kiloDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getOpenCodeCursor(),
          exchangeRate,
        })

        for (const record of result.records) insertRecord(db, record)
        if (result.nextCursor) {
          wm.setOpenCodeCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length

        // 输出KiloCode统计信息
        if (result.records.length > 0) {
          const inputTokens = result.records.reduce((sum, r) => sum + r.inputTokens, 0)
          const outputTokens = result.records.reduce((sum, r) => sum + r.outputTokens, 0)
          const cacheReadTokens = result.records.reduce((sum, r) => sum + r.cacheReadTokens, 0)
          const cacheWriteTokens = result.records.reduce((sum, r) => sum + r.cacheWriteTokens, 0)
          const thinkingTokens = result.records.reduce((sum, r) => sum + r.thinkingTokens, 0)
          const totalCost = result.records.reduce((sum, r) => sum + r.cost, 0)
          console.log(`[KiloCode] Parsed ${result.records.length} records`)
          console.log(`[KiloCode] Input: ${inputTokens.toLocaleString()}, Output: ${outputTokens.toLocaleString()}, CacheRead: ${cacheReadTokens.toLocaleString()}, CacheWrite: ${cacheWriteTokens.toLocaleString()}, Thinking: ${thinkingTokens.toLocaleString()}`)
          console.log(`[KiloCode] Total Cost: ${totalCost.toFixed(4)} USD`)
        }

        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'kilocode', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        kiloDb.close()
      }
    } catch (e) {
      errors.push(`${kiloDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }


  // Fix historical records that were parsed before init created state.json.
  // If the current device UUID is known, backfill any records with 'unknown' device_instance_id.
  if (deviceInstanceId !== 'unknown') {
    db.prepare(
      `UPDATE records SET device_instance_id = ?, device = ? WHERE device_instance_id = 'unknown'`
    ).run(deviceInstanceId, device)
  }

  // Backfill platform for existing records that have an empty platform field.
  if (devicePlatform) {
    db.prepare(
      `UPDATE records SET platform = ? WHERE platform = '' AND source_file NOT LIKE 'synced/%'`
    ).run(devicePlatform)
  }

  // Backfill cwd for records parsed before this feature was added.
  // Reads only the first 2 KB of each file — enough to find the cwd field.
  const staleFiles = db.prepare(
    `SELECT DISTINCT source_file FROM records WHERE cwd = '' AND source_file NOT LIKE 'synced/%'`
  ).all() as { source_file: string }[]
  for (const { source_file } of staleFiles) {
    try {
      const fd = openSync(source_file, 'r')
      const buf = Buffer.alloc(2048)
      const n = readSync(fd, buf, 0, 2048, 0)
      closeSync(fd)
      const firstLine = buf.subarray(0, n).toString('utf8').split('\n')[0]
      const data = JSON.parse(firstLine)
      if (typeof data.cwd === 'string' && data.cwd) {
        db.prepare(`UPDATE records SET cwd = ? WHERE source_file = ? AND cwd = ''`).run(data.cwd, source_file)
      }
    } catch {}
  }

  // Backfill legacy tool_calls with name='Skill' to extract the specific skill name.
  // Historical rows were stored before the parser learned to read block.input.skill.
  backfillSkillNames(db)

  // Backfill Codex records whose model was stored as 'unknown' because the
  // turn_context line was before the watermark when they were parsed.
  backfillCodexModels(db)

  // Backfill historical tool calls for parsers that previously missed newer event formats.
  backfillMissingToolCalls(db, exchangeRate)

  return { parsedCount, toolCallCount, errors }
}

function backfillSkillNames(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT tc.id, tc.record_id, tc.ts, tc.call_index,
           r.source_file, r.line_offset
    FROM tool_calls tc
    JOIN records r ON r.id = tc.record_id
    WHERE (tc.name = 'Skill' OR tc.name = 'skill__unknown')
      AND r.source_file NOT LIKE 'synced/%'
  `).all() as { id: string; record_id: string; ts: number; call_index: number; source_file: string; line_offset: number }[]

  if (rows.length === 0) return

  const updateStmt = db.prepare('UPDATE tool_calls SET id = ?, name = ? WHERE id = ?')

  for (const row of rows) {
    try {
      const fd = openSync(row.source_file, 'r')
      const buf = Buffer.alloc(65536)
      const n = readSync(fd, buf, 0, buf.length, row.line_offset)
      closeSync(fd)

      let lineEnd = 0
      while (lineEnd < n && buf[lineEnd] !== 0x0a) lineEnd++
      const line = buf.subarray(0, lineEnd).toString('utf8')

      const parsed = JSON.parse(line)
      if (!Array.isArray(parsed.message?.content)) continue

      let callIndex = 0
      let skillArg = ''
      for (const block of parsed.message.content) {
        if (block.type !== 'tool_use') continue
        if (callIndex === row.call_index) {
          if (block.name === 'Skill') {
            const raw = block.input?.skill ?? block.input?.skillName ?? block.input?.name ?? ''
            skillArg = typeof raw === 'string' ? raw.trim() : ''
          }
          break
        }
        callIndex++
      }

      const storedName = skillArg ? `skill__${skillArg}` : 'skill__unknown'
      const newId = generateToolCallId(row.record_id, storedName, row.ts, row.call_index)
      updateStmt.run(newId, storedName, row.id)
    } catch {
      // File missing or line unreadable — leave this row as-is
    }
  }
}

function backfillCodexModels(db: Database.Database): void {
  const rows = db.prepare(`
    SELECT id, source_file, line_offset
    FROM records
    WHERE tool = 'codex' AND model = 'unknown'
      AND source_file NOT LIKE 'synced/%'
  `).all() as { id: string; source_file: string; line_offset: number }[]

  if (rows.length === 0) return

  // Group by source_file so we only read each file once
  const byFile = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byFile.get(row.source_file) ?? []
    list.push(row)
    byFile.set(row.source_file, list)
  }

  const updateStmt = db.prepare(
    `UPDATE records SET model = ?, provider = ?, cost = ?, cost_source = ?, updated_at = ? WHERE id = ?`
  )

  for (const [sourceFile, fileRows] of byFile) {
    try {
      const content = readFileSync(sourceFile, 'utf-8')
      const lines = content.split('\n')

      // Build a map: line_offset → model at that point in the file
      const offsetToModel = new Map<number, string>()
      let currentModel = ''
      let byteOffset = 0

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line)
            // track turn_context model
            const turnModel = parsed.type === 'turn_context' ? parsed.payload?.model : undefined
            if (turnModel) currentModel = turnModel
            // record model at this offset if it's a token_count event
            const payload = parsed.event_msg?.payload ?? (parsed.type === 'event_msg' ? parsed.payload : undefined)
            if (payload?.type === 'token_count' && currentModel) {
              offsetToModel.set(byteOffset, currentModel)
            }
          } catch {}
        }
        byteOffset += Buffer.byteLength(line, 'utf-8') + 1
      }

      for (const row of fileRows) {
        const model = offsetToModel.get(row.line_offset)
        if (!model) continue
        const provider = inferProvider(model)
        updateStmt.run(model, provider, 0, 'unknown', Date.now(), row.id)
      }
    } catch {
      // File missing or unreadable — skip
    }
  }
}

function backfillMissingToolCalls(db: Database.Database, exchangeRate?: number): void {
  const rows = db.prepare(`
    SELECT r.id, r.source_file, r.tool, r.line_offset, r.session_id
    FROM records r
    LEFT JOIN tool_calls tc ON tc.record_id = r.id
    WHERE r.tool IN ('codex', 'openclaw', 'qoder')
      AND r.source_file NOT LIKE 'synced/%'
      AND tc.id IS NULL
  `).all() as { id: string; source_file: string; tool: Tool; line_offset: number; session_id: string }[]

  if (rows.length === 0) return

  const rowsByFile = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = rowsByFile.get(row.source_file) ?? []
    list.push(row)
    rowsByFile.set(row.source_file, list)
  }

  for (const [sourceFile, fileRows] of rowsByFile) {
    try {
      const content = readFileSync(sourceFile, 'utf-8')
      const lines = content.split('\n')
      const aggregator = new Aggregator()
      const recordIdByOffset = new Map<number, string>()
      const sessionIdByOffset = new Map<number, string>()
      const tool = fileRows[0]?.tool
      if (!tool) continue

      for (const row of fileRows) {
        recordIdByOffset.set(row.line_offset, row.id)
        sessionIdByOffset.set(row.line_offset, row.session_id)
      }

      let byteOffset = 0
      for (const line of lines) {
        if (!line.trim()) {
          byteOffset += Buffer.byteLength(line, 'utf-8') + 1
          continue
        }

        const context = aggregator.createContext({
          tool,
          sourceFile,
          lineOffset: byteOffset,
          sessionId: sessionIdByOffset.get(byteOffset) ?? deriveSessionId(tool, sourceFile),
          device: '',
          deviceInstanceId: '',
          exchangeRate,
        })
        const result = aggregator.parseLine(line, context)
        if (result?.toolCalls?.length) {
          insertBackfilledToolCalls(db, result.toolCalls, tool, recordIdByOffset.get(byteOffset) ?? null)
        }
        byteOffset += Buffer.byteLength(line, 'utf-8') + 1
      }

      const orphanResults = aggregator.finalize()
      for (const result of orphanResults) {
        if (result.toolCalls.length) insertBackfilledToolCalls(db, result.toolCalls, tool, null)
      }
    } catch {
      // File missing or unreadable — skip
    }
  }
}

function insertBackfilledToolCalls(db: Database.Database, toolCalls: ToolCallRecord[], tool: Tool, actualRecordId: string | null): void {
  for (const tc of toolCalls) {
    if (actualRecordId) {
      const name = tc.name
      const id = generateToolCallId(actualRecordId, name, tc.ts, tc.callIndex)
      const dup = db.prepare('SELECT 1 FROM tool_calls WHERE id = ?').get(id)
      if (!dup) insertToolCall(db, { ...tc, id, recordId: actualRecordId })
      continue
    }

    const dup = db.prepare('SELECT 1 FROM tool_calls WHERE id = ?').get(tc.id)
    if (!dup) insertToolCall(db, { ...tc, tool } as ToolCallRecord)
  }
}

function deriveSessionId(tool: Tool, sourceFile: string): string {
  const normalized = sourceFile.replace(/\\/g, '/')
  const fileName = normalized.split('/').pop() ?? sourceFile
  if (tool === 'openclaw') return fileName.replace(/\.(trajectory\.)?jsonl$/, '')
  if (tool === 'qoder') return normalized.split('/').slice(-2, -1)[0] ?? fileName.replace(/\.jsonl$/, '')
  return fileName.replace(/\.jsonl$/, '')
}

export function getDefaultSourcePaths(): Record<string, string> {
  const home = homedir()
  return {
    'claude-code': join(home, '.claude', 'projects'),
    'codex':       join(home, '.codex', 'sessions'),
    'openclaw':    join(home, '.openclaw', 'agents'),
    'opencode':    defaultOpenCodeDbPath(),
    'hermes':      defaultHermesDbPath(),
    'qoder':       join(home, '.qoder', 'logs', 'sessions'),
    'qoder-db':    defaultQoderDbPath(),
    'cursor':      defaultCursorDbPath(),
    'kilocode-db': defaultKiloDbPath(),
  }
}
