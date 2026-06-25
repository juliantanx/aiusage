import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { StatsRecord, ToolCallRecord } from '@aiusage/core'
import { generateRecordId } from '@aiusage/core'

export interface TraeImportOptions {
  dbPath: string           // state.vscdb path (used to derive data dir)
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  lastImportedAt?: number  // Unix ms timestamp of last import
}

export interface TraeImportResult {
  records: StatsRecord[]
  toolCalls: ToolCallRecord[]
  lastImportedAt: number
  errors: string[]
}

/**
 * Derive the Trae ModularData directory from the state.vscdb path.
 */
function deriveDataDir(dbPath: string): string | null {
  // dbPath: .../Trae CN/User/globalStorage/state.vscdb (macOS/Linux)
  // dbPath: ...\Trae CN\User\globalStorage\state.vscdb (Windows)
  // dataDir: .../Trae CN/ModularData/ai-agent/snapshot
  const normalized = dbPath.replace(/\\/g, '/')
  const appDir = normalized.replace(/\/User\/globalStorage\/state\.vscdb$/, '')
  const dataDir = join(appDir, 'ModularData', 'ai-agent', 'snapshot')
  return existsSync(dataDir) ? dataDir : null
}

interface SessionTag {
  sessionId: string
  startTs: number
  chatTurns: number
  toolCalls: number
}

/**
 * Parse git tags in a Trae snapshot directory to extract session metadata.
 * Tags follow patterns like:
 *   chain-start-<sessionId>   → session creation
 *   before-chat-turn-<id>     → chat turn start
 *   after-chat-turn-<id>      → chat turn end
 *   toolcall-<sessionId>-<id> → tool call
 */
function parseSessionTags(repoPath: string): SessionTag | null {
  try {
    const sessionId = basename(basename(repoPath) === 'v2' ? join(repoPath, '..') : repoPath)
    if (!/^[0-9a-f]{24,}$/.test(sessionId)) return null

    const tagResult = spawnSync('git', ['tag', '-l'], { cwd: repoPath, encoding: 'utf-8', timeout: 5000 })
    if (tagResult.status !== 0 || !tagResult.stdout?.trim()) return null
    const tags = tagResult.stdout

    const lines = tags.trim().split('\n')
    let chatTurns = 0
    let toolCalls = 0
    let startTs = 0

    for (const tag of lines) {
      const t = tag.trim()
      if (!t) continue

      // Get commit timestamp for this tag
      let tagTs = 0
      try {
        const logResult = spawnSync('git', ['log', '-1', '--format=%at', t], {
          cwd: repoPath, encoding: 'utf-8', timeout: 3000,
        })
        if (logResult.status !== 0 || !logResult.stdout?.trim()) continue
        const tsStr = logResult.stdout.trim()
        tagTs = parseInt(tsStr, 10) * 1000 // Convert to ms
      } catch { continue }

      if (t.startsWith('chain-start-')) {
        startTs = tagTs
      } else if (t.startsWith('before-chat-turn-')) {
        // Count turns by before-chat-turn to avoid double-counting with after-chat-turn
        chatTurns++
      } else if (t.startsWith('toolcall-')) {
        toolCalls++
      }
    }

    // Fallback: if no chain-start tag, use the earliest tag timestamp
    if (startTs === 0) {
      let earliest = Infinity
      for (const tag of lines) {
        const t = tag.trim()
        if (!t) continue
        const logResult = spawnSync('git', ['log', '-1', '--format=%at', t], {
          cwd: repoPath, encoding: 'utf-8', timeout: 3000,
        })
        if (logResult.status !== 0 || !logResult.stdout?.trim()) continue
        const ts = parseInt(logResult.stdout.trim(), 10) * 1000
        if (ts > 0 && ts < earliest) earliest = ts
      }
      if (earliest < Infinity) startTs = earliest
    }

    if (chatTurns === 0 && toolCalls === 0) return null
    if (startTs === 0) return null

    return { sessionId, startTs, chatTurns, toolCalls }
  } catch {
    return null
  }
}

export function runParseTrae(options: TraeImportOptions): TraeImportResult {
  const { dbPath, device, deviceInstanceId, platform, now, lastImportedAt } = options
  const records: StatsRecord[] = []
  const toolCalls: ToolCallRecord[] = []
  const errors: string[] = []
  let latestTs = lastImportedAt ?? 0

  const dataDir = deriveDataDir(dbPath)
  if (!dataDir) {
    return { records, toolCalls, lastImportedAt: latestTs, errors: ['Trae ModularData not found'] }
  }

  // Scan snapshot directories
  let entries
  try { entries = readdirSync(dataDir, { withFileTypes: true }) }
  catch (e) { return { records, toolCalls, lastImportedAt: latestTs, errors: [String(e)] } }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const repoPath = join(dataDir, entry.name, 'v2')
    if (!existsSync(join(repoPath, '.git'))) continue

    const session = parseSessionTags(repoPath)
    if (!session) continue

    // Skip already-imported sessions
    if (session.startTs < latestTs) continue

    if (session.startTs > latestTs) latestTs = session.startTs

    // Estimate tokens from chat turns: ~200 input + ~800 output per turn (heuristic)
    const estInputTokens = session.chatTurns * 200
    const estOutputTokens = session.chatTurns * 800

    const recordId = generateRecordId(deviceInstanceId, `${dbPath}:${session.sessionId}`, session.startTs)

    const record: StatsRecord = {
      id: recordId,
      ts: session.startTs,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'trae',
      model: 'trae-agent',
      provider: 'trae',
      inputTokens: estInputTokens,
      outputTokens: estOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost: 0,
      costSource: 'unknown',
      sessionId: session.sessionId,
      sourceFile: dbPath,
      device,
      deviceInstanceId,
      platform,
    }

    records.push(record)

    // Add tool call records
    let callIndex = 0
    for (let i = 0; i < session.toolCalls; i++) {
      toolCalls.push({
        id: generateRecordId(recordId, 'tool_call', session.startTs + callIndex),
        recordId,
        name: 'trae-tool',
        ts: session.startTs + callIndex,
        callIndex,
      })
      callIndex++
    }
  }

  return { records, toolCalls, lastImportedAt: latestTs, errors }
}
