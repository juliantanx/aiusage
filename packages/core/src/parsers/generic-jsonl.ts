import type { Parser, ParseContext, ParseResult, StatsRecord, Tool, ToolCallRecord } from '../types.js'
import { generateRecordId, generateToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost, resolvePrice } from '../pricing.js'

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function ts(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function lastPathSegment(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  return trimmed.includes('/') ? (trimmed.split('/').pop() || trimmed) : trimmed
}

function sanitizeModel(value: unknown, fallback: string): string {
  const model = lastPathSegment(value)
  return model || fallback
}

interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
}

/**
 * CodeBuddy CLI logs usage under both `message.usage` (Anthropic-shaped field names
 * but with OpenAI-style semantics — `input_tokens` INCLUDES cached tokens) and
 * `providerData.rawUsage` (clean prompt_cache_hit/miss decomposition). The generic
 * extractor assumes Anthropic semantics (input excludes cache), so it double-counts
 * the cached tokens. Prefer rawUsage; otherwise subtract cache reads from input.
 */
function codeBuddyUsage(parsed: any): Usage | null {
  const ru = parsed?.providerData?.rawUsage
  if (ru && typeof ru === 'object') {
    const hit = num(ru.prompt_cache_hit_tokens ?? ru.prompt_tokens_details?.cached_tokens)
    const miss = ru.prompt_cache_miss_tokens
    const prompt = num(ru.prompt_tokens ?? ru.input_tokens)
    return {
      inputTokens: miss != null ? num(miss) : Math.max(0, prompt - hit),
      outputTokens: num(ru.completion_tokens ?? ru.output_tokens),
      cacheReadTokens: hit,
      cacheWriteTokens: num(ru.prompt_cache_write_tokens ?? ru.cache_creation_input_tokens),
      thinkingTokens: num(ru.completion_thinking_tokens ?? ru.completion_tokens_details?.reasoning_tokens),
    }
  }

  const mu = parsed?.message?.usage
  if (mu && typeof mu === 'object') {
    const cacheRead = num(mu.cache_read_input_tokens ?? mu.prompt_tokens_details?.cached_tokens)
    const rawInput = num(mu.input_tokens ?? mu.prompt_tokens)
    return {
      inputTokens: Math.max(0, rawInput - cacheRead),
      outputTokens: num(mu.output_tokens ?? mu.completion_tokens),
      cacheReadTokens: cacheRead,
      cacheWriteTokens: num(mu.cache_creation_input_tokens ?? mu.cache_write_input_tokens),
      thinkingTokens: num(mu.thinking_tokens ?? mu.reasoning_tokens),
    }
  }

  return null
}

function usageFromAny(parsed: any, tool?: Tool): Usage | null {
  if (tool === 'codebuddy') {
    const cb = codeBuddyUsage(parsed)
    if (cb) return cb
  }

  const usage =
    parsed?.message?.usage
    ?? parsed?.usage
    ?? parsed?.event?.usage
    ?? parsed?.payload?.token_usage
    ?? parsed?.message?.payload?.token_usage
    ?? parsed?.providerData?.rawUsage
    ?? parsed?.data?.usage

  if (!usage || typeof usage !== 'object') return null

  const details = usage.prompt_tokens_details ?? usage.input_tokens_details ?? {}
  const cachedFromDetails = num(details.cached_tokens)
  const rawInput =
    usage.input_tokens
    ?? usage.input
    ?? usage.prompt_tokens
    ?? usage.input_other
    ?? usage.tokensIn
    ?? 0
  const cacheRead = num(
    usage.cache_read_input_tokens
    ?? usage.cache_read_tokens
    ?? usage.input_cache_read
    ?? usage.cacheReads
    ?? usage.cacheRead
    ?? cachedFromDetails,
  )

  return {
    inputTokens: Math.max(0, num(rawInput) - cachedFromDetails),
    outputTokens: num(usage.output_tokens ?? usage.output ?? usage.completion_tokens ?? usage.tokensOut),
    cacheReadTokens: cacheRead,
    cacheWriteTokens: num(
      usage.cache_creation_input_tokens
      ?? usage.cache_write_input_tokens
      ?? usage.cache_write_tokens
      ?? usage.input_cache_creation
      ?? usage.cacheWrites
      ?? usage.cacheWrite,
    ),
    thinkingTokens: num(
      usage.thinking_tokens
      ?? usage.reasoning_tokens
      ?? usage.reasoning_output_tokens
      ?? details.reasoning_tokens,
    ),
  }
}

function shouldAccept(tool: Tool, parsed: any): boolean {
  if (tool === 'kimi') {
    return parsed?.message?.type === 'StatusUpdate'
      || parsed?.type === 'step.end'
      || (parsed?.type === 'context.append_loop_event' && parsed?.event?.type === 'step.end')
  }
  if (tool === 'codebuddy') {
    return parsed?.type === 'message' && parsed?.role === 'assistant'
  }
  if (tool === 'omp' || tool === 'pi') {
    return parsed?.message?.role === 'assistant' || parsed?.role === 'assistant'
  }
  if (tool === 'antigravity') {
    return parsed?.type === 'response' || parsed?.type === 'planner_response' || parsed?.usage
  }
  return true
}

function extractToolCalls(parsed: any, recordId: string, recordTs: number): ToolCallRecord[] {
  const blocks = Array.isArray(parsed?.message?.content) ? parsed.message.content : []
  const out: ToolCallRecord[] = []
  let callIndex = 0
  for (const block of blocks) {
    if (block?.type !== 'tool_use') continue
    const name = typeof block.name === 'string' && block.name.trim() ? block.name.trim() : 'unknown'
    out.push({
      id: generateToolCallId(recordId, name, recordTs, callIndex),
      recordId,
      name,
      ts: recordTs,
      callIndex,
    })
    callIndex++
  }
  return out
}

export class GenericJsonlParser implements Parser {
  readonly tool: Tool
  private readonly fallbackModel: string

  constructor(tool: Tool, fallbackModel?: string) {
    this.tool = tool
    this.fallbackModel = fallbackModel ?? `${tool}-unknown`
  }

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    const normalized = parsed?.type === 'context.append_loop_event' && parsed.event ? { ...parsed.event, time: parsed.time } : parsed
    if (!shouldAccept(this.tool, normalized)) return null

    const usage = usageFromAny(normalized, this.tool)
    if (!usage) return null
    const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.thinkingTokens
    if (total === 0) return null

    const model = sanitizeModel(
      normalized?.model
      ?? normalized?.modelAlias
      ?? normalized?.message?.model
      ?? normalized?.providerData?.model
      ?? normalized?.providerData?.modelId
      ?? normalized?.payload?.model
      ?? normalized?.data?.model,
      this.fallbackModel,
    )
    const provider = typeof normalized?.provider === 'string' && normalized.provider.trim()
      ? normalized.provider.trim()
      : inferProvider(model)
    const recordTs = ts(
      normalized?.timestamp
      ?? normalized?.ts
      ?? normalized?.time
      ?? normalized?.message?.timestamp
      ?? normalized?.payload?.timestamp,
      context.now,
    )
    const recordId = generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset)
    const hasPrice = resolvePrice(model) != null
    const cost = hasPrice ? calculateCost(model, usage, context.exchangeRate) : 0

    const record: StatsRecord = {
      id: recordId,
      ts: recordTs,
      ingestedAt: context.now,
      updatedAt: context.now,
      lineOffset: context.lineOffset,
      tool: this.tool,
      model,
      provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      thinkingTokens: usage.thinkingTokens,
      cost,
      costSource: hasPrice ? 'pricing' : 'unknown',
      sessionId: context.sessionId,
      sourceFile: context.sourceFile,
      device: context.device,
      deviceInstanceId: context.deviceInstanceId,
      platform: context.platform,
    }

    return { record, toolCalls: extractToolCalls(normalized, recordId, recordTs) }
  }
}
