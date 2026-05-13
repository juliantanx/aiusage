import type { Parser, ParseResult, ParseContext } from '../types.js'
import type { StatsRecord, ToolCallRecord, Tool } from '../types.js'
import { generateRecordId, generateToolCallId } from '../record-id.js'
import { inferProvider } from '../provider.js'
import { calculateCost } from '../pricing.js'

export class OpenClawParser implements Parser {
  readonly tool: Tool = 'openclaw'

  parseLine(line: string, context: ParseContext): ParseResult | null {
    let parsed: any
    try {
      parsed = JSON.parse(line)
    } catch {
      return null
    }

    // Skip lines without message.usage
    if (!parsed.message?.usage) return null

    const usage = parsed.message.usage
    const model = parsed.message.model ?? 'unknown'
    const rawTs = parsed.message.timestamp ?? context.now
    // Normalize timestamp to ISO string (OpenClaw stores Unix ms)
    const ts = typeof rawTs === 'number' ? new Date(rawTs).toISOString() : rawTs

    const inputTokens = usage.input ?? 0
    const outputTokens = usage.output ?? 0
    const cacheReadTokens = usage.cacheRead ?? 0
    const cacheWriteTokens = usage.cacheWrite ?? 0
    const thinkingTokens = 0 // OpenClaw doesn't provide thinking tokens

    // Cost handling: usage.cost can be an object {total, input, output, ...} or a number
    let cost: number
    let costSource: 'log' | 'pricing' | 'unknown'

    if (usage.cost != null && typeof usage.cost === 'object') {
      cost = usage.cost.total ?? 0
      costSource = 'log'
    } else if (typeof usage.cost === 'number') {
      cost = usage.cost
      costSource = 'log'
    } else if (model === 'unknown') {
      cost = 0
      costSource = 'unknown'
    } else {
      cost = calculateCost(model, {
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        thinkingTokens,
      })
      costSource = 'pricing'
    }

    // Provider: use message.provider if available, otherwise infer
    const provider = parsed.message.provider ?? inferProvider(model)

    const record: StatsRecord = {
      id: generateRecordId(context.sourceFile, context.lineOffset),
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
      platform: context.platform,
    }

    // Extract tool calls from message.content
    const toolCalls: ToolCallRecord[] = []
    if (Array.isArray(parsed.message.content)) {
      let callIndex = 0
      for (const block of parsed.message.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: generateToolCallId(record.id, block.name, ts, callIndex),
            recordId: record.id,
            name: block.name,
            ts,
            callIndex,
          })
          callIndex++
        }
      }
    }

    return { record, toolCalls }
  }
}
