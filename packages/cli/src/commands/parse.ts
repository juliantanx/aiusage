import type Database from 'better-sqlite3'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { homedir } from 'node:os'
import { Aggregator, type Tool } from '@aiusage/core'
import { insertRecord } from '../db/records.js'
import { insertToolCall } from '../db/tool-calls.js'
import { getState } from '../init.js'
import { WatermarkManager } from '../watermark.js'

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

function discoverLogFiles(): ToolPaths[] {
  const home = homedir()
  const results: ToolPaths[] = []

  // Claude Code: ~/.claude/projects/**/*.jsonl (recursive, includes subagents)
  const claudeDir = join(home, '.claude', 'projects')
  if (existsSync(claudeDir)) {
    const claudePaths = findJsonlFiles(claudeDir)
    if (claudePaths.length > 0) {
      results.push({ tool: 'claude-code', paths: claudePaths })
    }
  }

  // Codex: ~/.codex/sessions/**/*.jsonl (recursive)
  const codexDir = join(home, '.codex', 'sessions')
  if (existsSync(codexDir)) {
    const codexPaths = findJsonlFiles(codexDir)
    if (codexPaths.length > 0) {
      results.push({ tool: 'codex', paths: codexPaths })
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
    // Extract from path like ~/.codex/sessions/<session>/rollout.jsonl
    const parts = filePath.split('/')
    return parts[parts.length - 2] ?? 'unknown'
  }
  return 'unknown'
}

export async function runParse(db: Database.Database, filterTool?: string): Promise<ParseResult> {
  const state = getState(join(homedir(), '.aiusage'))
  const device = state?.deviceInstanceId?.slice(0, 8) ?? 'unknown'
  const deviceInstanceId = state?.deviceInstanceId ?? 'unknown'

  const watermarkPath = join(homedir(), '.aiusage', 'watermark.json')
  const wm = new WatermarkManager(watermarkPath)

  const toolPaths = discoverLogFiles()
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
            byteOffset += line.length + 1
            continue
          }

          if (byteOffset < offset) {
            byteOffset += line.length + 1
            continue
          }

          const context = aggregator.createContext({
            tool,
            sourceFile: filePath,
            lineOffset: byteOffset,
            sessionId,
            device,
            deviceInstanceId,
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

          byteOffset += line.length + 1
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
      } catch (e) {
        errors.push(`${filePath}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  wm.save()

  return { parsedCount, toolCallCount, errors }
}
