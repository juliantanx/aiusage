import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateToolCallId, generateOrphanToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

interface PendingToolCall {
  name: string
  ts: number
}

export class CodexParser implements Parser {
  readonly tool: Tool = 'codex'
  private pendingToolCalls: PendingToolCall[] = []

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    const payload = parsed.event_msg?.payload
    if (!payload) return null

    // Skip non-token_count/function_call lines
    if (payload.type !== 'token_count' && payload.type !== 'function_call') return null

    // Store function_call as pending
    if (payload.type === 'function_call') {
      this.pendingToolCalls.push({
        name: payload.function?.name ?? 'unknown',
        ts: parsed.event_msg.timestamp ?? context.now,
      })
      return null
    }

    // Process token_count
    if (!payload.last_token_usage) {
      return null
    }

    const usage = payload.last_token_usage
    const model = payload.model ?? 'unknown'
    const ts = parsed.event_msg.timestamp ?? context.now

    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheReadTokens = usage.cached_input_tokens ?? 0
    const thinkingTokens = usage.reasoning_output_tokens ?? 0
    const cacheWriteTokens = 0 // Codex doesn't provide this

    const cost = model === 'unknown' ? 0 : calculateCost(model, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens,
    })

    const costSource = model === 'unknown' ? 'unknown' as const : 'pricing' as const
    const provider = inferProvider(model)

    const recordId = generateRecordId(context.sourceFile, context.lineOffset)

    const record: StatsRecord = {
      id: recordId,
      ts,
      ingestedAt: context.now,
      updatedAt: context.now,
      lineOffset: context.lineOffset,
      tool: this.tool,
      model,
      provider,
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
    }

    // Associate pending tool calls
    const toolCalls: ToolCallRecord[] = this.pendingToolCalls.map((tc, callIndex) => ({
      id: generateToolCallId(recordId, tc.name, tc.ts, callIndex),
      recordId,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    }))

    // Clear pending queue
    this.pendingToolCalls = []

    return { record, toolCalls }
  }

  finalize(): ParseResult[] {
    // Handle orphan tool calls (no subsequent token_count)
    if (this.pendingToolCalls.length === 0) return []

    const toolCalls: ToolCallRecord[] = this.pendingToolCalls.map((tc, callIndex) => ({
      id: generateOrphanToolCallId(this.tool, tc.name, tc.ts, callIndex),
      recordId: null,
      name: tc.name,
      ts: tc.ts,
      callIndex,
    }))

    this.pendingToolCalls = []

    return [{ record: null as any, toolCalls }]
  }
}
