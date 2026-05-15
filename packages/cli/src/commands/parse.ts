import Database from 'better-sqlite3'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { homedir, hostname, platform } from 'node:os'
import { Aggregator, type Tool } from '@aiusage/core'
import { insertRecord } from '../db/records.js'
import { insertToolCall } from '../db/tool-calls.js'
import { getState } from '../init.js'
import { loadConfig, AIUSAGE_DIR } from '../config.js'
import { WatermarkManager } from '../watermark.js'
import { runParseOpenCode } from './parse-opencode.js'

interface ParseResult {
  parsedCount: number
  toolCallCount: number
  errors: string[]
}

interface ToolPaths {
  tool: Tool
  paths: string[]
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

function defaultOpenCodeDbPath(): string {
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
  return 'unknown'
}

export async function runParse(db: Database.Database, filterTool?: string, options?: { openCodeDbPath?: string }): Promise<ParseResult> {
  const state = getState(AIUSAGE_DIR)
  const config = loadConfig()
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

  for (const { tool, paths } of toolPaths) {
    if (filterTool && tool !== filterTool) continue

    for (const filePath of paths) {
      try {
        const stat = statSync(filePath)
        const entry = wm.getEntry(tool, filePath)
        const offset = entry?.offset ?? 0

        if (offset >= stat.size) continue // No new data

        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        let byteOffset = 0

        const sessionId = extractSessionId(filePath, tool)

        for (const line of lines) {
          if (!line.trim()) {
            byteOffset += Buffer.byteLength(line, 'utf-8') + 1
            continue
          }

          if (byteOffset < offset) {
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
          })

          const result = aggregator.parseLine(line, context)
          if (result) {
            insertRecord(db, result.record)
            parsedCount++

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

        wm.setEntry(tool, filePath, {
          offset: stat.size,
          size: stat.size,
          mtime: stat.mtimeMs,
        })
        wm.save()
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
      } finally {
        openCodeDb.close()
      }
    } catch (e) {
      errors.push(`${openCodeDbPath}: ${e instanceof Error ? e.message : e}`)
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

  return { parsedCount, toolCallCount, errors }
}
