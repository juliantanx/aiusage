import type { ParseContext, ParseResult, Parser, StatsRecord } from '../types.js'
import { generateRecordId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost, resolvePrice } from '../pricing.js'

const UNKNOWN_MODEL = 'grok-unknown'

interface ActiveTurn {
  baselineTotal: number
  maxTotal: number
  lineOffset: number
  timestamp: number
  model: string
  sessionId: string
  context: ParseContext
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.floor(parsed)
}

function timestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sessionIdFromPath(sourceFile: string): string | null {
  const parts = sourceFile.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : null
}

function cwdFromPath(sourceFile: string): string | undefined {
  const parts = sourceFile.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length < 3 || parts[parts.length - 1] !== 'updates.jsonl') return undefined
  try {
    const decoded = decodeURIComponent(parts[parts.length - 3])
    return decoded || undefined
  } catch {
    return undefined
  }
}

export class GrokParser implements Parser {
  readonly tool = 'grok' as const
  private currentModel = UNKNOWN_MODEL
  private lastTotal: number | null = null
  private activeTurn: ActiveTurn | null = null
  private fallback: ActiveTurn | null = null

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    if (parsed?.method !== 'session/update' || !parsed?.params) return null

    const params = parsed.params
    const update = params.update
    const model = stringValue(update?._meta?.modelId)
      ?? stringValue(params?._meta?.modelId)
    if (model) this.currentModel = model

    const recordTimestamp = timestamp(
      params?._meta?.agentTimestampMs
        ?? update?._meta?.agentTimestampMs
        ?? params?.timestamp
        ?? parsed?.timestamp
        ?? parsed?.ts,
      context.now,
    )
    const sessionId = stringValue(params.sessionId)
      ?? sessionIdFromPath(context.sourceFile)
      ?? context.sessionId

    let completed: ParseResult | null = null
    if (update?.sessionUpdate === 'user_message_chunk') {
      if (this.activeTurn) completed = this.buildResult(this.activeTurn)
      this.fallback = null
      this.activeTurn = {
        baselineTotal: this.lastTotal ?? 0,
        maxTotal: this.lastTotal ?? 0,
        lineOffset: context.lineOffset,
        timestamp: recordTimestamp,
        model: this.currentModel,
        sessionId,
        context,
      }
    }

    const total = nonNegativeInteger(
      params?._meta?.totalTokens
        ?? update?._meta?.totalTokens
        ?? update?.totalTokens
        ?? params?.totalTokens,
    )
    if (total == null) return completed
    if (this.lastTotal != null && total < this.lastTotal) return completed

    if (this.activeTurn) {
      if (total > this.activeTurn.maxTotal) {
        this.activeTurn.maxTotal = total
        this.activeTurn.timestamp = recordTimestamp
        this.activeTurn.context = context
        this.activeTurn.sessionId = sessionId
      }
      if (this.activeTurn.model === UNKNOWN_MODEL && this.currentModel !== UNKNOWN_MODEL) {
        this.activeTurn.model = this.currentModel
      }
    } else {
      if (!this.fallback) {
        this.fallback = {
          baselineTotal: 0,
          maxTotal: total,
          lineOffset: context.lineOffset,
          timestamp: recordTimestamp,
          model: this.currentModel,
          sessionId,
          context,
        }
      } else if (total > this.fallback.maxTotal) {
        this.fallback.maxTotal = total
        this.fallback.timestamp = recordTimestamp
        this.fallback.context = context
        this.fallback.sessionId = sessionId
      }
      if (this.fallback.model === UNKNOWN_MODEL && this.currentModel !== UNKNOWN_MODEL) {
        this.fallback.model = this.currentModel
      }
    }

    if (this.lastTotal == null || total > this.lastTotal) this.lastTotal = total
    return completed
  }

  finalize(): ParseResult[] {
    const turn = this.activeTurn ?? this.fallback
    const result = turn ? this.buildResult(turn) : null
    this.reset()
    return result ? [result] : []
  }

  private buildResult(turn: ActiveTurn): ParseResult | null {
    const inputTokens = turn.maxTotal - turn.baselineTotal
    if (inputTokens <= 0) return null

    const usage = {
      inputTokens,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      thinkingTokens: 0,
    }
    const hasPrice = resolvePrice(turn.model) != null
    const record: StatsRecord = {
      id: generateRecordId(turn.context.deviceInstanceId, turn.context.sourceFile, turn.lineOffset),
      ts: turn.timestamp,
      ingestedAt: turn.context.now,
      updatedAt: turn.context.now,
      lineOffset: turn.lineOffset,
      tool: this.tool,
      model: turn.model,
      provider: inferProvider(turn.model),
      ...usage,
      cost: hasPrice ? calculateCost(turn.model, usage, turn.context.exchangeRate) : 0,
      costSource: hasPrice ? 'pricing' : 'unknown',
      sessionId: turn.sessionId,
      sourceFile: turn.context.sourceFile,
      cwd: cwdFromPath(turn.context.sourceFile),
      device: turn.context.device,
      deviceInstanceId: turn.context.deviceInstanceId,
      platform: turn.context.platform,
    }
    return { record, toolCalls: [] }
  }

  private reset(): void {
    this.currentModel = UNKNOWN_MODEL
    this.lastTotal = null
    this.activeTurn = null
    this.fallback = null
  }
}
