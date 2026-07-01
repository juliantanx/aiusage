import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import type { StatsRecord } from '@aiusage/core'
import { generateRecordId, inferProvider, calculateCost } from '@aiusage/core'

export interface CodeBuddyImportOptions {
  dataDir: string          // .../CodeBuddyExtension/Data
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  cursor?: number          // Unix ms; skip conversations last active at/before this
  exchangeRate?: number
}

export interface CodeBuddyImportResult {
  records: StatsRecord[]
  nextCursor: number
  errors: string[]
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toMs(iso: unknown): number {
  if (typeof iso !== 'string') return 0
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

/**
 * The CodeBuddy IDE stores each chat message as its own JSON file:
 *   <profile>/CodeBuddyIDE/<workspace>/history/<session>/<conversation>/messages/*.json
 * Only the final assistant message of each agent turn carries usage stats, under a
 * stringified `extra` field. `statsSnapshot` is a running (conversation-cumulative)
 * snapshot of input/cache tokens, so we take the latest snapshot per conversation and
 * emit a single record for it to avoid double-counting across turns.
 */
interface MessageFile {
  role: string
  message?: string
  extra?: string
  createdAt?: string
}

interface ConversationUsage {
  ts: number
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
  cwd?: string
}

const WORKSPACE_FOLDER_RE = /Workspace Folder:\s*(.+)/

/** Extract the plain text of a user message (its `message` field is stringified JSON). */
function userMessageText(raw: string): string {
  try {
    const inner = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> }
    if (Array.isArray(inner.content)) {
      return inner.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
    }
  } catch {
    // Fall back to the raw string if it is not JSON.
  }
  return raw
}

/** Recursively collect every `messages` directory under a CodeBuddyIDE data root. */
function findMessagesDirs(root: string, depth = 0): string[] {
  if (depth > 12) return []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = join(root, entry.name)
    if (entry.name === 'messages') {
      out.push(full)
      continue
    }
    out.push(...findMessagesDirs(full, depth + 1))
  }
  return out
}

/** Read and summarize one conversation's messages directory into a single usage record. */
function readConversation(messagesDir: string): ConversationUsage | null {
  let files: string[]
  try {
    files = readdirSync(messagesDir).filter((f) => f.endsWith('.json'))
  } catch {
    return null
  }
  if (files.length === 0) return null

  const parsed: MessageFile[] = []
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(messagesDir, file), 'utf-8')) as MessageFile
      if (data && typeof data === 'object') parsed.push(data)
    } catch {
      // Skip unreadable/partial message files.
    }
  }
  if (parsed.length === 0) return null

  // Workspace folder (cwd) is embedded in the user prompt's <user_info> block.
  let cwd: string | undefined
  for (const msg of parsed) {
    if (msg.role !== 'user' || typeof msg.message !== 'string') continue
    const match = WORKSPACE_FOLDER_RE.exec(userMessageText(msg.message))
    if (match) {
      cwd = match[1].trim()
      break
    }
  }

  // Latest assistant message carrying a stats snapshot wins (cumulative snapshot).
  let latest: { ts: number; extra: Record<string, unknown> } | null = null
  for (const msg of parsed) {
    if (msg.role !== 'assistant' || typeof msg.extra !== 'string') continue
    let extra: Record<string, unknown>
    try {
      extra = JSON.parse(msg.extra) as Record<string, unknown>
    } catch {
      continue
    }
    const hasStats = extra.statsSnapshot != null || extra.lastStepInputTokens != null
    if (!hasStats) continue
    const ts = toMs(msg.createdAt)
    if (!latest || ts >= latest.ts) latest = { ts, extra }
  }
  if (!latest) return null

  const extra = latest.extra
  const snapshot = (extra.statsSnapshot ?? {}) as Record<string, unknown>

  // Prefer the cumulative snapshot; fall back to per-step fields when absent.
  const cacheReadTokens = num(snapshot.cachedInputTokens ?? extra.lastStepCachedInputTokens)
  const inputTokens = snapshot.cacheMissTokens != null
    ? num(snapshot.cacheMissTokens)
    : Math.max(0, num(extra.lastStepInputTokens) - cacheReadTokens)
  const outputTokens = num(snapshot.lastOutputTokens ?? extra.lastStepOutputTokens)
  const cacheWriteTokens = num(snapshot.cacheWriteTokens)
  const thinkingTokens = num(snapshot.thinkingTokens)

  const model = typeof extra.modelId === 'string' && extra.modelId.trim()
    ? extra.modelId.trim()
    : 'unknown'

  return {
    ts: latest.ts,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    thinkingTokens,
    cwd,
  }
}

export function runParseCodeBuddy(options: CodeBuddyImportOptions): CodeBuddyImportResult {
  const { dataDir, device, deviceInstanceId, platform, now, cursor, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []
  let nextCursor = cursor ?? 0

  if (!existsSync(dataDir)) {
    return { records, nextCursor, errors }
  }

  let messagesDirs: string[]
  try {
    messagesDirs = findMessagesDirs(dataDir)
  } catch (e) {
    return { records, nextCursor, errors: [String(e)] }
  }

  for (const messagesDir of messagesDirs) {
    const conversationDir = dirname(messagesDir)
    const sessionId = basename(conversationDir)
    let usage: ConversationUsage | null
    try {
      usage = readConversation(messagesDir)
    } catch (e) {
      errors.push(`${messagesDir}: ${e instanceof Error ? e.message : e}`)
      continue
    }
    if (!usage) continue
    if (usage.inputTokens + usage.outputTokens + usage.cacheReadTokens === 0) continue

    // Skip conversations already imported (last activity at or before the cursor).
    if (cursor && usage.ts <= cursor) continue
    if (usage.ts > nextCursor) nextCursor = usage.ts

    const provider = inferProvider(usage.model)
    const tokenArgs = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      thinkingTokens: usage.thinkingTokens,
    }
    const cost = calculateCost(usage.model, tokenArgs, exchangeRate)
    const recordId = generateRecordId(deviceInstanceId, conversationDir, usage.ts)

    records.push({
      id: recordId,
      ts: usage.ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: 0,
      tool: 'codebuddy',
      model: usage.model,
      provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      thinkingTokens: usage.thinkingTokens,
      cost,
      costSource: cost > 0 ? 'pricing' : 'unknown',
      sessionId,
      sourceFile: conversationDir,
      cwd: usage.cwd,
      device,
      deviceInstanceId,
      platform,
    })
  }

  return { records, nextCursor, errors }
}
