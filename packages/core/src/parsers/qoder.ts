import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, Tool, ToolCallRecord } from '../types.js'
import { generateRecordId, generateToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost, resolvePrice } from '../pricing.js'
import { normalizeQoderModel } from '../qoder-model.js'

interface PendingToolCall {
  name: string
  ts: number
}

function toNumber(value: unknown): number {
  if (value == null) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return fallback
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : fallback
}

export class QoderParser implements Parser {
  readonly tool: Tool = 'qoder'
  private pendingToolCallsByLoopId = new Map<string, PendingToolCall[]>()

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    if (parsed.type === 'tool.requested') {
      const loopId = parsed.loop_id ?? parsed.turn_id
      const toolName = parsed.data?.tool_name
      if (typeof loopId !== 'string' || typeof toolName !== 'string' || !toolName) {
        return null
      }

      const pending = this.pendingToolCallsByLoopId.get(loopId) ?? []
      pending.push({
        name: toolName,
        ts: toTimestamp(parsed.ts, context.now),
      })
      this.pendingToolCallsByLoopId.set(loopId, pending)
      return null
    }

    if (parsed.type !== 'model.response.completed') return null

    const data = parsed.data
    if (!data || typeof data !== 'object') return null

    const ts = toTimestamp(parsed.ts, context.now)
    const rawModel = normalizeQoderModel(String(data.model ?? ''))
    const model = rawModel === 'unknown' ? 'qoder-auto' : rawModel
    const inputTokens = toNumber(data.input_tokens)
    const outputTokens = toNumber(data.output_tokens)
    const cacheReadTokens = toNumber(data.cache_read_input_tokens ?? data.cache_read_tokens)
    const cacheWriteTokens = toNumber(data.cache_creation_input_tokens ?? data.cache_write_input_tokens ?? data.cache_write_tokens)
    const thinkingTokens = toNumber(data.thinking_tokens)
      || toNumber(data.reasoning_tokens)
      || toNumber(data.reasoning_output_tokens)

    if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + thinkingTokens === 0) {
      return null
    }

    const hasPrice = resolvePrice(model) != null
    const cost = hasPrice ? calculateCost(model, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
    }, context.exchangeRate) : 0
    const costSource = hasPrice ? 'pricing' as const : 'unknown' as const
    const recordId = generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset)

    const record: StatsRecord = {
      id: recordId,
      ts,
      ingestedAt: context.now,
      updatedAt: context.now,
      lineOffset: context.lineOffset,
      tool: this.tool,
      model,
      provider: inferProvider(model),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
      cost,
      costSource,
      sessionId: context.sessionId,
      sourceFile: context.sourceFile,
      device: context.device,
      deviceInstanceId: context.deviceInstanceId,
      platform: context.platform,
    }

    const loopId = parsed.loop_id ?? parsed.turn_id
    const pendingToolCalls = typeof loopId === 'string'
      ? this.pendingToolCallsByLoopId.get(loopId) ?? []
      : []
    if (typeof loopId === 'string') {
      this.pendingToolCallsByLoopId.delete(loopId)
    }

    const toolCalls: ToolCallRecord[] = pendingToolCalls.map((tc, callIndex) => ({
      id: generateToolCallId(recordId, tc.name, tc.ts, callIndex),
      recordId,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    }))

    return { record, toolCalls }
  }

  finalize(): ParseResult[] {
    this.pendingToolCallsByLoopId.clear()
    return []
  }
}
