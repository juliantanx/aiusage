import type { Parser, ParseResult, ParseContext, StatsRecord, Tool } from '../types.js'
import { generateRecordId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

/**
 * Parser for GitHub Copilot OTEL JSONL files.
 *
 * Copilot CLI (v1.0.4+) exports OpenTelemetry data when configured:
 *   COPILOT_OTEL_ENABLED=true
 *   COPILOT_OTEL_EXPORTER_TYPE=file
 *   COPILOT_OTEL_FILE_EXPORTER_PATH=~/.copilot/otel/copilot-otel-$(date +%Y%m%d).jsonl
 *
 * Token attributes follow OTel GenAI Semantic Conventions.
 *
 * Strategy (following ccusage priority):
 * - ChatSpan records are primary — emitted immediately via parseLine
 * - InferenceLog, AgentTurnLog, AgentSummarySpan are fallbacks — buffered
 *   and emitted via finalize() only if no higher-priority record exists
 *   for the same trace/response
 */

const enum RecordType { ChatSpan, InferenceLog, AgentTurnLog, AgentSummarySpan }

interface Candidate {
  type: RecordType
  traceId: string | null
  responseId: string | null
  result: ParseResult
}

interface TraceCtx { model?: string; sessionId?: string }

export class CopilotParser implements Parser {
  readonly tool: Tool = 'copilot'

  private traceCtxs = new Map<string, TraceCtx>()
  private coveredTraces = new Set<string>()
  private coveredResponses = new Set<string>()
  private fallback: Candidate[] = []

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let rec: any
    try { rec = JSON.parse(line) } catch { return null }
    if (!rec || typeof rec !== 'object') return null

    const attrs = rec.attributes
    if (!attrs || typeof attrs !== 'object') return null

    // ── Collect trace context ──────────────────────────────────────────
    const traceId = extractTraceId(rec)
    if (traceId) {
      const ctx = this.traceCtxs.get(traceId) ?? {}
      if (!ctx.model) ctx.model = extractModel(attrs) ?? undefined
      if (!ctx.sessionId) ctx.sessionId = extractSessionId(attrs) ?? undefined
      this.traceCtxs.set(traceId, ctx)
    }

    // ── Classify ───────────────────────────────────────────────────────
    const type = classify(rec, attrs)
    if (type === null) return null

    // ── Token usage ────────────────────────────────────────────────────
    const rawInput = attrNum(attrs, 'gen_ai.usage.input_tokens')
    const outputTokens = attrNum(attrs, 'gen_ai.usage.output_tokens')
    const cacheReadTokens = attrNum(attrs, 'gen_ai.usage.cache_read.input_tokens')
    const cacheWriteTokens = attrNumFirst(attrs, [
      'gen_ai.usage.cache_write.input_tokens',
      'gen_ai.usage.cache_creation.input_tokens',
    ])
    const thinkingTokens = attrNumFirst(attrs, [
      'gen_ai.usage.reasoning.output_tokens',
      'gen_ai.usage.reasoning_tokens',
    ])

    // OTEL input_tokens includes cache reads; subtract to get net input
    const inputTokens = Math.max(0, rawInput - cacheReadTokens)

    if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + thinkingTokens === 0) return null

    // ── Model & session ────────────────────────────────────────────────
    const traceCtx = traceId ? this.traceCtxs.get(traceId) : undefined
    const model = extractModel(attrs) ?? traceCtx?.model ?? 'unknown'
    const sessionId = extractSessionId(attrs) ?? traceCtx?.sessionId ?? context.sessionId
    const responseId = attrStr(attrs, 'gen_ai.response.id')
    const ts = extractTimestamp(rec) ?? context.now

    const provider = inferProvider(model)
    const cost = calculateCost(model, {
      inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens,
    }, context.exchangeRate)

    const recordId = generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset)

    const statsRecord: StatsRecord = {
      id: recordId, ts, ingestedAt: context.now, updatedAt: context.now,
      lineOffset: context.lineOffset, tool: this.tool, model, provider,
      inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, thinkingTokens,
      cost, costSource: 'pricing',
      sessionId, sourceFile: context.sourceFile,
      device: context.device, deviceInstanceId: context.deviceInstanceId, platform: context.platform,
    }

    const parseResult: ParseResult = { record: statsRecord, toolCalls: [] }

    // ChatSpan → emit immediately (highest priority)
    if (type === RecordType.ChatSpan) {
      if (traceId) this.coveredTraces.add(traceId)
      if (responseId) this.coveredResponses.add(responseId)
      return parseResult
    }

    // Others → buffer for dedup in finalize
    this.fallback.push({ type, traceId, responseId, result: parseResult })
    return null
  }

  finalize(): ParseResult[] {
    // Build per-type trace/response sets for cascading dedup
    const inferTraces = new Set<string>()
    const inferResponses = new Set<string>()
    const turnTraces = new Set<string>()
    const turnResponses = new Set<string>()

    for (const c of this.fallback) {
      if (c.type === RecordType.InferenceLog) {
        if (c.traceId) inferTraces.add(c.traceId)
        if (c.responseId) inferResponses.add(c.responseId)
      } else if (c.type === RecordType.AgentTurnLog) {
        if (c.traceId) turnTraces.add(c.traceId)
        if (c.responseId) turnResponses.add(c.responseId)
      }
    }

    const results: ParseResult[] = []
    for (const c of this.fallback) {
      if (shouldEmit(c, this.coveredTraces, this.coveredResponses, inferTraces, inferResponses, turnTraces, turnResponses)) {
        results.push(c.result)
      }
    }

    this.fallback = []
    this.coveredTraces.clear()
    this.coveredResponses.clear()
    this.traceCtxs.clear()
    return results
  }
}

// ── Dedup ──────────────────────────────────────────────────────────────────

function shouldEmit(
  c: Candidate,
  chatTraces: Set<string>, chatResp: Set<string>,
  inferTraces: Set<string>, inferResp: Set<string>,
  turnTraces: Set<string>, turnResp: Set<string>,
): boolean {
  const tIn = (s: Set<string>) => c.traceId != null && s.has(c.traceId)
  const rIn = (s: Set<string>) => c.responseId != null && s.has(c.responseId)

  switch (c.type) {
    case RecordType.InferenceLog:
      return !tIn(chatTraces) && !rIn(chatResp)
    case RecordType.AgentTurnLog:
      return !tIn(chatTraces) && !tIn(inferTraces) && !rIn(chatResp) && !rIn(inferResp)
    case RecordType.AgentSummarySpan:
      return !tIn(chatTraces) && !tIn(inferTraces) && !tIn(turnTraces)
        && !rIn(chatResp) && !rIn(inferResp) && !rIn(turnResp)
    default:
      return false
  }
}

// ── Record classification ──────────────────────────────────────────────────

function isSpan(rec: any): boolean {
  if (rec.type === 'span') return true
  return (typeof rec.name === 'string' && rec.name.trim() !== '')
    && (typeof rec.spanId === 'string' || typeof rec.traceId === 'string'
      || rec.startTime != null || rec.endTime != null
      || rec.duration != null || rec.kind != null)
}

function classify(rec: any, attrs: any): RecordType | null {
  const opName = attrStr(attrs, 'gen_ai.operation.name')
  const name = typeof rec.name === 'string' ? rec.name : ''

  if (isSpan(rec)) {
    if (opName === 'chat' || name.startsWith('chat ')) return RecordType.ChatSpan
    if (opName === 'invoke_agent' || name.startsWith('invoke_agent ')) return RecordType.AgentSummarySpan
    return null // other spans not relevant
  }

  // Log records
  const eventName = attrStr(attrs, 'event.name')
  const body = typeof rec.body === 'string' ? rec.body : typeof rec._body === 'string' ? rec._body : ''

  if (eventName === 'gen_ai.client.inference.operation.details' || body.startsWith('GenAI inference:'))
    return RecordType.InferenceLog
  if (eventName === 'copilot_chat.agent.turn' || body.startsWith('copilot_chat.agent.turn'))
    return RecordType.AgentTurnLog

  return null
}

// ── Attribute helpers ──────────────────────────────────────────────────────

function attrStr(attrs: any, key: string): string | null {
  const v = attrs[key]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

function attrNum(attrs: any, key: string): number {
  const v = attrs[key]
  if (typeof v === 'number') return v >= 0 ? Math.round(v) : 0
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0 }
  return 0
}

function attrNumFirst(attrs: any, keys: string[]): number {
  for (const k of keys) { const v = attrNum(attrs, k); if (v > 0) return v }
  return 0
}

// ── Model & session extraction ─────────────────────────────────────────────

const MODEL_ATTRS = ['gen_ai.response.model', 'gen_ai.request.model'] as const

function extractModel(attrs: any): string | null {
  for (const key of MODEL_ATTRS) { const v = attrStr(attrs, key); if (v) return v }
  return null
}

const SESSION_ATTRS: readonly [string, number][] = [
  ['gen_ai.conversation.id', 3],
  ['copilot_chat.session_id', 3],
  ['copilot_chat.chat_session_id', 3],
  ['session.id', 3],
  ['github.copilot.interaction_id', 2],
  ['gen_ai.response.id', 1],
]

function extractSessionId(attrs: any): string | null {
  let best: string | null = null
  let bestP = 0
  for (const [key, p] of SESSION_ATTRS) {
    if (p <= bestP) continue
    const v = attrStr(attrs, key)
    if (v) { best = v; bestP = p }
  }
  return best
}

// ── Trace ID ───────────────────────────────────────────────────────────────

function extractTraceId(rec: any): string | null {
  if (typeof rec.traceId === 'string' && rec.traceId.trim()) return rec.traceId.trim()
  const sc = rec.spanContext
  if (sc && typeof sc === 'object' && typeof sc.traceId === 'string' && sc.traceId.trim()) return sc.traceId.trim()
  return null
}

// ── Timestamp extraction ───────────────────────────────────────────────────

function extractTimestamp(rec: any): number | null {
  return fromParts(rec.endTime)
    ?? fromParts(rec.startTime)
    ?? fromParts(rec.hrTime)
    ?? fromParts(rec._hrTime)
    ?? fromParts(rec.time)
    ?? fromScalar(rec.timestamp)
    ?? fromScalar(rec.observedTimestamp)
    ?? fromUnixNanos(rec.timeUnixNano)
}

function fromParts(v: unknown): number | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const s = Number(v[0]); const ns = Number(v[1])
  if (!Number.isFinite(s) || !Number.isFinite(ns)) return null
  return s * 1000 + Math.floor(ns / 1_000_000)
}

function fromScalar(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  // Auto-detect unit: nanoseconds → microseconds → milliseconds → seconds
  if (n >= 1e17) return Math.floor(n / 1e6)
  if (n >= 1e14) return Math.floor(n / 1e3)
  if (n >= 1e11) return Math.floor(n)
  return Math.floor(n * 1000)
}

function fromUnixNanos(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n / 1e6)
}
