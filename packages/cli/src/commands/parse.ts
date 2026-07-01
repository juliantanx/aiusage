import Database from 'better-sqlite3'
import { readFileSync, statSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { hostname } from 'node:os'
import { Aggregator, resolveExchangeRate, generateToolCallId, inferProvider, calculateCost, generateRecordId, type StatsRecord, type Tool } from '@aiusage/core'
import type { ToolCallRecord } from '@aiusage/core'
import { insertRecord } from '../db/records.js'
import { insertToolCall } from '../db/tool-calls.js'
import { getState } from '../init.js'
import { loadConfig, AIUSAGE_DIR } from '../config.js'
import { WatermarkManager } from '../watermark.js'
import { discoverLogFiles, getDbPath } from '../discovery.js'
import { runParseOpenCode } from './parse-opencode.js'
import { runParseHermes } from './parse-hermes.js'
import { runParseQoder } from './parse-qoder.js'
import { runParseCursor } from './parse-cursor.js'
import { runParseCursorTranscript } from './parse-cursor.js'
import { runParseKilo } from './parse-kilo.js'
import { runParseKelivo } from './parse-kelivo.js'
import { runParseGoose } from './parse-goose.js'
import { runParseZed } from './parse-zed.js'
import { runParseKiro } from './parse-kiro.js'
import { runParseZcode } from './parse-zcode.js'
import { runParseTrae } from './parse-trae.js'
import { runParseCodeBuddy } from './parse-codebuddy.js'
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

// Re-export for backward compatibility with other modules that import from here
export { defaultOpenCodeDbPath, defaultHermesDbPath, defaultQoderDbPath, defaultCursorDbPath, defaultKiloDbPath, defaultGooseDbPath, defaultZedDbPath, defaultZcodeDbPath } from '../discovery.js'

/**
 * Extract cwd from a parsed JSONL first-line object.
 * Different tools store cwd in different locations:
 * - Claude Code: top-level `cwd`
 * - Codex: `payload.cwd` (type: session_meta)
 * - Gemini/Kimi/CodeBuddy/Grok/Craft/Droid/OMP/Pi: top-level `cwd` (if present)
 * - OpenClaw: `workspaceDir` is always .openclaw/workspace, not useful
 * - Copilot: no cwd field
 */
function extractCwdFromJson(data: Record<string, unknown>): string | undefined {
  // Top-level cwd (Claude Code, generic tools)
  if (typeof data.cwd === 'string' && data.cwd) return data.cwd

  // Nested payload.cwd (Codex session_meta)
  const payload = data.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>
    if (typeof p.cwd === 'string' && p.cwd) return p.cwd
  }

  return undefined
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
  if (tool === 'copilot') {
    // OTEL: ~/.copilot/otel/copilot-otel-20250601.jsonl → filename
    const parts = filePath.split('/')
    return (parts.pop() ?? '').replace('.jsonl', '')
  }
  if (tool === 'pi') {
    // Extract UUID from filename like 2026-06-08T14-04-37-182Z_019ea78c-b5be-711c-8f30-c8fc56c92b85.jsonl
    const filename = filePath.split('/').pop() ?? ''
    const match = filename.match(/_([^_]+)\.jsonl$/)
    return match ? match[1] : filename.replace('.jsonl', '')
  }
  return 'unknown'
}

const CHARS_PER_TOKEN = 4

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function parseUiMessagesFile(options: {
  filePath: string
  tool: 'roocode' | 'kilocode'
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  exchangeRate?: number
}): { records: StatsRecord[]; errors: string[] } {
  const { filePath, tool, device, deviceInstanceId, platform, now, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []

  let messages: any[]
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    messages = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return { records, errors: [`${filePath}: ${e instanceof Error ? e.message : e}`] }
  }

  const taskId = filePath.replace(/\\/g, '/').split('/').slice(-2, -1)[0] || 'unknown'
  for (const [index, message] of messages.entries()) {
    if (message?.say !== 'api_req_started' || typeof message.text !== 'string') continue
    let payload: any
    try {
      payload = JSON.parse(message.text)
    } catch {
      continue
    }

    const inputTokens = toNumber(payload.tokensIn)
    const outputTokens = toNumber(payload.tokensOut)
    const cacheReadTokens = toNumber(payload.cacheReads)
    const cacheWriteTokens = toNumber(payload.cacheWrites)
    const thinkingTokens = toNumber(payload.reasoningTokens ?? payload.reasoning)
    if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + thinkingTokens === 0) continue

    const model = typeof payload.model === 'string' && payload.model.trim()
      ? payload.model.trim()
      : typeof payload.modelId === 'string' && payload.modelId.trim()
        ? payload.modelId.trim()
        : typeof payload.apiProtocol === 'string' && payload.apiProtocol.trim()
          ? `protocol:${payload.apiProtocol.trim().toLowerCase()}`
          : 'unknown'
    const provider = typeof payload.inferenceProvider === 'string' && payload.inferenceProvider.trim()
      ? payload.inferenceProvider.trim().toLowerCase()
      : inferProvider(model)
    const ts = typeof message.ts === 'number' ? message.ts : now
    const recordId = generateRecordId(deviceInstanceId, `${filePath}:${index}`, ts)
    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens }
    const calculatedCost = model !== 'unknown' ? calculateCost(model, tokenArgs, exchangeRate) : 0
    const logCost = Number(payload.cost)
    const hasLogCost = Number.isFinite(logCost) && logCost > 0

    records.push({
      id: recordId,
      ts,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: index,
      tool,
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost: hasLogCost ? logCost : calculatedCost,
      costSource: hasLogCost ? 'log' : calculatedCost > 0 ? 'pricing' : 'unknown',
      sessionId: taskId,
      sourceFile: filePath,
      device,
      deviceInstanceId,
      platform,
    })
  }

  return { records, errors }
}

function normalizeKiroModel(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'kiro-agent'
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/^(anthropic\.|openai\.|aws\.)/, '')
    .replace(/:\d+$/, '')
    .replace(/-\d{8}-v\d+(?:-\d+)?$/i, '')
}

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function pathIsFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function parseKiroSessionFile(options: {
  filePath: string
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  exchangeRate?: number
}): { records: StatsRecord[]; errors: string[] } {
  const { filePath, device, deviceInstanceId, platform, now, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []

  let parsed: any
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch (e) {
    return { records, errors: [`${filePath}: ${e instanceof Error ? e.message : e}`] }
  }

  // Try workspace-sessions format: history[].promptLogs[]
  if (Array.isArray(parsed?.history) && !parsed?.session_state) {
    return parseKiroWorkspaceSession({ filePath, parsed, device, deviceInstanceId, platform, now, exchangeRate })
  }

  const turns = parsed?.session_state?.conversation_metadata?.user_turn_metadatas
  if (!Array.isArray(turns)) return { records, errors }
  const sessionId = typeof parsed?.session_id === 'string' && parsed.session_id
    ? parsed.session_id
    : extractSessionId(filePath, 'kiro')
  const sessionModel = parsed?.session_state?.rts_model_state?.model_info?.model_id
    ?? parsed?.session_state?.rts_model_state?.model_info?.model_name

  for (const [index, turn] of turns.entries()) {
    const inputTokens = toNumber(turn?.input_token_count)
    const outputTokens = toNumber(turn?.output_token_count)
    if (inputTokens + outputTokens === 0) continue

    const model = normalizeKiroModel(turn?.model_id ?? sessionModel)
    const recordTs = parseTimestamp(
      turn?.request_start_timestamp_ms ?? turn?.start_timestamp ?? turn?.end_timestamp,
      now,
    )
    const requestId = turn?.loop_id?.rand != null
      ? `${sessionId}:${turn.loop_id.rand}`
      : Array.isArray(turn?.message_ids) && turn.message_ids[0]
        ? String(turn.message_ids[0])
        : String(index)
    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
    const cost = calculateCost(model, tokenArgs, exchangeRate)

    records.push({
      id: generateRecordId(deviceInstanceId, `${filePath}:${requestId}`, recordTs),
      ts: recordTs,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: index,
      tool: 'kiro',
      model,
      provider: inferProvider(model),
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost,
      costSource: cost > 0 ? 'pricing' : 'unknown',
      sessionId,
      sourceFile: filePath,
      device,
      deviceInstanceId,
      platform,
    })
  }

  return { records, errors }
}

function parseKiroWorkspaceSession(options: {
  filePath: string
  parsed: any
  device: string
  deviceInstanceId: string
  platform?: string
  now: number
  exchangeRate?: number
}): { records: StatsRecord[]; errors: string[] } {
  const { filePath, parsed, device, deviceInstanceId, platform, now, exchangeRate } = options
  const records: StatsRecord[] = []
  const errors: string[] = []

  const sessionId = parsed?.sessionId ?? extractSessionId(filePath, 'kiro')

  // Try to load dateCreated from sibling sessions.json
  let sessionTs = now
  try {
    const dir = dirname(filePath)
    const sessionsJson = readFileSync(join(dir, 'sessions.json'), 'utf-8')
    const sessions = JSON.parse(sessionsJson)
    const match = Array.isArray(sessions) && sessions.find((s: any) => s.sessionId === sessionId)
    if (match?.dateCreated) {
      const dc = Number(match.dateCreated)
      if (Number.isFinite(dc) && dc > 0) sessionTs = dc < 1e12 ? dc * 1000 : dc
    }
  } catch {}

  // Collect promptLogs from all history entries
  const allLogs: Array<{ log: any; index: number }> = []
  let logIndex = 0
  for (const entry of parsed.history ?? []) {
    for (const pl of entry?.promptLogs ?? []) {
      allLogs.push({ log: pl, index: logIndex++ })
    }
  }

  // Estimate tokens from context usage percentage if available
  const contextLength = parsed?.config?.models?.[0]?.contextLength ?? 40000
  const maxTokens = parsed?.config?.models?.[0]?.completionOptions?.maxTokens ?? 4000
  const contextPct = Number(parsed?.contextUsagePercentageBySession?.[sessionId] ?? parsed?.contextUsagePercentage ?? 0) / 100
  const totalInputEstimate = contextPct > 0 ? Math.floor(contextLength * contextPct) : 0
  const hasNoTokenData = allLogs.every(({ log }) => {
    const pl = typeof log.prompt === 'string' ? log.prompt.length : 0
    const cl = typeof log.completion === 'string' ? log.completion.length : 0
    return pl < 100 && cl === 0
  })

  for (const { log, index } of allLogs) {
    const promptLen = typeof log.prompt === 'string' ? log.prompt.length : 0
    const completionLen = typeof log.completion === 'string' ? log.completion.length : 0
    let inputTokens: number
    let outputTokens: number
    if (hasNoTokenData) {
      // Kiro does not record actual prompt/completion text; use heuristics
      inputTokens = totalInputEstimate > 0 && allLogs.length > 0
        ? Math.max(1, Math.floor(totalInputEstimate / allLogs.length))
        : 200
      outputTokens = Math.floor(maxTokens * 0.3)
    } else {
      inputTokens = totalInputEstimate > 0 && allLogs.length > 0
        ? Math.max(1, Math.floor(totalInputEstimate / allLogs.length))
        : Math.max(1, Math.floor(promptLen / CHARS_PER_TOKEN))
      outputTokens = completionLen > 0
        ? Math.floor(completionLen / CHARS_PER_TOKEN)
        : Math.floor(maxTokens * 0.3)
    }
    if (inputTokens + outputTokens === 0) continue

    const model = normalizeKiroModel(log.completionOptions?.model ?? log.modelTitle)
    const provider = typeof log.provider === 'string' && log.provider.trim() ? log.provider.trim().toLowerCase() : inferProvider(model)
    const recordTs = sessionTs + index
    const tokenArgs = { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
    const cost = calculateCost(model, tokenArgs, exchangeRate)
    const sourceId = `${sessionId}:${index}`

    records.push({
      id: generateRecordId(deviceInstanceId, `${filePath}:${sourceId}`, recordTs),
      ts: recordTs,
      ingestedAt: now,
      updatedAt: now,
      lineOffset: index,
      tool: 'kiro',
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
      cost,
      costSource: cost > 0 ? 'pricing' : 'unknown',
      sessionId,
      sourceFile: filePath,
      device,
      deviceInstanceId,
      platform,
    })
  }

  return { records, errors }
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

  const toolPaths = discoverLogFiles()
  const aggregator = new Aggregator()

  let parsedCount = 0
  let toolCallCount = 0
  const errors: string[] = []

  const onProgress = options?.onProgress ?? (() => {})

  for (const { tool, paths } of toolPaths) {
    if (filterTool && tool !== filterTool) continue
    const toolTotal = paths.length
    let toolIndex = 0

    for (const filePath of paths) {
      toolIndex++
      try {
        const stat = statSync(filePath)
        const entry = wm.getEntry(tool, filePath)
        const offset = entry?.offset ?? 0

        if (offset >= stat.size) {
          onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
          continue // No new data
        }

        if ((tool === 'roocode' || tool === 'kilocode') && filePath.endsWith('ui_messages.json')) {
          const result = parseUiMessagesFile({
            filePath,
            tool,
            device,
            deviceInstanceId,
            platform: devicePlatform,
            now: Date.now(),
            exchangeRate,
          })
          for (const record of result.records) {
            insertRecord(db, record)
            parsedCount++
          }
          errors.push(...result.errors)
          wm.setEntry(tool, filePath, {
            offset: stat.size,
            size: stat.size,
            mtime: stat.mtimeMs,
          })
          wm.save()
          onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
          continue
        }

        if (tool === 'kiro' && filePath.endsWith('.json')) {
          const result = parseKiroSessionFile({
            filePath,
            device,
            deviceInstanceId,
            platform: devicePlatform,
            now: Date.now(),
            exchangeRate,
          })
          for (const record of result.records) {
            insertRecord(db, record)
            parsedCount++
          }
          errors.push(...result.errors)
          wm.setEntry(tool, filePath, {
            offset: stat.size,
            size: stat.size,
            mtime: stat.mtimeMs,
          })
          wm.save()
          onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
          continue
        }

        if (tool === 'kiro' && filePath.endsWith('.jsonl')) {
          const content = readFileSync(filePath, 'utf-8')
          const lines = content.split('\n')
          let byteOffset = 0
          for (const line of lines) {
            if (!line.trim()) {
              byteOffset += Buffer.byteLength(line, 'utf-8') + 1
              continue
            }
            try {
              const data = JSON.parse(line)
              const inputTokens = toNumber(data.promptTokens ?? data.inputTokens ?? data.tokensIn)
              const outputTokens = toNumber(data.generatedTokens ?? data.outputTokens ?? data.tokensOut)
              if (inputTokens + outputTokens === 0) {
                byteOffset += Buffer.byteLength(line, 'utf-8') + 1
                continue
              }
              const model = normalizeKiroModel(data.model)
              const provider = typeof data.provider === 'string' && data.provider.trim() ? data.provider.trim().toLowerCase() : inferProvider(model)
              const recordTs = stat.mtimeMs
              const tokenArgs = { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
              const cost = calculateCost(model, tokenArgs, exchangeRate)
              const recordId = generateRecordId(deviceInstanceId, `${filePath}:${byteOffset}`, recordTs)
              const record: StatsRecord = {
                id: recordId,
                ts: recordTs,
                ingestedAt: Date.now(),
                updatedAt: Date.now(),
                lineOffset: byteOffset,
                tool: 'kiro',
                model,
                provider,
                inputTokens,
                outputTokens,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                thinkingTokens: 0,
                cost,
                costSource: cost > 0 ? 'pricing' : 'unknown',
                sessionId: filePath,
                sourceFile: filePath,
                device,
                deviceInstanceId,
                platform: devicePlatform,
              }
              insertRecord(db, record)
              parsedCount++
            } catch {}
            byteOffset += Buffer.byteLength(line, 'utf-8') + 1
          }
          wm.setEntry(tool, filePath, {
            offset: stat.size,
            size: stat.size,
            mtime: stat.mtimeMs,
          })
          wm.save()
          onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
          continue
        }

        if (tool === 'kelivo' && (filePath.endsWith('chats.json') || filePath.endsWith('.zip'))) {
          const result = await runParseKelivo({
            filePath,
            device,
            deviceInstanceId,
            platform: devicePlatform,
            now: Date.now(),
            exchangeRate,
          })
          for (const record of result.records) {
            insertRecord(db, record)
            parsedCount++
          }
          errors.push(...result.errors)
          wm.setEntry(tool, filePath, {
            offset: stat.size,
            size: stat.size,
            mtime: stat.mtimeMs,
          })
          wm.save()
          onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
          continue
        }

        // Cursor agent-transcript JSONL (fallback for PRIVACY_MODE_NO_STORAGE)
        if (tool === 'cursor' && filePath.endsWith('.jsonl') && filePath.includes('agent-transcripts')) {
          const est = runParseCursorTranscript({
            jsonlPath: filePath,
            device,
            deviceInstanceId,
            platform: devicePlatform,
            now: Date.now(),
          })
          if (est.inputTextChars + est.outputTextChars > 0) {
            const sessionId = filePath.split('/').slice(-2, -1)[0] || 'unknown'
            const recordTs = stat.mtimeMs
            const tokenArgs = { inputTokens: est.inputTextChars, outputTokens: est.outputTextChars, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 }
            const cost = calculateCost('cursor-composer', tokenArgs, exchangeRate)
            const recordId = generateRecordId(deviceInstanceId, filePath, recordTs)
            const record: StatsRecord = {
              id: recordId,
              ts: recordTs,
              ingestedAt: Date.now(),
              updatedAt: Date.now(),
              lineOffset: 0,
              tool: 'cursor',
              model: 'cursor-composer',
              provider: 'cursor',
              inputTokens: est.inputTextChars,
              outputTokens: est.outputTextChars,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              thinkingTokens: 0,
              cost,
              costSource: cost > 0 ? 'pricing' : 'unknown',
              sessionId,
              sourceFile: filePath,
              device,
              deviceInstanceId,
              platform: devicePlatform,
            }
            insertRecord(db, record)
            parsedCount++
          }
          wm.setEntry(tool, filePath, {
            offset: stat.size,
            size: stat.size,
            mtime: stat.mtimeMs,
          })
          wm.save()
          onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
          continue
        }

        const content = readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        let byteOffset = 0

        // Extract cwd from the first line (Claude Code: top-level, Codex: payload.cwd)
        let fileCwd: string | undefined
        try {
          const firstData = JSON.parse(lines[0])
          fileCwd = extractCwdFromJson(firstData)
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

        // Handle finalize (orphan tool calls for Codex, deduped fallback records for Copilot OTEL, etc.)
        const orphanResults = aggregator.finalize()
        for (const result of orphanResults) {
          if (result.record) {
            insertRecord(db, result.record)
            parsedCount++
          }
          for (const tc of result.toolCalls) {
            insertToolCall(db, tc)
            toolCallCount++
          }
        }

        // Write cwd for all records from this file that don't have it yet.
        // Bump updated_at so a cwd added to already-synced records re-propagates.
        if (fileCwd) {
          db.prepare(`UPDATE records SET cwd = ?, updated_at = ? WHERE source_file = ? AND cwd = ''`).run(fileCwd, Date.now(), filePath)
        }

        wm.setEntry(tool, filePath, {
          offset: stat.size,
          size: stat.size,
          mtime: stat.mtimeMs,
        })
        wm.save()
        onProgress({ phase: 'Parsing logs', tool, current: toolIndex, total: toolTotal, records: parsedCount, toolCalls: toolCallCount })
      } catch (e) {
        errors.push(`${filePath}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  // OpenCode: SQLite database
  const openCodeDbPath = options?.openCodeDbPath ?? getDbPath('opencode') ?? ''
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
  const hermesDbPath = options?.hermesDbPath ?? getDbPath('hermes') ?? ''
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
  const qoderDbPath = options?.qoderDbPath ?? getDbPath('qoder-db') ?? ''
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
  const cursorDbPath = options?.cursorDbPath ?? getDbPath('cursor') ?? ''
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
  const kiloDbPath = getDbPath('kilocode-db') ?? ''
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

  // Goose: SQLite sessions database
  const gooseDbPath = getDbPath('goose') ?? ''
  if ((!filterTool || filterTool === 'goose') && existsSync(gooseDbPath)) {
    try {
      const gooseDb = new Database(gooseDbPath, { readonly: true })
      try {
        const result = runParseGoose(gooseDb, {
          dbPath: gooseDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getGooseCursor(),
          exchangeRate,
        })
        for (const record of result.records) insertRecord(db, record)
        if (result.nextCursor) {
          wm.setGooseCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'goose', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        gooseDb.close()
      }
    } catch (e) {
      errors.push(`${gooseDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Kiro: tokens_generated or conversations_v2 SQLite data
  const kiroDbPath = getDbPath('kiro') ?? ''
  if ((!filterTool || filterTool === 'kiro') && pathIsFile(kiroDbPath)) {
    try {
      const kiroDb = new Database(kiroDbPath, { readonly: true })
      try {
        const result = runParseKiro(kiroDb, {
          dbPath: kiroDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getKiroCursor(),
          exchangeRate,
        })
        for (const record of result.records) insertRecord(db, record)
        if (result.nextCursor) {
          wm.setKiroCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'kiro', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        kiroDb.close()
      }
    } catch (e) {
      errors.push(`${kiroDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Zed: SQLite threads database. Currently imports JSON-encoded thread rows.
  const zedDbPath = getDbPath('zed') ?? ''
  if ((!filterTool || filterTool === 'zed') && existsSync(zedDbPath)) {
    try {
      const zedDb = new Database(zedDbPath, { readonly: true })
      try {
        const result = runParseZed(zedDb, {
          dbPath: zedDbPath,
          device,
          deviceInstanceId,
          platform: devicePlatform,
          now: Date.now(),
          cursor: wm.getZedCursor(),
          exchangeRate,
        })
        for (const record of result.records) insertRecord(db, record)
        if (result.nextCursor) {
          wm.setZedCursor(result.nextCursor)
          wm.save()
        }
        parsedCount += result.records.length
        errors.push(...result.errors)
        onProgress({ phase: 'Parsing SQLite', tool: 'zed', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
      } finally {
        zedDb.close()
      }
    } catch (e) {
      errors.push(`${zedDbPath}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // ZCode: SQLite usage database (model_usage + tool_usage tables).
  if (!filterTool || filterTool === 'zcode') {
    const zcodeDbPath = getDbPath('zcode') ?? ''
    if (existsSync(zcodeDbPath)) {
      try {
        const zcodeDb = new Database(zcodeDbPath, { readonly: true })
        try {
          const result = runParseZcode(zcodeDb, {
            dbPath: zcodeDbPath,
            device,
            deviceInstanceId,
            platform: devicePlatform,
            now: Date.now(),
            cursor: wm.getZcodeCursor(),
            toolCursor: wm.getZcodeToolCursor(),
            exchangeRate,
          })
          for (const record of result.records) insertRecord(db, record)
          for (const tc of result.toolCalls) insertToolCall(db, tc)
          if (result.nextCursor) {
            wm.setZcodeCursor(result.nextCursor)
          }
          if (result.nextToolCursor) {
            wm.setZcodeToolCursor(result.nextToolCursor)
          }
          if (result.nextCursor || result.nextToolCursor) {
            wm.save()
          }
          parsedCount += result.records.length
          toolCallCount += result.toolCalls.length
          errors.push(...result.errors)
          onProgress({ phase: 'Parsing SQLite', tool: 'zcode', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
        } finally {
          zcodeDb.close()
        }
      } catch (e) {
        errors.push(`${zcodeDbPath}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  // Trae: parse cursorDiskKV if present (Trae is a Cursor/VS Code fork).
  // Trae/Cursor CN stores chat data in encrypted database.db; token counts are unavailable.
  // Fall back to reading git tags from snapshot directories for session metadata.
  const traeDbPath = getDbPath('trae') ?? ''
  if ((!filterTool || filterTool === 'trae') && pathIsFile(traeDbPath)) {
    const traeLastImported = wm.getTraeLastImported?.() ?? 0
    const result = runParseTrae({
      dbPath: traeDbPath,
      device,
      deviceInstanceId,
      platform: devicePlatform,
      now: Date.now(),
      lastImportedAt: traeLastImported,
    })
    for (const record of result.records) insertRecord(db, record)
    for (const tc of result.toolCalls) insertToolCall(db, tc)
    parsedCount += result.records.length
    toolCallCount += result.toolCalls.length
    errors.push(...result.errors)
    if (result.lastImportedAt > traeLastImported) {
      wm.setTraeLastImported?.(result.lastImportedAt)
      wm.save()
    }
    onProgress({ phase: 'Parsing SQLite', tool: 'trae', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
  }

  // CodeBuddy IDE: per-message JSON files under CodeBuddyExtension/Data.
  const codeBuddyIdeDir = getDbPath('codebuddy-ide') ?? ''
  if ((!filterTool || filterTool === 'codebuddy') && existsSync(codeBuddyIdeDir)) {
    try {
      const cbCursor = wm.getCodeBuddyIdeCursor()
      const result = runParseCodeBuddy({
        dataDir: codeBuddyIdeDir,
        device,
        deviceInstanceId,
        platform: devicePlatform,
        now: Date.now(),
        cursor: cbCursor,
        exchangeRate,
      })
      for (const record of result.records) insertRecord(db, record)
      parsedCount += result.records.length
      errors.push(...result.errors)
      if (result.nextCursor > cbCursor) {
        wm.setCodeBuddyIdeCursor(result.nextCursor)
        wm.save()
      }
      onProgress({ phase: 'Parsing logs', tool: 'codebuddy', current: 1, total: 1, records: parsedCount, toolCalls: toolCallCount })
    } catch (e) {
      errors.push(`${codeBuddyIdeDir}: ${e instanceof Error ? e.message : e}`)
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

  // Backfill Hermes records that used a bare dbPath as source_file.
  // Now we use "dbPath:session:<id>:<title>" for better project grouping.
  backfillHermesSourceFiles(db)

  // Backfill cwd for records parsed before this feature was added.
  backfillCwd(db)

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

/**
 * Backfill cwd for records parsed before cwd extraction existed.
 * Reads only the first 2 KB of each source file — enough to find the cwd field.
 *
 * Bumps updated_at on every changed record so the enriched cwd propagates to
 * other devices on the next sync. getUnsyncedRecords selects records where
 * updated_at > synced_at, and mergeRecords only overwrites a remote record when
 * the incoming updatedAt is strictly newer — so without this bump, backfilled
 * cwd never reaches peers and cross-device project stats stay broken (issue #12).
 */
export function backfillCwd(db: Database.Database): void {
  const staleFiles = db.prepare(
    `SELECT DISTINCT source_file FROM records WHERE cwd = '' AND source_file NOT LIKE 'synced/%'`
  ).all() as { source_file: string }[]
  const updateStmt = db.prepare(
    `UPDATE records SET cwd = ?, updated_at = ? WHERE source_file = ? AND cwd = ''`
  )
  for (const { source_file } of staleFiles) {
    try {
      const fd = openSync(source_file, 'r')
      const buf = Buffer.alloc(2048)
      const n = readSync(fd, buf, 0, 2048, 0)
      closeSync(fd)
      const firstLine = buf.subarray(0, n).toString('utf8').split('\n')[0]
      const data = JSON.parse(firstLine)
      const cwd = extractCwdFromJson(data)
      if (cwd) {
        updateStmt.run(cwd, Date.now(), source_file)
      }
    } catch {}
  }
}

export function backfillHermesSourceFiles(db: Database.Database): void {
  // Old hermes records used the bare dbPath as source_file.
  // Update them to "dbPath:session:<id>:<title>" for per-session project grouping.
  const rows = db.prepare(`
    SELECT DISTINCT r.source_file, r.session_id
    FROM records r
    WHERE r.tool = 'hermes'
      AND r.source_file NOT LIKE '%:session:%'
      AND r.source_file NOT LIKE 'synced/%'
  `).all() as { source_file: string; session_id: string }[]

  if (rows.length === 0) return

  // Try to read session titles from the hermes DB
  const dbPath = rows[0].source_file
  let titleMap: Map<string, string> = new Map()
  try {
    if (existsSync(dbPath)) {
      const hermesDb = new Database(dbPath, { readonly: true })
      try {
        const sessions = hermesDb.prepare(
          `SELECT id, title FROM sessions WHERE title IS NOT NULL AND title != ''`
        ).all() as { id: string; title: string }[]
        for (const s of sessions) titleMap.set(s.id, s.title)
      } finally {
        hermesDb.close()
      }
    }
  } catch {}

  // Bump updated_at so the rewritten source_file propagates cross-device on the
  // next sync (see backfillCwd for why the bump is required).
  const updateStmt = db.prepare(`UPDATE records SET source_file = ?, updated_at = ? WHERE tool = 'hermes' AND session_id = ? AND source_file = ?`)
  for (const row of rows) {
    const title = (titleMap.get(row.session_id) || '').replace(/[/\\:]/g, '_').slice(0, 80)
    const newSourceFile = title
      ? `${row.source_file}:session:${row.session_id}:${title}`
      : `${row.source_file}:session:${row.session_id}`
    updateStmt.run(newSourceFile, Date.now(), row.session_id, row.source_file)
  }
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
