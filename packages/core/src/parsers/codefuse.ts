import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, ToolCallRecord } from '../types.js'
import { generateRecordId, generateToolCallId, generateOrphanToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost, resolvePrice } from '../pricing.js'

interface PendingToolCall {
  name: string
  ts: number
}

interface UsageParts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function timestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) return asNumber < 1e12 ? asNumber * 1000 : asNumber
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeModel(value: unknown): string {
  let raw: unknown = value
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    raw = obj.id || obj.display_name || obj.displayName
  }
  if (typeof raw !== 'string') return 'unknown'
  let model = raw.trim()
  if (!model) return 'unknown'
  model = model
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\[\d+m\]$/g, '')
    .trim()
  const slash = model.lastIndexOf('/')
  if (slash >= 0) model = model.slice(slash + 1)
  return model ? model.toLowerCase() : 'unknown'
}

function totalTokens(usage: UsageParts): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.thinkingTokens
}

function usageFromCcMessage(parsed: any): UsageParts | null {
  if (parsed?.type !== 'assistant') return null
  const usage = parsed?.message?.usage
  if (!usage || typeof usage !== 'object') return null
  return {
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    cacheReadTokens: num(usage.cache_read_input_tokens),
    cacheWriteTokens: num(usage.cache_creation_input_tokens),
    thinkingTokens: num(usage.thinking_tokens),
  }
}

function usageFromNative(parsed: any): UsageParts | null {
  if (parsed?.type !== 'assistant') return null
  const usage = parsed?.usage
  if (!usage || typeof usage !== 'object') return null
  const cachedTokens = num(usage.cachedTokens)
  const promptTokens = num(usage.promptTokens)
  return {
    inputTokens: Math.max(0, promptTokens - cachedTokens),
    outputTokens: num(usage.completionTokens),
    cacheReadTokens: cachedTokens,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
  }
}

function usageFromCodexPayload(payload: any): UsageParts | null {
  const usage = payload?.last_token_usage ?? payload?.info?.last_token_usage
  if (!usage || typeof usage !== 'object') return null
  return {
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    cacheReadTokens: num(usage.cached_input_tokens),
    cacheWriteTokens: 0,
    thinkingTokens: num(usage.reasoning_output_tokens),
  }
}

function storedToolName(block: any): string | null {
  if (block?.name === 'Skill') {
    const raw = block.input?.skill ?? block.input?.skillName ?? block.input?.name ?? ''
    const skillArg = typeof raw === 'string' ? raw.trim() : ''
    return skillArg ? `skill__${skillArg}` : 'skill__unknown'
  }
  const rawName: string = block?.name ?? block?.toolName ?? ''
  const cleanName = rawName.replace(/[=:"'{\[\s].*$/s, '').replace(/[^a-zA-Z0-9_-]/g, '')
  return cleanName || null
}

function extractToolCalls(parsed: any, recordId: string, recordTs: number): ToolCallRecord[] {
  const blocks = Array.isArray(parsed?.message?.content) ? parsed.message.content : []
  const toolCalls: ToolCallRecord[] = []
  let callIndex = 0
  for (const block of blocks) {
    if (block?.type !== 'tool_use' && block?.type !== 'tool-call') continue
    const name = storedToolName(block)
    if (!name) {
      callIndex++
      continue
    }
    toolCalls.push({
      id: generateToolCallId(recordId, name, recordTs, callIndex),
      recordId,
      name,
      ts: recordTs,
      callIndex,
    })
    callIndex++
  }
  return toolCalls
}

export class CodeFuseParser implements Parser {
  readonly tool = 'codefuse' as const
  private pendingToolCalls: PendingToolCall[] = []
  private currentModel: string | null = null

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    const turnCtx = parsed.type === 'turn_context' ? parsed.payload : undefined
    if (turnCtx?.model) this.currentModel = turnCtx.model

    const payload = parsed.event_msg?.payload
      ?? (parsed.type === 'event_msg' || parsed.type === 'response_item' ? parsed.payload : undefined)

    if (payload?.type === 'turn_context' && payload.model) this.currentModel = payload.model
    if (payload?.type === 'function_call') {
      const rawTs = parsed.event_msg?.timestamp ?? parsed.timestamp ?? context.now
      this.pendingToolCalls.push({
        name: payload.name ?? payload.function?.name ?? 'unknown',
        ts: timestamp(rawTs, context.now),
      })
      return null
    }

    if (payload?.type === 'token_count') {
      return this.parseCodexTokenCount(parsed, payload, context)
    }

    const ccUsage = usageFromCcMessage(parsed)
    if (ccUsage) {
      return this.buildRecord({
        parsed,
        context,
        usage: ccUsage,
        model: normalizeModel(parsed.message?.model),
        rawTs: parsed.message?.timestamp ?? parsed.timestamp,
        idSeed: typeof parsed.uuid === 'string' && parsed.uuid ? `codefuse:${parsed.uuid}` : null,
        sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : context.sessionId,
        toolCallsSource: parsed,
      })
    }

    const nativeUsage = usageFromNative(parsed)
    if (nativeUsage) {
      return this.buildRecord({
        parsed,
        context,
        usage: nativeUsage,
        model: normalizeModel(parsed.modelId ?? parsed.model),
        rawTs: parsed.startTime ?? parsed.timestamp,
        idSeed: typeof parsed.uuid === 'string' && parsed.uuid ? `codefuse:${parsed.uuid}` : null,
        sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId ? parsed.sessionId : context.sessionId,
        toolCallsSource: parsed,
      })
    }

    return null
  }

  finalize(): ParseResult[] {
    const pendingToolCalls = this.pendingToolCalls
    this.pendingToolCalls = []
    this.currentModel = null

    if (pendingToolCalls.length === 0) return []
    const toolCalls: ToolCallRecord[] = pendingToolCalls.map((tc, callIndex) => ({
      id: generateOrphanToolCallId(this.tool, tc.name, tc.ts, callIndex),
      recordId: null,
      tool: this.tool,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    } as ToolCallRecord & { tool: 'codefuse' }))
    return [{ record: null, toolCalls }]
  }

  private parseCodexTokenCount(parsed: any, payload: any, context: ParseContext): ParseResult | null {
    const usage = usageFromCodexPayload(payload)
    if (!usage) return null
    const result = this.buildRecord({
      parsed,
      context,
      usage,
      model: normalizeModel(payload.model ?? parsed.model ?? this.currentModel),
      rawTs: parsed.event_msg?.timestamp ?? parsed.timestamp,
      idSeed: null,
      sessionId: context.sessionId,
      toolCallsSource: parsed,
    })
    if (!result?.record) return result

    const recordId = result.record.id
    const pendingToolCalls: ToolCallRecord[] = this.pendingToolCalls.map((tc, callIndex) => ({
      id: generateToolCallId(recordId, tc.name, tc.ts, callIndex),
      recordId,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    }))
    this.pendingToolCalls = []
    return { record: result.record, toolCalls: pendingToolCalls }
  }

  private buildRecord(options: {
    parsed: any
    context: ParseContext
    usage: UsageParts
    model: string
    rawTs: unknown
    idSeed: string | null
    sessionId: string
    toolCallsSource: any
  }): ParseResult | null {
    const { context, usage } = options
    if (options.model === '<synthetic>') return null
    if (totalTokens(usage) === 0) return null

    const model = options.model || 'unknown'
    const provider = inferProvider(model)
    const hasPrice = model !== 'unknown' && resolvePrice(model) != null
    const cost = hasPrice ? calculateCost(model, usage, context.exchangeRate) : 0
    const recordTs = timestamp(options.rawTs, context.now)
    const recordId = options.idSeed
      ? generateRecordId(context.deviceInstanceId, options.idSeed, 0)
      : generateRecordId(context.deviceInstanceId, context.sourceFile, context.lineOffset)

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
      sessionId: options.sessionId,
      sourceFile: context.sourceFile,
      device: context.device,
      deviceInstanceId: context.deviceInstanceId,
      platform: context.platform,
    }

    return { record, toolCalls: extractToolCalls(options.toolCallsSource, recordId, recordTs) }
  }
}
